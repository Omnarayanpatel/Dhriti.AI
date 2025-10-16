from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import database
from app.models.project import Project, ProjectAssignment
from app.models.user import User
from app.routes.protected import get_current_user
from app.schemas.dashboard import DashboardStat, DashboardSummary
from app.schemas.token import TokenData

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def require_admin(current_user: TokenData = Depends(get_current_user)) -> TokenData:
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user


@router.get("/summary", response_model=DashboardSummary)
def get_dashboard_summary(
    _: TokenData = Depends(require_admin),
    db: Session = Depends(database.get_db),
) -> DashboardSummary:
    active_projects = (
        db.query(func.count(Project.id)).filter(Project.status == "Active").scalar() or 0
    )
    total_tasks_completed = (
        db.query(func.coalesce(func.sum(ProjectAssignment.completed_tasks), 0)).scalar() or 0
    )
    total_tasks_pending = (
        db.query(func.coalesce(func.sum(ProjectAssignment.pending_tasks), 0)).scalar() or 0
    )
    total_tasks = total_tasks_completed + total_tasks_pending
    total_assignments = db.query(func.count(ProjectAssignment.id)).scalar() or 0
    active_assignments = (
        db.query(func.count(ProjectAssignment.id))
        .filter(ProjectAssignment.status == "Active")
        .scalar()
        or 0
    )
    average_task_time = (
        db.query(func.avg(ProjectAssignment.avg_task_time_minutes))
        .filter(ProjectAssignment.avg_task_time_minutes.isnot(None))
        .scalar()
    )
    total_users = db.query(func.count(User.id)).scalar() or 0

    stats = [
        DashboardStat(
            id="activeProjects",
            label="Total Active Projects",
            value=active_projects,
            trend="—",
            icon="📁",
        ),
        DashboardStat(
            id="totalTasks",
            label="Total Tasks",
            value=total_tasks,
            trend="—",
            icon="🧮",
        ),
        DashboardStat(
            id="totalAssignments",
            label="Total Assignments",
            value=total_assignments,
            trend="—",
            icon="👥",
        ),
        DashboardStat(
            id="tasksPending",
            label="Tasks Pending",
            value=total_tasks_pending,
            trend="—",
            icon="⏳",
        ),
        DashboardStat(
            id="tasksCompleted",
            label="Tasks Completed",
            value=total_tasks_completed,
            trend="—",
            icon="✅",
        ),
        DashboardStat(
            id="activeAssignments",
            label="Active Assignments",
            value=active_assignments,
            trend="—",
            icon="⚙️",
        ),
        DashboardStat(
            id="avgTaskTime",
            label="Avg Task Time (min)",
            value=round(float(average_task_time), 1) if average_task_time is not None else "—",
            trend="—",
            icon="⏱️",
        ),
        DashboardStat(
            id="totalUsers",
            label="Total Users",
            value=total_users,
            trend="—",
            icon="🧑‍🤝‍🧑",
        ),
    ]

    return DashboardSummary(stats=stats)
