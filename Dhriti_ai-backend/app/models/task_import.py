from __future__ import annotations

import uuid

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base

IMPORT_BATCH_STATUSES = ("PENDING", "RUNNING", "COMPLETED", "FAILED")
TASK_STATUSES = (
    "NEW",
    "ASSIGNED",
    "IN_PROGRESS",
    "SUBMITTED",
    "REVIEWED",
    "REJECTED",
    "DONE",
)


class ImportBatch(Base):
    __tablename__ = "import_batch"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    original_file = Column(Text, nullable=True)
    status = Column(String, nullable=False, default="PENDING")
    row_count = Column(Integer, nullable=False, default=0)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    tasks = relationship("ImportedTask", back_populates="batch")

    __table_args__ = (
        CheckConstraint(
            "status IN ('PENDING','RUNNING','COMPLETED','FAILED')",
            name="ck_import_batch_status",
        ),
    )


class ImportedTask(Base):
    __tablename__ = "task"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    batch_id = Column(UUID(as_uuid=True), ForeignKey("import_batch.id", ondelete="SET NULL"), nullable=True)
    external_task_id = Column(String, nullable=True)
    task_name = Column(Text, nullable=False)
    file_name = Column(Text, nullable=True)
    s3_url = Column(Text, nullable=True)
    status = Column(String, nullable=False, default="NEW")
    priority = Column(Integer, nullable=False, default=5)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    batch = relationship("ImportBatch", back_populates="tasks")
    questions = relationship("TaskQuestion", back_populates="task", cascade="all, delete-orphan")

    __table_args__ = (
        CheckConstraint(
            "status IN ('NEW','ASSIGNED','IN_PROGRESS','SUBMITTED','REVIEWED','REJECTED','DONE')",
            name="ck_task_status",
        ),
        Index("idx_task_batch", "batch_id"),
        Index("idx_task_status", "status"),
    )


class TaskQuestion(Base):
    __tablename__ = "task_question"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    task_id = Column(UUID(as_uuid=True), ForeignKey("task.id", ondelete="CASCADE"), nullable=False)
    question_text = Column(Text, nullable=False)
    question_order = Column(Integer, nullable=False, default=0)

    task = relationship("ImportedTask", back_populates="questions")
    options = relationship("TaskOption", back_populates="question", cascade="all, delete-orphan")

    __table_args__ = (Index("idx_question_task", "task_id", "question_order"),)


class TaskOption(Base):
    __tablename__ = "task_option"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    question_id = Column(UUID(as_uuid=True), ForeignKey("task_question.id", ondelete="CASCADE"), nullable=False)
    option_text = Column(Text, nullable=False)
    option_order = Column(Integer, nullable=False, default=0)

    question = relationship("TaskQuestion", back_populates="options")

    __table_args__ = (Index("idx_option_question", "question_id", "option_order"),)
