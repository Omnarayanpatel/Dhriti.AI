from __future__ import annotations

import uuid

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class ProjectTask(Base):
    __tablename__ = "project_tasks"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    project_id = Column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    task_id = Column(String, nullable=False)
    task_name = Column(Text, nullable=False)
    file_name = Column(Text, nullable=False)
    status = Column(String, nullable=False, default="NEW", server_default=text("'NEW'"))
    payload = Column(JSONB, nullable=False, default=dict, server_default=text("'{}'::jsonb"))
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    project = relationship("Project", back_populates="tasks")

    __table_args__ = (
        UniqueConstraint("project_id", "task_id", name="uq_project_tasks_project_task_id"),
        CheckConstraint("jsonb_typeof(payload) = 'object'", name="ck_project_tasks_payload_object"),
        Index("idx_project_tasks_project_id", "project_id"),
        Index("idx_project_tasks_created_at", "created_at"),
        Index("idx_project_tasks_payload_gin", payload, postgresql_using="gin"),
    )
