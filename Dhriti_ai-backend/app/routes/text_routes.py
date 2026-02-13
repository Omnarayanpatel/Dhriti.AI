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
from app.schemas.enums import AnnotationStatus, ProjectStatus, TaskStatus
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

# This model now correctly mirrors the flat structure sent by the frontend.
class TextAnnotationCreate(BaseModel):
    task_id: str
    project_id: int
    template_id: Optional[UUID] = None
    annotations: List[Dict[str, Any]]
    meta: Optional[Dict[str, Any]] = None


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
            ProjectTask.status == TaskStatus.NEW,
            Project.status.in_([ProjectStatus.ACTIVE, ProjectStatus.RUNNING]),
            ~ProjectTask.task_id.in_(completed_task_ids_query)
        )
        .order_by(ProjectTask.created_at)
        .first()
    )

    if not available_task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No available tasks for this project right now.")

    return available_task

# @router.post(
#     "/{task_id}/annotations",
#     response_model=AnnotationResponse,
#     status_code=status.HTTP_201_CREATED,
#     summary="Submit annotations for a text task",
# )
# def submit_text_task_annotations(
#     task_id: str,
#     payload: TextAnnotationCreate,
#     current_user: TokenData = Depends(get_current_user),
#     db: Session = Depends(database.get_db),
# ):
#     """Handles submission from the dedicated text annotation tool."""
#     user = db.query(User).filter(User.email == current_user.email).first()
#     if not user:
#         raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

#     # Ensure the task ID in the URL matches the one in the payload
#     if str(task_id) != str(payload.task_id):
#         raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Task ID mismatch in URL and payload.")

#     # Check if an annotation for this task by this user already exists
#     existing_annotation = db.query(TaskAnnotation).filter(
#         TaskAnnotation.task_id == payload.task_id,
#         TaskAnnotation.user_id == user.id,
#         TaskAnnotation.project_id == payload.project_id
#     ).first()
#     if existing_annotation:
#         raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="You have already submitted this task.")

#     # Combine the 'annotations' list and 'meta' object into a single
#     # dictionary to be stored in the JSONB 'annotations' column.
#     combined_annotations = {
#         "annotations": payload.annotations,
#         "meta": payload.meta or {},
#     }
#     annotation = TaskAnnotation(
#         task_id=payload.task_id,
#         user_id=user.id,
#         project_id=payload.project_id,
#         template_id=payload.template_id,
#         annotations=combined_annotations,
#         status="completed",
#     )
#     db.add(annotation)

#     # Update the ProjectTask status to 'submitted'
#     # It's safer to filter by project_id as well to avoid ambiguity
#     task = db.query(ProjectTask).filter(
#         ProjectTask.project_id == payload.project_id,
#         ProjectTask.task_id == payload.task_id
#     ).first()
#     if task:
#         task.status = "submitted"
#     else:
#         # If the task isn't found, we should not proceed with saving the annotation.
#         db.rollback()
#         raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="The specified task does not exist in this project.")

#     # Update project and assignment counts. This logic is crucial for dashboard stats.
#     # Using a transaction ensures that if any part fails, all changes are rolled back.
#     try:
#         project = db.query(Project).filter(Project.id == payload.project_id).with_for_update().one()
#         project.total_tasks_completed = (project.total_tasks_completed or 0) + 1

#         assignment = db.query(ProjectAssignment).filter(
#             ProjectAssignment.project_id == payload.project_id,
#             ProjectAssignment.user_id == user.id
#         ).with_for_update().first()

#         if assignment:
#             assignment.completed_tasks = (assignment.completed_tasks or 0) + 1
#             assignment.pending_tasks = max(0, (assignment.total_task_assign or 0) - assignment.completed_tasks)
#     except Exception as e:
#         db.rollback()
#         raise HTTPException(status_code=500, detail=f"Failed to update project statistics: {e}")

#     db.commit()
#     db.refresh(annotation)
#     return annotation

@router.post(
    "/{task_id}/annotations",
    response_model=AnnotationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Submit annotations for a text task",
)
def submit_text_task_annotations(
    task_id: UUID,
    payload: TextAnnotationCreate,
    current_user: TokenData = Depends(get_current_user),
    db: Session = Depends(database.get_db),
):
    """Handles submission from the dedicated text annotation tool."""
    user = db.query(User).filter(User.email == current_user.email).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Find the task using its primary key (UUID)
    task = db.query(ProjectTask).filter(ProjectTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="The specified task does not exist.")

    # Validate that the payload project_id matches the task's project_id
    if task.project_id != payload.project_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Project ID mismatch.")

    # Check if an annotation for this task by this user already exists
    existing_annotation = db.query(TaskAnnotation).filter(
        TaskAnnotation.task_id == task.task_id, # Use the string task_id from the fetched task
        TaskAnnotation.user_id == user.id,
        TaskAnnotation.project_id == payload.project_id
    ).first()
    if existing_annotation:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="You have already submitted this task.")

    # Find the latest template for this task's project to ensure template_id is not null.
    template = (
        db.query(ProjectTemplate)
        .filter(ProjectTemplate.project_id == task.project_id)
        .order_by(ProjectTemplate.created_at.desc())
        .first()
    )
    template_id_to_use = payload.template_id or (template.id if template else None)

    # Combine annotations and meta into a single JSONB payload
    combined_annotations = {
        "annotations": payload.annotations,
        "meta": payload.meta or {},
    }

    annotation = TaskAnnotation(
        task_id=task.task_id, # Use the string task_id from the fetched task
        user_id=user.id,
        project_id=payload.project_id,
        template_id=template_id_to_use,
        annotations=combined_annotations,
        status=AnnotationStatus.COMPLETED,
    )
    db.add(annotation)

    # Update task status and project statistics in a transaction
    task.status = TaskStatus.SUBMITTED # Task is now ready for QC (as per enum definition)
    try:
        project = db.query(Project).filter(Project.id == payload.project_id).with_for_update().one()
        project.total_tasks_completed = (project.total_tasks_completed or 0) + 1

        assignment = db.query(ProjectAssignment).filter(
            ProjectAssignment.project_id == payload.project_id,
            ProjectAssignment.user_id == user.id
        ).with_for_update().first()

        if assignment:
            assignment.completed_tasks = (assignment.completed_tasks or 0) + 1
            assignment.pending_tasks = max(0, (assignment.total_task_assign or 0) - assignment.completed_tasks)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update project statistics: {str(e)}")

    db.commit()
    db.refresh(annotation)
    return annotation

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