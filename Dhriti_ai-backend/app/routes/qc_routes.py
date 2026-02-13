from uuid import UUID
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app import database
from app.models.project_task import ProjectTask
from app.models.task_annotation import TaskAnnotation
from app.routes.protected import get_current_user
from app.schemas.enums import TaskStatus
from app.schemas.token import TokenData

router = APIRouter(prefix="/qc", tags=["Quality Control"])


class QCFeedback(BaseModel):
    feedback: Optional[str] = None

class BulkTaskAction(BaseModel):
    task_ids: List[UUID]
    feedback: Optional[str] = None # For bulk reject


def require_admin_or_reviewer(current_user: TokenData = Depends(get_current_user)) -> TokenData:
    if current_user.role not in ["admin", "reviewer"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin or reviewer access required for QC actions.",
        )
    return current_user


@router.post("/tasks/{task_id}/accept", status_code=status.HTTP_204_NO_CONTENT)
def accept_task_qc(
    task_id: UUID,
    _: TokenData = Depends(require_admin_or_reviewer),
    db: Session = Depends(database.get_db),
):
    """Marks a submitted task as accepted by Quality Control."""
    task = db.query(ProjectTask).filter(ProjectTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found.")

    if task.status != TaskStatus.SUBMITTED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot accept a task with status '{task.status}'. Must be 'submitted'.",
        ) # TaskStatus.SUBMITTED is now the state for "ready for QC"

    task.status = TaskStatus.QC_ACCEPTED
    db.commit()


@router.post("/tasks/{task_id}/reject", status_code=status.HTTP_204_NO_CONTENT)
def reject_task_qc(
    task_id: UUID,
    payload: QCFeedback,
    _: TokenData = Depends(require_admin_or_reviewer),
    db: Session = Depends(database.get_db),
):
    """Marks a submitted task as rejected by Quality Control and provides feedback."""
    task = db.query(ProjectTask).filter(ProjectTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found.")

    if task.status != TaskStatus.SUBMITTED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot reject a task with status '{task.status}'. Must be 'submitted'.",
        ) # TaskStatus.SUBMITTED is now the state for "ready for QC"

    task.status = TaskStatus.QC_REJECTED

    # Optionally, you can store the feedback. Here we'll add it to the annotation.
    annotation = db.query(TaskAnnotation).filter(TaskAnnotation.task_id == task.task_id).order_by(TaskAnnotation.submitted_at.desc()).first()
    if annotation and payload.feedback:
        if not isinstance(annotation.annotations, dict):
            annotation.annotations = {} # Ensure it's a dict
        annotation.annotations['qc_feedback'] = payload.feedback

    db.commit()


@router.post("/tasks/{task_id}/rework", status_code=status.HTTP_204_NO_CONTENT)
def send_task_for_rework(
    task_id: UUID,
    _: TokenData = Depends(require_admin_or_reviewer),
    db: Session = Depends(database.get_db),
):
    """Sends a QC-rejected task back to the annotator for rework."""
    task = db.query(ProjectTask).filter(ProjectTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found.")

    if task.status != TaskStatus.QC_REJECTED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot send task for rework. Status must be 'qc_rejected', but is '{task.status}'.",
        )

    task.status = TaskStatus.REWORK
    db.commit()


@router.post("/tasks/bulk-accept", status_code=status.HTTP_204_NO_CONTENT)
def bulk_accept_tasks_qc(
    payload: BulkTaskAction,
    _: TokenData = Depends(require_admin_or_reviewer),
    db: Session = Depends(database.get_db),
):
    """Bulk accepts multiple submitted tasks by Quality Control."""
    if not payload.task_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No task IDs provided.")

    tasks = db.query(ProjectTask).filter(ProjectTask.id.in_(payload.task_ids)).all()
    if len(tasks) != len(payload.task_ids):
        found_ids = {t.id for t in tasks}
        missing_ids = [str(tid) for tid in payload.task_ids if tid not in found_ids]
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Some tasks not found: {', '.join(missing_ids)}")

    for task in tasks:
        if task.status != TaskStatus.SUBMITTED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Task {task.id} cannot be accepted. Status is '{task.status}', but must be 'submitted'.",
            )
        task.status = TaskStatus.QC_ACCEPTED
    db.commit()


@router.post("/tasks/bulk-reject", status_code=status.HTTP_204_NO_CONTENT)
def bulk_reject_tasks_qc(
    payload: BulkTaskAction,
    _: TokenData = Depends(require_admin_or_reviewer),
    db: Session = Depends(database.get_db),
):
    """Bulk rejects multiple submitted tasks by Quality Control and provides feedback."""
    if not payload.task_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No task IDs provided.")

    tasks = db.query(ProjectTask).filter(ProjectTask.id.in_(payload.task_ids)).all()
    if len(tasks) != len(payload.task_ids):
        found_ids = {t.id for t in tasks}
        missing_ids = [str(tid) for tid in payload.task_ids if tid not in found_ids]
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Some tasks not found: {', '.join(missing_ids)}")

    for task in tasks:
        if task.status != TaskStatus.SUBMITTED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Task {task.id} cannot be rejected. Status is '{task.status}', but must be 'submitted'.",
            )
        task.status = TaskStatus.QC_REJECTED
        # Store feedback for the latest annotation of this task
        annotation = db.query(TaskAnnotation).filter(TaskAnnotation.task_id == task.task_id).order_by(TaskAnnotation.submitted_at.desc()).first()
        if annotation and payload.feedback:
            if not isinstance(annotation.annotations, dict):
                annotation.annotations = {}
            annotation.annotations['qc_feedback'] = payload.feedback

    db.commit()

    # After bulk rejection, automatically send them for rework as per requirement 4
    # This is a separate step to ensure the QC_REJECTED status is recorded first.
    for task in tasks:
        # Re-fetch task to ensure latest status if needed, or just update in memory
        # For simplicity, we'll assume the task object is still valid for status update
        task.status = TaskStatus.REWORK
    db.commit()