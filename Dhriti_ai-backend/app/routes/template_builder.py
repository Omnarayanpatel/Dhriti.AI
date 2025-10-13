from __future__ import annotations

from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app import database
from app.models.task_import import ImportBatch, ImportedTask
from app.models.task_template import TaskTemplate
from app.routes.protected import get_current_user
from app.schemas.template_builder import (
    TemplateCreateRequest,
    TemplateResponse,
    TemplateSourceDetail,
    TemplateSourceSummary,
    TemplateTask,
    TemplateTasksResponse,
)
from app.schemas.token import TokenData

router = APIRouter(prefix="/tasks", tags=["template-builder"])


def require_admin(current_user: TokenData = Depends(get_current_user)) -> TokenData:
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user


@router.get(
    "/admin/template-sources",
    response_model=List[TemplateSourceSummary],
    summary="List imported Excel batches available for template binding",
)
def list_template_sources(
    _: TokenData = Depends(require_admin),
    db: Session = Depends(database.get_db),
) -> List[TemplateSourceSummary]:
    batches = (
        db.query(ImportBatch)
        .order_by(ImportBatch.created_at.desc())
        .all()
    )

    summaries: List[TemplateSourceSummary] = []
    for batch in batches:
        schema = batch.excel_schema if isinstance(batch.excel_schema, list) else None
        summaries.append(
            TemplateSourceSummary(
                batch_id=batch.id,
                original_file=batch.original_file,
                row_count=batch.row_count,
                status=batch.status,
                created_at=batch.created_at,
                schema=schema,
            )
        )
    return summaries


@router.get(
    "/admin/template-sources/{batch_id}",
    response_model=TemplateSourceDetail,
    summary="Fetch schema and sample rows for an imported Excel batch",
)
def get_template_source(
    batch_id: UUID,
    _: TokenData = Depends(require_admin),
    db: Session = Depends(database.get_db),
) -> TemplateSourceDetail:
    batch: Optional[ImportBatch] = (
        db.query(ImportBatch)
        .filter(ImportBatch.id == batch_id)
        .first()
    )
    if not batch:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Batch not found")
    if batch.status != "COMPLETED":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Batch import is not completed yet")

    schema = batch.excel_schema if isinstance(batch.excel_schema, list) else []

    preview_tasks: List[ImportedTask] = (
        db.query(ImportedTask)
        .filter(ImportedTask.batch_id == batch_id)
        .order_by(ImportedTask.created_at.asc())
        .limit(5)
        .all()
    )

    preview_rows = []
    for task in preview_tasks:
        if isinstance(task.payload, dict):
            preview_rows.append(task.payload)
        else:
            preview_rows.append(
                {
                    "task_name": task.task_name,
                    "file_name": task.file_name,
                    "s3_url": task.s3_url,
                }
            )

    return TemplateSourceDetail(
        batch_id=batch.id,
        original_file=batch.original_file,
        row_count=batch.row_count,
        status=batch.status,
        created_at=batch.created_at,
        schema=schema,
        preview_rows=preview_rows,
    )


@router.post(
    "/admin/templates",
    response_model=TemplateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create or save a task template for a batch",
)
def create_template(
    payload: TemplateCreateRequest,
    current_user: TokenData = Depends(require_admin),
    db: Session = Depends(database.get_db),
) -> TemplateResponse:
    if not payload.layout:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Template layout cannot be empty.")

    if payload.batch_id:
        batch = db.query(ImportBatch).filter(ImportBatch.id == payload.batch_id).first()
        if not batch:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Batch not found")

    template = TaskTemplate(
        batch_id=payload.batch_id,
        name=payload.name.strip(),
        layout=payload.layout,
        rules=payload.rules,
    )
    db.add(template)
    db.commit()
    db.refresh(template)

    return TemplateResponse(
        id=template.id,
        batch_id=template.batch_id,
        name=template.name,
        layout=template.layout,
        rules=template.rules,
        created_at=template.created_at,
        updated_at=template.updated_at,
    )


@router.get(
    "/admin/templates",
    response_model=List[TemplateResponse],
    summary="List saved templates",
)
def list_templates(
    _: TokenData = Depends(require_admin),
    db: Session = Depends(database.get_db),
) -> List[TemplateResponse]:
    templates = db.query(TaskTemplate).order_by(TaskTemplate.created_at.desc()).all()
    return [
        TemplateResponse(
            id=template.id,
            batch_id=template.batch_id,
            name=template.name,
            layout=template.layout,
            rules=template.rules,
            created_at=template.created_at,
            updated_at=template.updated_at,
        )
        for template in templates
    ]


@router.get(
    "/templates/{template_id}/tasks",
    response_model=TemplateTasksResponse,
    summary="Fetch tasks rendered via a template",
)
def get_template_tasks(
    template_id: UUID,
    limit: int = Query(20, ge=1, le=200),
    offset: int = Query(0, ge=0),
    _: TokenData = Depends(get_current_user),
    db: Session = Depends(database.get_db),
) -> TemplateTasksResponse:
    template = db.query(TaskTemplate).filter(TaskTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")

    schema = []
    if template.batch_id:
        batch = db.query(ImportBatch).filter(ImportBatch.id == template.batch_id).first()
        if batch and isinstance(batch.excel_schema, list):
            schema = batch.excel_schema

    tasks_query = db.query(ImportedTask).filter(ImportedTask.batch_id == template.batch_id) if template.batch_id else None

    total = 0
    tasks: List[ImportedTask] = []
    if tasks_query is not None:
        total = tasks_query.count()
        tasks = (
            tasks_query.order_by(ImportedTask.created_at.asc())
            .offset(offset)
            .limit(limit)
            .all()
        )

    task_payloads = [
        TemplateTask(
            id=task.id,
            batch_id=task.batch_id,
            task_name=task.task_name,
            file_name=task.file_name,
            s3_url=task.s3_url,
            payload=task.payload if isinstance(task.payload, dict) else None,
        )
        for task in tasks
    ]

    response_template = TemplateResponse(
        id=template.id,
        batch_id=template.batch_id,
        name=template.name,
        layout=template.layout,
        rules=template.rules,
        created_at=template.created_at,
        updated_at=template.updated_at,
    )

    return TemplateTasksResponse(
        template=response_template,
        schema=schema,
        tasks=task_payloads,
        total=total,
        limit=limit,
        offset=offset,
    )
