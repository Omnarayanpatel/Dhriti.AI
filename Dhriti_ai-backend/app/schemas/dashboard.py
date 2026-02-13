from typing import List, Optional, Union

from pydantic import BaseModel
from .project import ProjectSummary


class TeamMember(BaseModel):
    id: int
    name: str
    avatar_url: Optional[str] = None
    role: str


class DashboardSummary(BaseModel):
    active_projects: int
    ended_projects: int
    running_projects: int
    pending_projects: int
    team_members: List[TeamMember]
    recent_projects: List[ProjectSummary]

    class Config:
        from_attributes = True
