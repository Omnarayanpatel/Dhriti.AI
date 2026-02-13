from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from app import database
from app.models.project import Project, ProjectAssignment
from app.models.user import User
from app.routes.protected import get_current_user
from app.schemas.dashboard import DashboardSummary, TeamMember
from app.schemas.enums import ProjectStatus
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
    """
    Retrieve a summary of dashboard metrics including project counts,
    team members, and recent projects.
    """
    # 1. Get project counts by status
    # Assuming project statuses are 'running', 'ended', 'pending'.
    # 'active_projects' will be the total count of all projects.
    total_projects_count = db.query(func.count(Project.id)).scalar() or 0

    # An "ended" project is one with a 'completed' status.
    ended_projects_count = (
        db.query(func.count(Project.id)).filter(Project.status == ProjectStatus.COMPLETED).scalar() or 0
    )

    # A project is "running" if it has been assigned to at least one user and is not completed.
    running_projects_count = (
        db.query(func.count(Project.id.distinct()))
        .join(ProjectAssignment, Project.id == ProjectAssignment.project_id)
        .filter(Project.status == ProjectStatus.RUNNING)
        .scalar() or 0
    )
    
    # A project is "pending" if it has not been assigned to any user yet and is active.
    # We find this by doing a LEFT JOIN and looking for projects with no assignment.
    pending_projects_count = (
        db.query(Project)
        .outerjoin(ProjectAssignment, Project.id == ProjectAssignment.project_id)
        .filter(ProjectAssignment.id == None)
        .filter(Project.status == ProjectStatus.ACTIVE)
        .count()
    )

    # 2. Get team members (e.g., all users)
    # Eagerly load the 'profile' relationship to avoid extra queries.
    users_with_profiles = db.query(User).options(selectinload(User.profile)).limit(10).all()

    # Manually create TeamMember objects from the User and UserProfile data.
    team_members = [
        TeamMember(
            id=user.id, name=user.profile.name if user.profile else user.email, role=user.role
        )
        for user in users_with_profiles
    ]

    # 3. Get recent projects (e.g., last 5 updated)
    recent_projects = db.query(Project).order_by(Project.updated_at.desc()).limit(5).all()

    # 4. Construct and return the response using the new DashboardSummary schema
    return DashboardSummary(
        active_projects=total_projects_count,
        ended_projects=ended_projects_count,
        running_projects=running_projects_count,
        pending_projects=pending_projects_count,
        team_members=team_members,
        recent_projects=recent_projects,
    )
