import csv
import io
import json
from typing import List, Optional, Dict, Any
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app import database
from app.models.project import Project, ProjectAssignment, TaskReview
from app.models.project_task import ProjectTask
from app.models.task_annotation import TaskAnnotation
from app.models.project_template import ProjectTemplate
from app.models.user import User
from app.routes.protected import get_current_user
from app.schemas.token import TokenData
from app.schemas.tasks import AnnotationResponse

class ProjectSummary(BaseModel):
    id: int
    name: str
    class Config:
        from_attributes = True

class ProjectListResponse(BaseModel):
    projects: List[ProjectSummary]

class SchemaResponse(BaseModel):
    columns: List[str]

class TemplateConfigRequest(BaseModel):
    title: Optional[str] = None
    text: str
    # Add fields for annotation settings
    labels: Optional[List[str]] = None
    colors: Optional[List[Dict[str, Any]]] = None
    sentiments: Optional[List[str]] = None
    emotions: Optional[List[str]] = None

class UploadedTask(BaseModel):
    id: str
    title: str
    text: str

class ProjectTaskResponse(BaseModel):
    id: UUID
    project_id: int
    task_id: str
    task_name: str
    file_name: str
    status: str
    payload: dict

    class Config:
        from_attributes = True

class TextTaskResponse(BaseModel):
    task: dict
    template: Optional[dict]
    annotations: List[AnnotationResponse]


router = APIRouter(prefix="/text", tags=["text_annotation"])


@router.get("/projects", response_model=ProjectListResponse)
def get_projects(category: Optional[str] = None, db: Session = Depends(database.get_db)):

    """
   
Fetches a list of projects. Can be filtered by data category.
    e.g., /text/projects?category=text
    """
    
    query = db.query(Project)
    if category:
        query = query.filter(Project.data_category == category)
    projects = query.order_by(Project.name).all()
    return {"projects": projects}

@router.get("/project/{project_id}/schema", response_model=SchemaResponse)
def get_project_schema(project_id: int, db: Session = Depends(database.get_db)):
    """
    Infers the schema (column names) for a project by inspecting the
    data of the first available task.
    """
    first_task = db.query(ProjectTask).filter(ProjectTask.project_id == project_id).first()

    if not first_task:
        # If there are no tasks, we can't infer columns. Return empty.
        return {"columns": []}

    payload = first_task.payload
    # The payload might be a string-encoded JSON, so we ensure it's a dict.
    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except json.JSONDecodeError:
            return {"columns": []} # Not valid JSON, can't get keys.

    if isinstance(payload, dict):
        return {"columns": list(payload.keys())}

    return {"columns": []}

