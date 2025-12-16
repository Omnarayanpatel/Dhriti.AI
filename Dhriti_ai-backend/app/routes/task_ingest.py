from __future__ import annotations

import io
import json
from pathlib import Path
import re
from typing import Dict, List, Optional, Sequence
import shutil
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.project import Project
from app.models.project_import_file import ProjectImportFile
from app.models.project_task import ProjectTask
from app.routes.protected import get_current_user
from app.schemas.enums import TaskStatus
from app.schemas.task_ingest import (
    ConfirmRequest,
    ConfirmResponse,
    JsonToExcelResponse,
    MappingConfig,
    PreviewIssue,
    PreviewRequest,
    PreviewResponse,
)
from app.schemas.token import TokenData
from app.services.task_ingest import (
    MappingRuntime,
    TaskImportError,
    convert_json_bytes_to_excel,
    PREVIEW_LIMIT,
    determine_sheet_name,
    prepare_dataset_rows,
    process_row,
    read_preview_records_from_excel,
    stream_excel_rows,
    suggest_mapping_from_columns,
)

router = APIRouter(prefix="/imports", tags=["imports"])

UPLOAD_ROOT = Path(__file__).resolve().parents[1] / "uploads"
UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)

IMPORT_FILES_ROOT = Path(__file__).resolve().parents[1] / "import_files"
IMPORT_FILES_ROOT.mkdir(parents=True, exist_ok=True)


def require_admin(current_user: TokenData = Depends(get_current_user)) -> TokenData:
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user


def _excel_path(upload_id: str) -> Path:
    return UPLOAD_ROOT / f"{upload_id}.xlsx"


def _metadata_path(upload_id: str) -> Path:
    return UPLOAD_ROOT / f"{upload_id}.meta.json"


def _write_metadata(upload_id: str, payload: Dict[str, object]) -> None:
    with _metadata_path(upload_id).open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)


_INVALID_FILENAME_PATTERN = re.compile(r'[<>:"/\\|?*\x00-\x1F]')


def _safe_filename(stem: str, extension: str = ".xlsx") -> str:
    candidate = _INVALID_FILENAME_PATTERN.sub("_", stem).strip().strip(".")
    if not candidate:
        candidate = "converted"
    candidate = candidate[:150]
    return f"{candidate}{extension}"


def _derive_download_name(upload_id: str) -> str:
    meta_path = _metadata_path(upload_id)
    if meta_path.exists():
        try:
            with meta_path.open("r", encoding="utf-8") as handle:
                metadata = json.load(handle)
            source = metadata.get("source") or metadata.get("original_name")
            if source:
                stem = Path(source).stem
                if stem:
                    return _safe_filename(stem)
        except Exception:
            pass
    return _safe_filename(upload_id)


def _delete_upload_artifacts(upload_id: str) -> None:
    """Cleans up temporary files created during the import process."""
    for suffix in (".xlsx", ".json", ".meta.json"):
        path = UPLOAD_ROOT / f"{upload_id}{suffix}"
        try:
            path.unlink(missing_ok=True)
        except OSError:
            pass


@router.post("/json-to-excel", response_model=JsonToExcelResponse)
async def json_to_excel(
    file: UploadFile = File(...),
    records_path: str = Form("$"),
    sheet_name: Optional[str] = Form(None),
    _: TokenData = Depends(require_admin),
) -> JsonToExcelResponse:
    filename = file.filename or ""
    if not filename.lower().endswith(".json"):
        raise HTTPException(status_code=400, detail="Please upload a JSON file.")

    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    excel_upload_id = uuid4().hex
    excel_path = _excel_path(excel_upload_id)
    resolved_sheet_name = determine_sheet_name(sheet_name, file.filename)
    try:
        columns, total_rows, preview_rows = convert_json_bytes_to_excel(
            contents,
            records_path or "$",
            excel_path,
            resolved_sheet_name,
        )
    except TaskImportError as exc:
        excel_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        excel_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"Failed to process JSON: {exc}") from exc

    # Save the original JSON content so it can be stored in the database on confirmation.
    json_path = UPLOAD_ROOT / f"{excel_upload_id}.json"
    with json_path.open("wb") as f:
        f.write(contents)

    _write_metadata(
        excel_upload_id,
        {
            "type": "excel",
            "source": filename,
            "sheet": resolved_sheet_name,
            "records_path": records_path,
            "columns": columns,
            "rows": total_rows,
        },
    )

    return JsonToExcelResponse(
        excel_upload_id=excel_upload_id,
        sheet_name=resolved_sheet_name,
        columns=columns,
        total_rows=total_rows,
        download_url=f"/imports/downloads/{excel_upload_id}",
        preview_rows=preview_rows,
    )


