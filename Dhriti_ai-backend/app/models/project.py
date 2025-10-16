from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.database import Base


class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    status = Column(String, default="Active", nullable=False)
    description = Column(Text, nullable=True)
    data_category = Column(String, nullable=True)
    project_type = Column(String, nullable=True)
    task_type = Column(String, nullable=True)
    default_avg_task_time_minutes = Column(Integer, nullable=True)
    review_time_minutes = Column(Integer, nullable=True)
    max_users_per_task = Column(Integer, nullable=True)
    association = Column(String, default="Admin", nullable=True)
    auto_submit_task = Column(Boolean, default=False, nullable=False)
    allow_reviewer_edit = Column(Boolean, default=True, nullable=False)
    allow_reviewer_push_back = Column(Boolean, default=True, nullable=False)
    allow_reviewer_feedback = Column(Boolean, default=True, nullable=False)
    reviewer_screen_mode = Column(String, default="full", nullable=False)
    reviewer_guidelines = Column(Text, nullable=True)

    assignments = relationship(
        "ProjectAssignment", back_populates="project", cascade="all, delete-orphan"
    )
    reviews = relationship(
        "TaskReview", back_populates="project", cascade="all, delete-orphan"
    )


class ProjectAssignment(Base):
    __tablename__ = "project_assignments"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    avg_task_time_minutes = Column(Integer, nullable=True)
    completed_tasks = Column(Integer, default=0, nullable=False)
    pending_tasks = Column(Integer, default=0, nullable=False)
    status = Column(String, default="Active", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="assignments")
    project = relationship("Project", back_populates="assignments")

    __table_args__ = (
        UniqueConstraint("user_id", "project_id", name="uq_user_project_assignment"),
    )


class TaskReview(Base):
    __tablename__ = "task_reviews"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    rating = Column(Float, nullable=False)
    comment = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="reviews")
    project = relationship("Project", back_populates="reviews")
