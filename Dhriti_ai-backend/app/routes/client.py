from __future__ import annotations

from pathlib import Path
from typing import List

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import database
from app.models.project import Project, ProjectAssignment
from app.models.user import User
from app.routes.protected import get_current_user
from app.schemas.token import TokenData
from app.utils.audit import create_audit_log

router = APIRouter(prefix="/client", tags=["client"])

# Define UPLOAD_DIR relative to the backend app's root directory
UPLOAD_DIR = Path(__file__).resolve().parents[2] / "client_uploads"
UPLOAD_DIR.mkdir(exist_ok=True)


class DashboardStat(BaseModel):
    id: str
    label: str
    value: int | float
    icon: str | None = None

class ClientProjectInfo(BaseModel):
    id: int
    name: str
    status: str
    progress: float

class ClientDashboardSummary(BaseModel):
    stats: List[DashboardStat]
    projects: List[ClientProjectInfo]


def require_client(current_user: TokenData = Depends(get_current_user)) -> TokenData:
    """Requires the current user to have the 'client' role."""
    if current_user.role != "client":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This area is for client accounts only.",
        )
    return current_user


@router.get("/dashboard", response_model=ClientDashboardSummary)
def get_client_dashboard(
    current_user: TokenData = Depends(require_client),
    db: Session = Depends(database.get_db),
) -> ClientDashboardSummary:
    """Provides a summary dashboard for the logged-in client."""
    user = db.query(User).filter(User.email == current_user.email).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client user not found")

    # Find projects that belong to this client directly via client_id
    assigned_projects = db.query(Project).filter(Project.client_id == user.id).all()

    if not assigned_projects:
        return ClientDashboardSummary(stats=[], projects=[])

    total_tasks = 0
    completed_tasks = 0
    project_infos = []

    for project in assigned_projects:
        total = project.total_tasks_added or 0
        completed = project.total_tasks_completed or 0
        total_tasks += total
        completed_tasks += completed
        progress = (completed / total * 100) if total > 0 else 0
        project_infos.append(
            ClientProjectInfo(
                id=project.id,
                name=project.name,
                status=project.status,
                progress=round(progress, 2),
            )
        )

    stats = [
        DashboardStat(id="totalTasks", label="Total Tasks", value=total_tasks, icon="🧮"),
        DashboardStat(id="completedTasks", label="Tasks Completed", value=completed_tasks, icon="✅"),
        DashboardStat(id="pendingTasks", label="Tasks In Progress", value=total_tasks - completed_tasks, icon="⏳"),
        DashboardStat(id="projectCount", label="Active Projects", value=len(assigned_projects), icon="📂"),
    ]

    return ClientDashboardSummary(stats=stats, projects=project_infos)


@router.post("/upload/file", status_code=status.HTTP_202_ACCEPTED)
async def upload_client_data(
    file: UploadFile = File(...),
    current_user: TokenData = Depends(require_client),
    db: Session = Depends(database.get_db),
):
    """Accepts a data file from a client."""
    user = db.query(User).filter(User.email == current_user.email).first()
    file_location = UPLOAD_DIR / f"{user.id}_{file.filename}"
    with open(file_location, "wb+") as file_object:
        file_object.write(await file.read())

    create_audit_log(db, user=user, action="CLIENT_UPLOAD", details={"filename": file.filename})
    db.commit()

    return {"message": "File uploaded successfully. It will be processed shortly."}