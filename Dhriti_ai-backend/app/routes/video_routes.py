from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from uuid import UUID
from pydantic import BaseModel, Field
from typing import Dict, List, Optional, Any
from datetime import datetime

from app.database import get_db
from app.models.project_task import ProjectTask
from app.models.project_template import ProjectTemplate
from app.models.project import Project, ProjectAssignment
from app.models.user import User
from app.models.task_annotation import TaskAnnotation
from app.routes.protected import get_current_user
from app.schemas.token import TokenData
from app.schemas.enums import TaskStatus, ProjectStatus, AnnotationStatus

router = APIRouter(
    prefix="/video",
    tags=["Video Annotation Tasks"],
)

class TaskPayload(BaseModel):
    id: UUID
    project_id: int
    task_id: str
    task_name: str
    file_name: str
    status: str
    payload: Dict[str, Any]
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class TemplatePayload(BaseModel):
    id: UUID
    project_id: int
    name: str
    layout: List[Dict[str, Any]] = []
    rules: List[Dict[str, Any]] = []
    created_at: datetime
    updated_at: Optional[datetime] = None
    created_by: Optional[int] = None

    class Config:
        from_attributes = True

class VideoTaskResponse(BaseModel):
    task: TaskPayload
    template: Optional[TemplatePayload] = None
    annotations: Any = {}

    class Config:
        from_attributes = True

class VideoTemplateRequest(BaseModel):
    video_column: str
    labels: List[Dict[str, Any]]


@router.get("/{task_id}", response_model=VideoTaskResponse)
def get_video_task(
    task_id: UUID,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """
    Fetches a single task for the video annotation interface.
    It retrieves the task's video URL and any existing annotations.
    """
    task = db.query(ProjectTask).options(joinedload(ProjectTask.project)).filter(ProjectTask.id == task_id).first()

    if not task:
        raise HTTPException(status_code=404, detail="Task not found.")

    template = db.query(ProjectTemplate).filter(ProjectTemplate.project_id == task.project_id).order_by(ProjectTemplate.created_at.desc()).first()

    user = db.query(User).filter(User.email == current_user.email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    latest_annotation = db.query(TaskAnnotation).filter(TaskAnnotation.task_id == task.task_id, TaskAnnotation.user_id == user.id).order_by(TaskAnnotation.submitted_at.desc()).first()

    # Return the full annotation payload (which contains annotationsMap and labels)
    latest_annotation_data = latest_annotation.annotations if latest_annotation else {}

    return VideoTaskResponse(task=task, template=template, annotations=latest_annotation_data)


@router.get("/{task_id}/next", response_model=Dict[str, Any])
def get_next_video_task(
    task_id: UUID,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """
    Finds the next available task for the current user in the same project.
    """
    current_task = db.query(ProjectTask).filter(ProjectTask.id == task_id).first()
    if not current_task:
        raise HTTPException(status_code=404, detail="Current task not found")

    user = db.query(User).filter(User.email == current_user.email).first()
    
    # Find tasks already completed by this user in this project
    completed_task_ids = db.query(TaskAnnotation.task_id).filter(
        TaskAnnotation.user_id == user.id,
        TaskAnnotation.project_id == current_task.project_id
    )

    # Find next available task (NEW status, not completed by user)
    next_task = (
        db.query(ProjectTask)
        .join(Project, Project.id == ProjectTask.project_id)
        .filter(
            ProjectTask.project_id == current_task.project_id,
            ProjectTask.status == TaskStatus.NEW,
            Project.status.in_([ProjectStatus.ACTIVE, ProjectStatus.RUNNING]),
            ~ProjectTask.task_id.in_(completed_task_ids),
            ProjectTask.id != task_id 
        )
        .order_by(ProjectTask.created_at)
        .first()
    )

    if next_task:
        return {"next_task_id": next_task.id}
    
    return {"message": "No more tasks available"}


@router.post("/{task_id}/annotations", status_code=201)
def submit_video_annotations(
    task_id: UUID,
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """
    Submits annotations for a video task and updates status.
    """
    user = db.query(User).filter(User.email == current_user.email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    task = db.query(ProjectTask).filter(ProjectTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if task.status == TaskStatus.SUBMITTED:
        raise HTTPException(status_code=409, detail="Task already submitted")

    # Get template to link annotation to it
    template = db.query(ProjectTemplate).filter(ProjectTemplate.project_id == task.project_id).order_by(ProjectTemplate.created_at.desc()).first()

    annotation = TaskAnnotation(
        task_id=task.id,
        user_id=user.id,
        project_id=task.project_id,
        template_id=template.id if template else None,
        annotations=payload,
        status=AnnotationStatus.COMPLETED
    )
    db.add(annotation)

    # Update task status
    task.status = TaskStatus.SUBMITTED
    
    # Update project stats (simplified for brevity, ideally use same logic as image/text)
    project = db.query(Project).filter(Project.id == task.project_id).first()
    if project:
        project.total_tasks_completed = (project.total_tasks_completed or 0) + 1

    db.commit()
    return {"message": "Submitted successfully"}


@router.post("/{project_id}/template/")
def create_video_template(
    project_id: int,
    payload: VideoTemplateRequest,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """
    Creates or updates the project template configuration for video annotation.
    This is aligned with the text and image template generation patterns.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # 1. Define the layout: a video player and a meta block for settings
    layout = [
        {
            "id": "video_player_main",
            "type": "video",
            "props": {},
        },
        {"type": "meta", "props": {"annotation_settings": {"labels": payload.labels}}}
    ]

    # 2. Define the rules: map the video column from the payload to the video player's src
    rules = [
        {
            "component_key": "video_player_main",
            "target_prop": "src",  # The frontend will look for this
            "source_kind": "TASK_PAYLOAD",
            "source_path": payload.video_column,
        }
    ]

    creator = db.query(User).filter(User.email == current_user.email).first()

    # 3. Upsert logic: find and update, or create new
    template = db.query(ProjectTemplate).filter(ProjectTemplate.project_id == project_id).order_by(ProjectTemplate.created_at.desc()).first()

    if template:
        # Update existing template
        template.layout = layout
        template.rules = rules
        message = "Template updated successfully"
    else:
        # Create a new template
        template = ProjectTemplate(
            project_id=project_id,
            name=f"Video Template for {project.name}",
            layout=layout,
            rules=rules,
            created_by=creator.id if creator else None
        )
        db.add(template)
        message = "Template created successfully"

    db.commit()
    db.refresh(template)

    return {"message": message, "template_id": template.id}
