import json
import os
import tempfile
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from app import database
from app.models.project import Project, ProjectAssignment, TaskReview
from app.models.user import User
from app.routes.protected import get_current_user
from app.schemas.tasks import (
    AssignedProject,
    ProjectAssignmentRequest,
    ProjectAssignmentResponse,
    ProjectCreate,
    ProjectResponse,
    TaskReviewSummary,
    TasksDashboardResponse,
    TasksStats,
    UserSummary,
)
from app.schemas.token import TokenData
from tools.json_to_excel import json_to_excel

router = APIRouter(prefix="/tasks", tags=["tasks"])


def require_admin(current_user: TokenData = Depends(get_current_user)) -> TokenData:
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user


@router.get("/dashboard", response_model=TasksDashboardResponse)
def get_tasks_dashboard(
    current_user: TokenData = Depends(get_current_user),
    db: Session = Depends(database.get_db),
):
    user = db.query(User).filter(User.email == current_user.email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    reviews_avg_subquery = (
        db.query(
            TaskReview.project_id.label("project_id"),
            func.avg(TaskReview.rating).label("avg_rating"),
        )
        .filter(TaskReview.user_id == user.id)
        .group_by(TaskReview.project_id)
        .subquery()
    )

    assignment_rows = (
        db.query(
            ProjectAssignment,
            Project,
            reviews_avg_subquery.c.avg_rating,
        )
        .join(Project, ProjectAssignment.project_id == Project.id)
        .outerjoin(reviews_avg_subquery, reviews_avg_subquery.c.project_id == Project.id)
        .filter(ProjectAssignment.user_id == user.id)
        .all()
    )

    assignments: list[AssignedProject] = []
    total_completed = 0
    total_pending = 0

    for assignment, project, avg_rating in assignment_rows:
        avg_minutes = assignment.avg_task_time_minutes
        if avg_minutes is None:
            avg_minutes = project.default_avg_task_time_minutes

        total_completed += assignment.completed_tasks or 0
        total_pending += assignment.pending_tasks or 0

        assignments.append(
            AssignedProject(
                assignment_id=assignment.id,
                project_id=project.id,
                project_name=project.name,
                avg_task_time_minutes=avg_minutes,
                avg_task_time_label=f"{avg_minutes} minutes" if avg_minutes is not None else None,
                rating=round(float(avg_rating), 2) if avg_rating is not None else None,
                completed_tasks=assignment.completed_tasks or 0,
                pending_tasks=assignment.pending_tasks or 0,
                status=assignment.status or project.status or "Active",
            )
        )

    overall_avg_rating = (
        db.query(func.avg(TaskReview.rating))
        .filter(TaskReview.user_id == user.id)
        .scalar()
    )

    recent_review_rows = (
        db.query(TaskReview, Project)
        .join(Project, TaskReview.project_id == Project.id)
        .filter(TaskReview.user_id == user.id)
        .order_by(TaskReview.created_at.desc())
        .limit(5)
        .all()
    )

    recent_reviews = [
        TaskReviewSummary(
            id=review.id,
            project_id=project.id,
            project_name=project.name,
            rating=review.rating,
            comment=review.comment,
            created_at=review.created_at,
        )
        for review, project in recent_review_rows
    ]

    stats = TasksStats(
        assigned_projects=len(assignments),
        tasks_completed=total_completed,
        tasks_pending=total_pending,
        avg_rating=round(float(overall_avg_rating), 2) if overall_avg_rating is not None else None,
    )

    return TasksDashboardResponse(
        stats=stats,
        assignments=assignments,
        recent_reviews=recent_reviews,
    )


@router.post(
    "/admin/projects",
    response_model=ProjectResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_project(
    payload: ProjectCreate,
    _: TokenData = Depends(require_admin),
    db: Session = Depends(database.get_db),
):
    existing = db.query(Project).filter(Project.name == payload.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Project with this name already exists")

    project = Project(
        name=payload.name,
        status=payload.status,
        description=payload.description,
        data_category=payload.data_category,
        project_type=payload.project_type,
        task_type=payload.task_type,
        default_avg_task_time_minutes=payload.default_avg_task_time_minutes,
        review_time_minutes=payload.review_time_minutes,
        max_users_per_task=payload.max_users_per_task,
        association=payload.association,
        auto_submit_task=payload.auto_submit_task,
        allow_reviewer_edit=payload.allow_reviewer_edit,
        allow_reviewer_push_back=payload.allow_reviewer_push_back,
        allow_reviewer_feedback=payload.allow_reviewer_feedback,
        reviewer_screen_mode=payload.reviewer_screen_mode,
        reviewer_guidelines=payload.reviewer_guidelines,
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@router.get("/admin/projects", response_model=List[ProjectResponse])
def list_projects(
    _: TokenData = Depends(require_admin),
    db: Session = Depends(database.get_db),
):
    totals_subquery = (
        db.query(
            ProjectAssignment.project_id.label("project_id"),
            (
                func.coalesce(func.sum(ProjectAssignment.completed_tasks), 0)
                + func.coalesce(func.sum(ProjectAssignment.pending_tasks), 0)
            ).label("total_tasks_added"),
            func.coalesce(func.sum(ProjectAssignment.completed_tasks), 0).label(
                "total_tasks_completed"
            ),
        )
        .group_by(ProjectAssignment.project_id)
        .subquery()
    )

    rows = (
        db.query(Project, totals_subquery.c.total_tasks_added, totals_subquery.c.total_tasks_completed)
        .outerjoin(totals_subquery, totals_subquery.c.project_id == Project.id)
        .order_by(Project.name.asc())
        .all()
    )

    result: list[ProjectResponse] = []
    for project, total_added, total_completed in rows:
        total_tasks_added = int(total_added or 0)
        total_tasks_completed = int(total_completed or 0)
        payload = ProjectResponse.from_orm(project).copy(
            update={
                "total_tasks_added": total_tasks_added,
                "total_tasks_completed": total_tasks_completed,
            }
        )
        result.append(payload)

    return result


@router.get("/admin/users", response_model=List[UserSummary])
def list_users(
    _: TokenData = Depends(require_admin),
    db: Session = Depends(database.get_db),
):
    users = (
        db.query(User)
        .options(selectinload(User.profile))
        .order_by(User.email.asc())
        .all()
    )
    summaries = []
    for user in users:
        profile = user.profile
        summaries.append(
            UserSummary(
                id=user.id,
                email=user.email,
                role=user.role,
                name=profile.name if profile else None,
                phone=profile.phone if profile else None,
                status=profile.status if profile else None,
            )
        )
    return summaries


@router.post("/admin/assignments", response_model=ProjectAssignmentResponse)
def assign_project_to_user(
    payload: ProjectAssignmentRequest,
    _: TokenData = Depends(require_admin),
    db: Session = Depends(database.get_db),
):
    user = db.query(User).filter(User.id == payload.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    project = db.query(Project).filter(Project.id == payload.project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    assignment = (
        db.query(ProjectAssignment)
        .filter(
            ProjectAssignment.user_id == payload.user_id,
            ProjectAssignment.project_id == payload.project_id,
        )
        .first()
    )

    if not assignment:
        assignment = ProjectAssignment(
            user_id=payload.user_id,
            project_id=payload.project_id,
        )
        db.add(assignment)

    if payload.status is not None:
        assignment.status = payload.status
    elif not assignment.status:
        assignment.status = project.status or "Active"

    if payload.avg_task_time_minutes is not None:
        assignment.avg_task_time_minutes = payload.avg_task_time_minutes

    if payload.completed_tasks is not None:
        assignment.completed_tasks = payload.completed_tasks
    elif assignment.completed_tasks is None:
        assignment.completed_tasks = 0

    if payload.pending_tasks is not None:
        assignment.pending_tasks = payload.pending_tasks
    elif assignment.pending_tasks is None:
        assignment.pending_tasks = 0

    db.commit()
    db.refresh(assignment)

    return ProjectAssignmentResponse(
        assignment_id=assignment.id,
        user_id=assignment.user_id,
        project_id=assignment.project_id,
        status=assignment.status,
        avg_task_time_minutes=assignment.avg_task_time_minutes,
        completed_tasks=assignment.completed_tasks or 0,
        pending_tasks=assignment.pending_tasks or 0,
    )


@router.post(
    "/admin/json-to-excel",
    response_class=FileResponse,
    status_code=status.HTTP_200_OK,
)
async def convert_json_to_excel(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    sheet_name: str = "Sheet1",
    records_key: Optional[str] = None,
    _: TokenData = Depends(require_admin),
) -> FileResponse:
    if file.content_type not in {"application/json", "application/octet-stream", "text/json", "text/plain"}:
        raise HTTPException(status_code=400, detail="Upload must be a JSON file")

    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    output_path = ""
    try:
        with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as tmp:
            output_path = tmp.name
        sheet = sheet_name.strip() if sheet_name and sheet_name.strip() else "Sheet1"
        records = records_key.strip() if records_key and records_key.strip() else None
        json_to_excel(
            contents,
            output_path,
            sheet_name=sheet,
            records_key=records,
        )
    except json.JSONDecodeError as exc:
        if os.path.exists(output_path):
            os.remove(output_path)
        raise HTTPException(status_code=400, detail="Invalid JSON payload") from exc
    except Exception as exc:  # pragma: no cover - unexpected errors are surfaced to client
        if os.path.exists(output_path):
            os.remove(output_path)
        raise HTTPException(status_code=500, detail="Failed to convert JSON to Excel") from exc

    export_name = f"{Path(file.filename).stem}.xlsx" if file.filename else "output.xlsx"
    background_tasks.add_task(os.remove, output_path)
    return FileResponse(
        output_path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=export_name,
    )
