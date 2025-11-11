from __future__ import annotations

from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import database
from app.models.project import Project
from app.models.project_task import ProjectTask
from app.models.project_template import ProjectTemplate
from app.models.user import User
from app.routes.protected import get_current_user
from app.schemas.template_builder import (
    ProjectTemplateSourceDetail,
    ProjectTemplateSourceSummary,
    TemplateCreateRequest,
    TemplateField,
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


def _sample_label(key: str) -> str:
    cleaned = key.replace("_", " ").replace(".", " ").strip()
    if not cleaned:
        return key
    return " ".join(part.capitalize() for part in cleaned.split())


def _infer_dtype(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, int):
        return "integer"
    if isinstance(value, float):
        return "number"
    if isinstance(value, (dict, list)):
        return "json"
    return "string"


def _stringify_sample(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, (dict, list)):
        return None
    text = str(value)
    if len(text) > 120:
        return f"{text[:117]}..."
    return text


def _collect_schema_from_rows(preview_rows: List[Dict[str, Any]]) -> List[TemplateField]:
    seen: Dict[str, Dict[str, Any]] = {}
    for row in preview_rows:
        if not isinstance(row, dict):
            continue
        for key, value in row.items():
            current = seen.get(key)
            dtype = _infer_dtype(value)
            sample = _stringify_sample(value)
            if current is None:
                seen[key] = {
                    "key": key,
                    "label": _sample_label(key),
                    "dtype": dtype,
                    "sample": sample,
                }
            else:
                if current.get("dtype") is None and dtype is not None:
                    current["dtype"] = dtype
                if current.get("sample") is None and sample is not None:
                    current["sample"] = sample
    return [TemplateField(**payload) for payload in seen.values()]

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
    "/admin/project-template-sources",
    response_model=List[ProjectTemplateSourceSummary],
    summary="List projects with tasks available for template binding",
)
def list_project_template_sources(
    _: TokenData = Depends(require_admin),
    db: Session = Depends(database.get_db),
) -> List[ProjectTemplateSourceSummary]:
    task_stats_subquery = (
        db.query(
            ProjectTask.project_id.label("project_id"),
            func.count(ProjectTask.id).label("total_tasks"),
            func.max(ProjectTask.created_at).label("latest_task_at"),
        )
        .group_by(ProjectTask.project_id)
        .subquery()
    )

    rows = (
        db.query(
            Project,
            task_stats_subquery.c.total_tasks,
            task_stats_subquery.c.latest_task_at,
        )
        .outerjoin(task_stats_subquery, task_stats_subquery.c.project_id == Project.id)
        .order_by(Project.name.asc())
        .all()
    )

    summaries: List[ProjectTemplateSourceSummary] = []
    for project, total_tasks, latest_task_at in rows:
        summaries.append(
            ProjectTemplateSourceSummary(
                project_id=project.id,
                project_name=project.name,
                status=project.status,
                total_tasks=int(total_tasks or 0),
                latest_task_at=latest_task_at,
                sample_fields=[],
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


@router.get(
    "/admin/project-template-sources/{project_id}",
    response_model=ProjectTemplateSourceDetail,
    summary="Fetch schema and sample rows for project tasks",
)
def get_project_template_source(
    project_id: int,
    _: TokenData = Depends(require_admin),
    db: Session = Depends(database.get_db),
) -> ProjectTemplateSourceDetail:
    project: Optional[Project] = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    stats = (
        db.query(
            func.count(ProjectTask.id),
            func.max(ProjectTask.created_at),
        )
        .filter(ProjectTask.project_id == project_id)
        .first()
    )
    total_tasks = int(stats[0] or 0) if stats else 0
    latest_task_at = stats[1] if stats else None

    tasks: List[ProjectTask] = (
        db.query(ProjectTask)
        .filter(ProjectTask.project_id == project_id)
        .order_by(ProjectTask.created_at.asc())
        .limit(5)
        .all()
    )

    preview_rows: List[Dict[str, Any]] = []
    for task in tasks:
        row: Dict[str, Any] = {}
        if isinstance(task.payload, dict):
            row.update(task.payload)
        row.setdefault("task_id", task.task_id)
        row.setdefault("task_name", task.task_name)
        row.setdefault("file_name", task.file_name)
        preview_rows.append(row)

    schema = _collect_schema_from_rows(preview_rows)

    return ProjectTemplateSourceDetail(
        project_id=project.id,
        project_name=project.name,
        status=project.status,
        total_tasks=total_tasks,
        latest_task_at=latest_task_at,
        sample_fields=[field.key for field in schema],
        schema=schema,
        preview_rows=preview_rows,
    )


@router.post(
    "/admin/templates",
    response_model=TemplateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create or save a project template",
)
def create_template(
    payload: TemplateCreateRequest,
    current_user: TokenData = Depends(require_admin),
    db: Session = Depends(database.get_db),
) -> TemplateResponse:
    if not payload.layout:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Template layout cannot be empty.")

    project = db.query(Project).filter(Project.id == payload.project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    creator_id: Optional[int] = None
    if current_user.email:
        creator = db.query(User).filter(User.email == current_user.email).first()
        if creator:
            creator_id = creator.id

    template = ProjectTemplate(
        project_id=payload.project_id,
        name=payload.name.strip(),
        layout=payload.layout,
        rules=payload.rules,
        created_by=creator_id,
    )
    db.add(template)
    db.commit()
    db.refresh(template)

    return TemplateResponse(
        id=template.id,
        project_id=template.project_id,
        name=template.name,
        layout=template.layout,
        rules=template.rules,
        created_at=template.created_at,
        updated_at=template.updated_at,
        created_by=template.created_by,
    )


@router.get(
    "/admin/templates",
    response_model=List[TemplateResponse],
    summary="List saved project templates",
)
def list_templates(
    _: TokenData = Depends(require_admin),
    db: Session = Depends(database.get_db),
) -> List[TemplateResponse]:
    templates = db.query(ProjectTemplate).order_by(ProjectTemplate.created_at.desc()).all()
    return [
        TemplateResponse(
            id=template.id,
            project_id=template.project_id,
            name=template.name,
            layout=template.layout,
            rules=template.rules,
            created_at=template.created_at,
            updated_at=template.updated_at,
            created_by=template.created_by,
        )
        for template in templates
    ]


@router.get(
    "/templates/{template_id}/tasks",
    response_model=TemplateTasksResponse,
    summary="Fetch project tasks rendered via a template",
)
def get_template_tasks(
    template_id: UUID,
    limit: int = Query(20, ge=1, le=200),
    offset: int = Query(0, ge=0),
    _: TokenData = Depends(get_current_user),
    db: Session = Depends(database.get_db),
) -> TemplateTasksResponse:
    template = db.query(ProjectTemplate).filter(ProjectTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")

    tasks_query = (
        db.query(ProjectTask)
        .filter(ProjectTask.project_id == template.project_id)
        .order_by(ProjectTask.created_at.asc())
    )

    total = tasks_query.count()
    tasks = (
        tasks_query.offset(offset)
        .limit(limit)
        .all()
    )

    task_payloads = []
    preview_rows: List[Dict[str, Any]] = []
    for task in tasks:
        payload = task.payload if isinstance(task.payload, dict) else {}
        preview = {
            **payload,
            "task_id": task.task_id,
            "task_name": task.task_name,
            "file_name": task.file_name,
        }
        preview_rows.append(preview)
        task_payloads.append(
            TemplateTask(
                id=task.id,
                project_id=task.project_id,
                task_id=task.task_id,
                task_name=task.task_name,
                file_name=task.file_name,
                payload=payload,
                status=task.status,
                created_at=task.created_at,
            )
        )

    schema = _collect_schema_from_rows(preview_rows)

    response_template = TemplateResponse(
        id=template.id,
        project_id=template.project_id,
        name=template.name,
        layout=template.layout,
        rules=template.rules,
        created_at=template.created_at,
        updated_at=template.updated_at,
        created_by=template.created_by,
    )

    return TemplateTasksResponse(
        template=response_template,
        schema=schema,
        tasks=task_payloads,
        total=total,
        limit=limit,
        offset=offset,
    )