@router.post("/process-server-file", response_model=JsonToExcelResponse)
async def process_server_file(
    filename: str = Form(...),
    sheet_name: Optional[str] = Form(None),
    _: TokenData = Depends(require_admin),
) -> JsonToExcelResponse:
    """
    Processes a file that is already on the server (e.g., from client uploads).
    This endpoint is designed to be called from the frontend when an admin
    wants to use a client's uploaded file directly in the import pipeline.
    """
    # Security: Prevent directory traversal attacks
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename.")

    # Client uploads are in a directory at the project root.
    file_path = UPLOAD_ROOT.parents[1] / "client_uploads" / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"File '{filename}' not found on server.")

    excel_upload_id = uuid4().hex
    excel_path = _excel_path(excel_upload_id)
    resolved_sheet_name = determine_sheet_name(sheet_name, filename)

    columns = []
    total_rows = 0
    preview_rows = []

    try:
        file_ext = file_path.suffix.lower()
        if file_ext == ".json":
            contents = file_path.read_bytes()
            columns, total_rows, preview_rows = convert_json_bytes_to_excel(
                contents, "$", excel_path, resolved_sheet_name
            )
        elif file_ext in (".xlsx", ".xls", ".csv"):
            # For Excel/CSV, we can copy it and read the preview directly.
            with open(file_path, "rb") as f_in, open(excel_path, "wb") as f_out:
                f_out.write(f_in.read())

            _, columns, preview_rows, total_rows = read_preview_records_from_excel(
                excel_path, resolved_sheet_name, limit=PREVIEW_LIMIT
            )
        else:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file type: '{file_ext}'. Please use JSON, Excel, or CSV.",
            )
    except TaskImportError as exc:
        excel_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        excel_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"Failed to process server file: {exc}") from exc

    _write_metadata(excel_upload_id, {"type": "excel", "source": filename, "sheet": resolved_sheet_name, "columns": columns, "rows": total_rows, "from_client_upload": True})

    return JsonToExcelResponse(
        excel_upload_id=excel_upload_id, sheet_name=resolved_sheet_name, columns=columns, total_rows=total_rows,
        download_url=f"/imports/downloads/{excel_upload_id}", preview_rows=preview_rows,
    )


