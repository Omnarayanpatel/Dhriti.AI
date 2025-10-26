from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from app.database import Base


class TaskAnnotation(Base):
    __tablename__ = "task_annotations"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(String, index=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    template_id = Column(UUID(as_uuid=True), ForeignKey("project_templates.id"), nullable=False)
    annotations = Column(JSONB, nullable=False)
    status = Column(String, default="completed", nullable=False)
    submitted_at = Column(DateTime, default=func.now(), nullable=False)

    user = relationship("User")
    project = relationship("Project")
    template = relationship("ProjectTemplate")