@router.post("/project/{project_id}/template")
def create_or_update_template(
    project_id: int,
    template_config: TemplateConfigRequest,
    db: Session = Depends(database.get_db)
):
    """
    Creates or updates a project template configuration for mapping data columns,
    including annotation settings like labels and colors.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    # Group annotation settings into a single object
    annotation_settings = {
        "labels": template_config.labels or [],
        "colors": template_config.colors or [],
        "sentiments": template_config.sentiments or [],
        "emotions": template_config.emotions or [],
    }

    # Define a simple UI layout. We add the settings as a 'meta' block
    # that other annotation UIs can safely ignore.
    layout = [
        {"id": "meta_settings", "type": "meta", "props": {"annotation_settings": annotation_settings}}
    ]

    # Define the rules that map the data source to the layout components.
    rules = [
        {
            "component_key": "text_content",
            "target_prop": "text",
            "source_kind": "TASK_PAYLOAD",
            "source_path": template_config.text
        }
    ]
    if template_config.title:
        rules.append({
            "component_key": "title_display",
            "target_prop": "text",
            "source_kind": "TASK_PAYLOAD",
            "source_path": template_config.title
        })

    # Find the most recent template for this project to update it.
    existing_template = (
        db.query(ProjectTemplate)
        .filter(ProjectTemplate.project_id == project_id)
        .order_by(ProjectTemplate.created_at.desc())
        .first()
    )

    if existing_template:
        # Update the existing template
        existing_template.layout = layout
        existing_template.rules = rules
        message = "Template updated successfully"
    else:
        # Create a new template if none exists
        new_template = ProjectTemplate(
            project_id=project_id,
            name=f"Mapping for {project.name}",
            layout=layout,
            rules=rules,
        )
        db.add(new_template)
        message = "Template created successfully"

    db.commit()
    return {"message": message, "project_id": project_id}

@router.post(
    "/projects/{project_id}/next-task",
    response_model=ProjectTaskResponse,
    summary="Get the next available text task for a specific project",
)
def get_next_text_project_task(
    project_id: int,
    current_user: TokenData = Depends(get_current_user),
    db: Session = Depends(database.get_db),
):
    """
    Finds and returns the next available text task for the current user within a specific project.
    """
    user = db.query(User).filter(User.email == current_user.email).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    completed_task_ids_query = db.query(TaskAnnotation.task_id).filter(
        TaskAnnotation.user_id == user.id,
        TaskAnnotation.project_id == project_id,
    )

    available_task = (
        db.query(ProjectTask)
        .join(Project, Project.id == ProjectTask.project_id)
        .filter(
            ProjectTask.project_id == project_id,
            ProjectTask.status == "NEW",
            Project.status == "Active",
            ~ProjectTask.task_id.in_(completed_task_ids_query)
        )
        .order_by(ProjectTask.created_at)
        .first()
    )

    if not available_task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No available tasks for this project right now.")

    return available_task

@router.get("/project/{project_id}/tasks", response_model=List[UploadedTask])
def get_tasks_for_project(project_id: UUID, db: Session = Depends(database.get_db)):
    """
    Fetches all tasks for a given project ID.
    """
    tasks = db.query(ProjectTask).filter(ProjectTask.project_id == project_id).order_by(ProjectTask.created_at).all()
    return [{"id": str(task.id), "title": task.name, "text": task.data.get("text", "")} for task in tasks]


@router.post("/upload", response_model=List[UploadedTask])
async def upload_tasks_file(file: UploadFile = File(...)):
    """
    Upload a file (.txt, .json, .csv) to create annotation tasks.
    - .txt: Creates a single task from the file content.
    - .json: Parses a JSON array of objects, each with "id", "title", and "text".
    - .csv: Parses a CSV file with "title" and "text" columns.
    """
    filename = file.filename
    content = await file.read()
    new_tasks = []

    try:
        if filename.endswith(".txt"):
            new_tasks.append({
                "id": f"task-{UUID(int=0)}", # Placeholder ID, frontend can manage
                "title": filename,
                "text": content.decode("utf-8"),
            })
        elif filename.endswith(".json"):
            data = json.loads(content)
            if isinstance(data, list):
                # Case 1: List of objects or strings
                for i, item in enumerate(data):
                    if isinstance(item, str):
                        # Handle a simple list of strings
                        new_tasks.append({"id": f"task-{i}", "title": f"Task {i + 1}", "text": item})
                    elif isinstance(item, dict):
                        # Handle a list of objects with flexible keys
                        task_obj = item.get("task") if "task" in item and isinstance(item.get("task"), dict) else item
                        text = task_obj.get("text") or task_obj.get("content")
                        title = task_obj.get("title") or task_obj.get("id") or f"Task {i + 1}"
                        if text:
                            new_tasks.append({"id": task_obj.get("id", f"task-{i}"), "title": title, "text": text})
            elif isinstance(data, dict):
                # Case 2: A single object
                task_obj = data.get("task") if "task" in data and isinstance(data.get("task"), dict) else data
                text = task_obj.get("text") or task_obj.get("content")
                
                if text: # It's a single task object
                    title = task_obj.get("title") or task_obj.get("id") or filename
                    new_tasks.append({"id": task_obj.get("id", "task-0"), "title": title, "text": text})
                else: # Assume it's a dictionary of id -> text
                    for i, (key, value) in enumerate(data.items()):
                        if isinstance(value, str):
                            new_tasks.append({"id": f"task-{i}", "title": key, "text": value})
                        elif isinstance(value, dict) and (value.get("text") or value.get("content")):
                             # Handle nested objects like { "task1": { "text": "..." } }
                            text = value.get("text") or value.get("content")
                            title = value.get("title") or key
                            new_tasks.append({"id": f"task-{i}", "title": title, "text": text})
            
            if not new_tasks:
                raise HTTPException(status_code=400, detail="Could not parse any tasks from the JSON file. Please check the format.")
        elif filename.endswith(".csv"):
            decoded_content = content.decode("utf-8")
            csv_reader = csv.DictReader(io.StringIO(decoded_content))
            for i, row in enumerate(csv_reader):
                if "title" not in row or "text" not in row:
                    raise HTTPException(status_code=400, detail="CSV must have 'title' and 'text' columns.")
                new_tasks.append({
                    "id": f"task-{i}",
                    "title": row["title"],
                    "text": row["text"],
                })
        else:
            raise HTTPException(status_code=400, detail="Unsupported file type. Please upload .txt, .json, or .csv")

        return new_tasks
    except HTTPException as e:
        # Re-raise HTTPException to prevent it from being caught by the generic exception handler
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")


@router.get("/{task_id}", response_model=TextTaskResponse)
def get_text_task(
    task_id: UUID,
    current_user: TokenData = Depends(get_current_user),
    db: Session = Depends(database.get_db),
):
    """ 
    Fetches a single text task by its UUID, along with its project template
    and any existing annotations for the current user.
    """
    task = db.query(ProjectTask).filter(ProjectTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    # Find the latest template for this task's project
    template = (
        db.query(ProjectTemplate)
        .filter(ProjectTemplate.project_id == task.project_id)
        .order_by(ProjectTemplate.created_at.desc())
        .first()
    )

    # Find existing annotations for this task by the current user
    annotations = (
        db.query(TaskAnnotation)
        .filter(TaskAnnotation.task_id == task.task_id, TaskAnnotation.user_id == current_user.user_id)
        .all()
    )

    return {
        "task": task.to_dict(),
        "template": template.to_dict() if template else None,
        "annotations": [AnnotationResponse.from_orm(ann).model_dump() for ann in annotations],
    }