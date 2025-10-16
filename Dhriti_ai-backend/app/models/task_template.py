from __future__ import annotations

import uuid

from sqlalchemy import Column, DateTime, ForeignKey, String, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class TaskTemplate(Base):
    __tablename__ = "task_template"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    batch_id = Column(UUID(as_uuid=True), ForeignKey("import_batch.id", ondelete="SET NULL"), nullable=True)
    name = Column(String, nullable=False)
    layout = Column(JSONB, nullable=False)
    rules = Column(JSONB, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    batch = relationship("ImportBatch", back_populates="templates")
