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
    prefix="/tasks/video",
    tags=["Video Annotation Tasks"],
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
    labels: Optional[List[Dict[str, Any]]] = None

    class Config:
        from_attributes = True

class VideoTaskResponse(BaseModel):
    task: TaskPayload
    template: Optional[TemplatePayload] = None
    annotations: List[Any] = []

    class Config:
        from_attributes = True


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

    latest_annotation = db.query(TaskAnnotation).filter(TaskAnnotation.task_id == task.id, TaskAnnotation.user_id == user.id).order_by(TaskAnnotation.submitted_at.desc()).first()

    latest_annotation_data = latest_annotation.annotations.get("annotations", []) if latest_annotation and isinstance(latest_annotation.annotations, dict) else []

    return VideoTaskResponse(task=task, template=template, annotations=latest_annotation_data)
