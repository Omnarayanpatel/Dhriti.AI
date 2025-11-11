from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from uuid import UUID
from pydantic import BaseModel, Field
from typing import Dict, List, Optional, Any

from app.database import get_db
from app.models.project_task import ProjectTask
from app.models.project_template import ProjectTemplate
from app.models.user import User
from app.models.task_annotation import TaskAnnotation
from app.routes.protected import get_current_user
from app.schemas.token import TokenData

router = APIRouter(
    prefix="/tasks/image",
    tags=["Image Annotation Tasks"],
)

class TaskPayload(BaseModel):
    id: UUID
    payload: Dict[str, Any]
    project_id: int

    class Config:
        from_attributes = True

class TemplatePayload(BaseModel):
    id: UUID
    layout: List[Dict[str, Any]]

    class Config:
        from_attributes = True

class ImageTaskResponse(BaseModel):
    task: TaskPayload
    template: Optional[TemplatePayload] = None
    annotations: List[Any] = []

    class Config:
        from_attributes = True


@router.get("/{task_id}", response_model=ImageTaskResponse)
def get_image_task(
    task_id: UUID,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """
    Fetches a single task for the image annotation interface.
    It retrieves the task's image URL and any existing annotations.
    """
    # Fetch the task and eagerly load the associated project
    task = db.query(ProjectTask).options(joinedload(ProjectTask.project)).filter(ProjectTask.id == task_id).first()

    if not task:
        raise HTTPException(status_code=404, detail="Task not found.")

    # Find the most recent template for this task's project
    template = (
        db.query(ProjectTemplate)
        .filter(ProjectTemplate.project_id == task.project_id)
        .order_by(ProjectTemplate.created_at.desc())
        .first()
    )

    # Fetch the user from the database using the email from the token
    user = db.query(User).filter(User.email == current_user.email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    # Extract the latest annotation data if it exists.
    # Annotations are in the 'task_annotations' table.
    latest_annotation_data = []
    latest_annotation = (
        db.query(TaskAnnotation)
        .filter(TaskAnnotation.task_id == task.task_id, TaskAnnotation.user_id == user.id)
        .order_by(TaskAnnotation.submitted_at.desc())
        .first()
    )
    if latest_annotation and isinstance(latest_annotation.annotations, dict) and "annotations" in latest_annotation.annotations:
        latest_annotation_data = latest_annotation.annotations["annotations"]

    return ImageTaskResponse(task=task, template=template, annotations=latest_annotation_data)