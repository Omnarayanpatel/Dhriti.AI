from __future__ import annotations

from datetime import datetime
from typing import Any, List, Optional
from uuid import UUID

from pydantic import BaseModel, Field, validator


class TemplateField(BaseModel):
    key: str
    label: str
    dtype: Optional[str] = None
    sample: Optional[str] = None


class TemplateSourceSummary(BaseModel):
    batch_id: UUID
    original_file: Optional[str] = None
    row_count: int
    status: str
    created_at: datetime
    schema: Optional[List[TemplateField]] = None


class TemplateSourceDetail(TemplateSourceSummary):
    preview_rows: List[dict[str, Any]] = Field(default_factory=list)


class TemplateCreateRequest(BaseModel):
    batch_id: Optional[UUID]
    name: str
    layout: List[dict[str, Any]]
    rules: List[dict[str, Any]]

    @validator("name")
    def _name_not_empty(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Template name is required.")
        return value


class TemplateResponse(BaseModel):
    id: UUID
    batch_id: Optional[UUID]
    name: str
    layout: List[dict[str, Any]]
    rules: List[dict[str, Any]]
    created_at: datetime
    updated_at: datetime


class TemplateTask(BaseModel):
    id: UUID
    batch_id: Optional[UUID]
    task_name: Optional[str] = None
    file_name: Optional[str] = None
    s3_url: Optional[str] = None
    payload: Optional[dict[str, Any]] = None


class TemplateTasksResponse(BaseModel):
    template: TemplateResponse
    schema: List[TemplateField]
    tasks: List[TemplateTask]
    total: int
    limit: int
    offset: int