@router.get("/downloads/{excel_upload_id}")
def download_excel(
    excel_upload_id: str,
    _: TokenData = Depends(require_admin),
) -> FileResponse:
    path = _excel_path(excel_upload_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Excel file not found.")
    return FileResponse(
        path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=_derive_download_name(excel_upload_id),
    )


@router.post("/preview", response_model=PreviewResponse)
def preview_import(
    payload: PreviewRequest,
    _: TokenData = Depends(require_admin),
    db: Session = Depends(get_db),
) -> PreviewResponse:
    _ensure_project_exists(db, payload.project_id)

    if not payload.excel_upload_id and not payload.rows:
        raise HTTPException(status_code=422, detail="Provide either excel_upload_id or rows for preview.")

    mapping = payload.mapping_config
    columns: List[str] = []
    sheet_used = mapping.sheet if mapping else "Raw"
    preview_rows_raw: List[tuple[int, Dict[str, Any]]] = []
    total_rows = 0

    if payload.rows:
        columns, preview_rows_raw, total_rows = prepare_dataset_rows(payload.rows, payload.limit)
    else:
        excel_path = _excel_path(payload.excel_upload_id or "")
        if not excel_path.exists():
            raise HTTPException(status_code=404, detail="Excel upload not found.")
        sheet_used, columns, preview_rows_raw, total_rows = read_preview_records_from_excel(
            excel_path,
            sheet=mapping.sheet if mapping else None,
            limit=payload.limit,
        )

    if not mapping:
        mapping = suggest_mapping_from_columns(columns).model_copy(update={"sheet": sheet_used})
    elif mapping.sheet != sheet_used:
        mapping = mapping.model_copy(update={"sheet": sheet_used})

    runtime = MappingRuntime()
    preview_rows: List[PreviewRow] = []
    issues: List[PreviewIssue] = []

    for row_number, record in preview_rows_raw:
        try:
            preview_row, row_issues = process_row(record, row_number, mapping, runtime)
            preview_rows.append(preview_row)
            issues.extend(PreviewIssue(row=row_number, message=message) for message in row_issues)
        except TaskImportError as exc:
            issues.append(PreviewIssue(row=row_number, message=str(exc)))

    return PreviewResponse(
        preview_rows=preview_rows,
        issues=issues,
        columns=columns,
        total_rows=total_rows,
        suggested_mapping=mapping,
        sheet_name=sheet_used,
    )


@router.post("/confirm", response_model=ConfirmResponse)
def confirm_import(
    payload: ConfirmRequest,
    _: TokenData = Depends(require_admin),
    db: Session = Depends(get_db),
) -> ConfirmResponse:
    _ensure_project_exists(db, payload.project_id)

    if not payload.excel_upload_id and not payload.rows:
        raise HTTPException(status_code=422, detail="Provide either excel_upload_id or rows for confirmation.")

    mapping = payload.mapping_config
    runtime = MappingRuntime()
    pending: List[tuple[PreviewRow, List[str]]] = []
    issues: List[PreviewIssue] = []
    seen_ids: Dict[str, int] = {}
    skipped = 0

    if payload.rows:
        _, normalized_rows, _ = prepare_dataset_rows(payload.rows, limit=len(payload.rows))
        rows_iterable = normalized_rows
    else:
        excel_path = _excel_path(payload.excel_upload_id or "")
        if not excel_path.exists():
            raise HTTPException(status_code=404, detail="Excel upload not found.")
        rows_iterable = stream_excel_rows(excel_path, mapping.sheet or "Raw")

    try:
        for row_number, record in rows_iterable:
            try:
                preview_row, row_issues = process_row(record, row_number, mapping, runtime)
            except TaskImportError as exc:
                issues.append(PreviewIssue(row=row_number, message=str(exc)))
                skipped += 1
                continue

            if preview_row.task_id in seen_ids:
                issues.append(
                    PreviewIssue(
                        row=row_number,
                        message=f"Duplicate task_id '{preview_row.task_id}' in upload; skipped.",
                    )
                )
                skipped += 1
                continue

            seen_ids[preview_row.task_id] = row_number
            issues.extend(PreviewIssue(row=row_number, message=msg) for msg in row_issues)
            pending.append((preview_row, row_issues))
    except TaskImportError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if not pending:
        return ConfirmResponse(inserted=0, skipped=skipped, errors=issues)

    duplicates = set(_find_conflicts(db, payload.project_id, seen_ids.keys()))
    to_insert: List[ProjectTask] = []

    if duplicates:
        filtered: List[tuple[PreviewRow, List[str]]] = []
        for preview_row, row_issues in pending:
            if preview_row.task_id in duplicates:
                issues.append(
                    PreviewIssue(
                        row=seen_ids.get(preview_row.task_id, 0),
                        message=f"task_id '{preview_row.task_id}' already exists for this project; skipped.",
                    )
                )
                skipped += 1
                continue
            filtered.append((preview_row, row_issues))
        pending = filtered

    for preview_row, _ in pending:
        # This check is now more important with the batch model
        if not _is_json_serializable(preview_row.payload):
            issues.append(
                PreviewIssue(
                    row=preview_row.row,
                    message=f"Payload for task_id '{preview_row.task_id}' is not JSON serializable; skipped.",
                )
            )
            skipped += 1
            continue
        # The logic to create ProjectTask objects is moved down
        # so we can get the batch_id first.

    inserted = 0
    if pending:
        # Create the import record FIRST to get a batch_id and store file content
        original_filename = "unknown_file"
        stored_filename = None
        if payload.excel_upload_id:
            meta_path = _metadata_path(payload.excel_upload_id)
            if meta_path.exists():
                try:
                    with meta_path.open("r", encoding="utf-8") as handle:
                        metadata = json.load(handle) or {}

                    original_filename = metadata.get("source", original_filename)
                    is_from_client_upload = metadata.get("from_client_upload", False)

                    stored_filename = f"{uuid4().hex}_{original_filename}"
                    permanent_path = IMPORT_FILES_ROOT / stored_filename

                    if is_from_client_upload:
                        # Excel / CSV from client_uploads
                        client_file_path = UPLOAD_ROOT.parents[1] / "client_uploads" / original_filename
                        if not client_file_path.exists():
                            raise FileNotFoundError("Client upload source file missing")
                        shutil.copy(client_file_path, permanent_path)
                    else:
                        # JSON upload flow
                        temp_json_path = UPLOAD_ROOT / f"{payload.excel_upload_id}.json"
                        if not temp_json_path.exists():
                            raise FileNotFoundError("Temporary JSON file missing")
                        shutil.move(temp_json_path, permanent_path)

                except Exception as e:
                    raise HTTPException(
                        status_code=500,
                        detail=f"Failed to store import file: {e}",
                    )

        if not stored_filename:
            raise HTTPException(status_code=500, detail="Could not process and store the import file.")

        import_file_record = ProjectImportFile(
            project_id=payload.project_id, file_name=stored_filename
        )
        db.add(import_file_record)
        # We are not using batch_id for now, but we still save the import record.
        # db.flush() is not needed if we don't need the ID immediately.

        # Now create the tasks
        to_insert = []
        for preview_row, _ in pending:
            to_insert.append(
                ProjectTask(
                    project_id=payload.project_id,
                    task_id=preview_row.task_id,
                    task_name=preview_row.task_name or "Untitled",
                    file_name=preview_row.file_name or f"row_{preview_row.row - 1}.dat",
                    status=TaskStatus.NEW,
                    payload=preview_row.payload,
                )
            )

        try:
            db.add_all(to_insert)
            db.commit()
            inserted = len(to_insert)
        except IntegrityError as exc:
            db.rollback()
            raise HTTPException(
                status_code=409,
                detail=f"Database constraint error while inserting tasks: {exc.orig}",
            ) from exc

        if inserted > 0 and payload.excel_upload_id:
            _delete_upload_artifacts(payload.excel_upload_id)

    return ConfirmResponse(inserted=inserted, skipped=skipped, errors=issues)


def _ensure_project_exists(db: Session, project_id: int) -> None:
    exists = db.query(Project.id).filter(Project.id == project_id).first()
    if not exists:
        raise HTTPException(status_code=404, detail=f"Project {project_id} not found.")


def _find_conflicts(db: Session, project_id: int, task_ids: Sequence[str]) -> List[str]:
    if not task_ids:
        return []
    ids = list(task_ids)
    result: List[str] = []
    chunk_size = 500
    for offset in range(0, len(ids), chunk_size):
        chunk = ids[offset : offset + chunk_size]
        rows = (
            db.query(ProjectTask.task_id)
            .filter(ProjectTask.project_id == project_id, ProjectTask.task_id.in_(chunk))
            .all()
        )
        result.extend(row[0] for row in rows)
    return result


def _is_json_serializable(payload: object) -> bool:
    try:
        json.dumps(payload)
        return True
    except TypeError:
        return False
