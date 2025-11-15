from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import database
from app.models.project_task import ProjectTask
from app.models.task_annotation import TaskAnnotation
from app.models.project_template import ProjectTemplate
from app.routes.protected import get_current_user
from app.schemas.token import TokenData
from app.schemas.tasks import AnnotationResponse


class ImageTaskResponse(BaseModel):
    task: dict
    template: Optional[dict]
    annotations: List[AnnotationResponse]


router = APIRouter(prefix="/image", tags=["image_annotation"])


@router.get("/{task_id}", response_model=ImageTaskResponse)
def get_image_task(
    task_id: UUID,
    current_user: TokenData = Depends(get_current_user),
    db: Session = Depends(database.get_db),
):
    """
    Fetches a single task by its UUID, along with its project template
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
        "annotations": annotations,
    }