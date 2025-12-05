from datetime import datetime
from uuid import UUID
from typing import Any, Dict, List, Optional, Literal

from pydantic import BaseModel, Field, ConfigDict


class AssignedProject(BaseModel):
    assignment_id: int
    project_id: int
    project_name: str
    avg_task_time_minutes: Optional[int]
    avg_task_time_label: Optional[str]
    rating: Optional[float]
    completed_tasks: int
    pending_tasks: int
    task_type: Optional[str] = None
    data_category: Optional[str] = None
    status: str
    template_id: Optional[UUID] = None

    model_config = ConfigDict(from_attributes=True)


class TaskReviewSummary(BaseModel):
    id: int
    project_id: int
    project_name: str
    rating: float
    comment: Optional[str]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TasksStats(BaseModel):
    assigned_projects: int
    tasks_completed: int
    tasks_pending: int
    avg_rating: Optional[float]


class TasksDashboardResponse(BaseModel):
    stats: TasksStats
    assignments: List[AssignedProject]
    recent_reviews: List[TaskReviewSummary]


class ProjectCreate(BaseModel):
    name: str = Field(min_length=3)
    client_id: Optional[int] = None
    status: str = Field(default="Active", min_length=1)
    description: Optional[str] = None
    data_category: Optional[str] = None
    project_type: Optional[str] = None
    task_type: Optional[str] = None
    default_avg_task_time_minutes: Optional[int] = Field(default=None, ge=1)
    review_time_minutes: Optional[int] = Field(default=None, ge=1)
    max_users_per_task: Optional[int] = Field(default=None, ge=1)
    association: Optional[str] = "Admin"
    auto_submit_task: bool = False
    allow_reviewer_edit: bool = True
    allow_reviewer_push_back: bool = True
    allow_reviewer_feedback: bool = True
    reviewer_screen_mode: Literal["split", "full"] = "full"
    reviewer_guidelines: Optional[str] = None


class ProjectResponse(BaseModel):
    id: int
    name: str
    status: str
    default_avg_task_time_minutes: Optional[int]
    description: Optional[str]
    data_category: Optional[str]
    project_type: Optional[str]
    task_type: Optional[str]
    review_time_minutes: Optional[int]
    max_users_per_task: Optional[int]
    association: Optional[str] = "Admin"
    auto_submit_task: bool
    allow_reviewer_edit: bool
    allow_reviewer_push_back: bool
    allow_reviewer_feedback: bool
    reviewer_screen_mode: Literal["split", "full"]
    reviewer_guidelines: Optional[str]
    total_tasks_added: int = 0
    total_tasks_completed: int = 0
    client_id: Optional[int] = None
    client_email: Optional[str] = None
    has_template: bool = False

    model_config = ConfigDict(from_attributes=True)


class ProjectAssignmentRequest(BaseModel):
    user_id: int
    project_id: int
    total_task_assign: Optional[int] = Field(default=None, ge=0)


class ProjectAssignmentResponse(BaseModel):
    id: int = Field(..., alias="assignment_id")
    user_id: int
    project_id: int

    class Config:
        from_attributes = True
        populate_by_name = True

class ProjectUnassignmentRequest(BaseModel):
    project_id: int
    user_id: int

class AnnotationCreate(BaseModel):
    task_id: str
    project_id: int
    template_id: UUID
    annotations: Dict[str, Any]


class AnnotationResponse(BaseModel):
    id: int
    task_id: str
    user_id: int
    project_id: int
    annotations: Dict[str, Any]
    status: str
    submitted_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UserSummary(BaseModel):
    id: int
    email: str
    role: str
    name: Optional[str] = None
    phone: Optional[str] = None
    status: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)
