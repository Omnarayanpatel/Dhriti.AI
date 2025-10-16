from __future__ import annotations

import json
import os
import tempfile
from datetime import date, datetime
from typing import Any, Dict, Iterable, List, Optional
from uuid import uuid4

import pandas as pd
from fastapi import APIRouter, File, HTTPException, UploadFile, status
from sqlalchemy import text

from app.database import SessionLocal


_COLUMN_ALIASES: Dict[str, Iterable[str]] = {
    "task_id": ("task_id", "external_task_id", "id"),
    "task_name": ("task_name", "name", "task"),
    "file_name": ("file_name", "filename", "file"),
    "s3_url": ("s3_url", "s3", "s3_link", "s3_links", "s3_bucket_links"),
    "questions": ("questions", "question", "question_list"),
    "options": ("options", "option", "option_list", "choices"),
}

router = APIRouter(prefix="/batches", tags=["batches"])


def _parse_questions(qcell: Any) -> List[str]:
    if _value_is_missing(qcell):
        return []
    if isinstance(qcell, str):
        try:
            data = json.loads(qcell)
        except Exception:
            data = None
        if isinstance(data, list):
            return [str(x).strip() for x in data]
        return [s.strip() for s in qcell.split("|") if str(s).strip()]
    if isinstance(qcell, (list, tuple)):
        return [str(x).strip() for x in qcell]
    return [str(qcell).strip()]


def _parse_options(ocell: Any, num_q: int) -> List[List[str]]:
    if _value_is_missing(ocell):
        return [[] for _ in range(num_q)]
    if isinstance(ocell, str):
        try:
            data = json.loads(ocell)
        except Exception:
            data = None
        if isinstance(data, list):
            out: List[List[str]] = []
            for i in range(num_q):
                if i < len(data):
                    value = data[i]
                    if isinstance(value, (list, tuple)):
                        out.append([str(x).strip() for x in value])
                    else:
                        out.append([str(value).strip()])
                else:
                    out.append([])
            return out
        groups = [g.strip() for g in ocell.split("|")]
        out: List[List[str]] = []
        for i in range(num_q):
            group = groups[i] if i < len(groups) else ""
            opts = [o.strip() for o in group.split(",") if o.strip()]
            out.append(opts)
        return out
    if isinstance(ocell, list):
        out: List[List[str]] = []
        for i in range(num_q):
            if i < len(ocell):
                value = ocell[i]
                if isinstance(value, (list, tuple)):
                    out.append([str(x).strip() for x in value])
                else:
                    out.append([str(value).strip()])
            else:
                out.append([])
        return out
    single = [str(ocell).strip()] if str(ocell).strip() else []
    result: List[List[str]] = [single]
    for _ in range(max(0, num_q - 1)):
        result.append([])
    return result


@router.post("/import", summary="Upload Excel and import into normalized tables")
async def import_excel(file: UploadFile = File(...)):
    filename = file.filename or ""
    if not filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please upload an Excel file (.xlsx or .xls).",
        )

    suffix = os.path.splitext(filename)[1] or ".xlsx"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        contents = await file.read()
        tmp.write(contents)
        tmp_path = tmp.name

    session = SessionLocal()
    batch_id = str(uuid4())

    try:
        session.execute(
            text(
                """
                INSERT INTO import_batch (id, original_file, status, row_count)
                VALUES (:id, :orig, 'RUNNING', 0)
                """
            ),
            {"id": batch_id, "orig": f"uploaded://{os.path.basename(tmp_path)}"},
        )
        session.commit()

        try:
            df = pd.read_excel(tmp_path)
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unable to read Excel file: {exc}",
            ) from exc

        normalized_columns = {_normalize_key(str(col)): col for col in df.columns}
        if not any(alias in normalized_columns for alias in _COLUMN_ALIASES["task_name"]):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Missing required column: task_name",
            )

        schema = _build_schema_from_dataframe(df)

        inserted = 0

        with session.begin():
            for _, row in df.iterrows():
                row_data = _build_row_dict(row)
                payload_data = _serialize_row(row_data)

                raw_task_name = _get_first_value(row_data, "task_name")
                if raw_task_name is None:
                    continue
                task_name = str(raw_task_name).strip()
                if not task_name:
                    continue

                task_id = str(uuid4())
                raw_external_id = _get_first_value(row_data, "task_id")
                external_task_id = str(raw_external_id).strip() if raw_external_id is not None else ""

                raw_file_name = _get_first_value(row_data, "file_name")
                file_name = str(raw_file_name).strip() if raw_file_name is not None else ""

                raw_s3_url = _get_first_value(row_data, "s3_url")
                s3_url = str(raw_s3_url).strip() if raw_s3_url is not None else ""

                session.execute(
                    text(
                        """
                        INSERT INTO task (
                            id,
                            batch_id,
                            external_task_id,
                            task_name,
                            file_name,
                            s3_url,
                            status,
                            priority,
                            payload
                        )
                        VALUES (
                            :id,
                            :batch_id,
                            :external_task_id,
                            :task_name,
                            :file_name,
                            :s3_url,
                            'NEW',
                            5,
                            CAST(:payload AS JSONB)
                        )
                        """
                    ),
                    {
                        "id": task_id,
                        "batch_id": batch_id,
                        "external_task_id": external_task_id,
                        "task_name": task_name,
                        "file_name": file_name,
                        "s3_url": s3_url,
                        "payload": json.dumps(payload_data),
                    },
                )

                raw_questions = _get_first_value(row_data, "questions")
                questions = _parse_questions(raw_questions)

                raw_options = _get_first_value(row_data, "options")
                options = _parse_options(raw_options, len(questions))

                for qi, question_text in enumerate(questions):
                    question_id = str(uuid4())
                    session.execute(
                        text(
                            """
                            INSERT INTO task_question (
                                id,
                                task_id,
                                question_text,
                                question_order
                            )
                            VALUES (:id, :task_id, :question_text, :question_order)
                            """
                        ),
                        {
                            "id": question_id,
                            "task_id": task_id,
                            "question_text": question_text,
                            "question_order": qi,
                        },
                    )

                    q_options = options[qi] if qi < len(options) else []
                    for oi, option_text in enumerate(q_options):
                        session.execute(
                            text(
                                """
                                INSERT INTO task_option (
                                    id,
                                    question_id,
                                    option_text,
                                    option_order
                                )
                                VALUES (:id, :question_id, :option_text, :option_order)
                                """
                            ),
                            {
                                "id": str(uuid4()),
                                "question_id": question_id,
                                "option_text": option_text,
                                "option_order": oi,
                            },
                        )

                inserted += 1

            session.execute(
                text(
                    """
                    UPDATE import_batch
                    SET status='COMPLETED', row_count=:row_count, excel_schema=CAST(:schema AS JSONB)
                    WHERE id=:id
                    """
                ),
                {"row_count": inserted, "id": batch_id, "schema": json.dumps(schema)},
            )

        return {"ok": True, "batch_id": batch_id, "rows_imported": inserted, "schema": schema}

    except HTTPException as exc:
        session.rollback()
        session.execute(
            text(
                """
                UPDATE import_batch
                SET status='FAILED', error_message=:msg
                WHERE id=:id
                """
            ),
            {"msg": str(exc.detail), "id": batch_id},
        )
        session.commit()
        raise
    except Exception as exc:
        session.rollback()
        session.execute(
            text(
                """
                UPDATE import_batch
                SET status='FAILED', error_message=:msg
                WHERE id=:id
                """
            ),
            {"msg": str(exc)[:1000], "id": batch_id},
        )
        session.commit()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Import failed: {exc}",
        ) from exc
    finally:
        session.close()
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


def _normalize_key(name: str) -> str:
    return name.strip().lower().replace(" ", "_")


def _build_row_dict(row: pd.Series) -> Dict[str, Any]:
    data: Dict[str, Any] = {}
    counts: Dict[str, int] = {}
    for key, value in row.items():
        normalized = _normalize_key(str(key))
        if normalized in data:
            counts[normalized] = counts.get(normalized, 1) + 1
            normalized = f"{normalized}_{counts[normalized]}"
        else:
            counts[normalized] = 1
        data[normalized] = value
    return data


def _serialize_row(row: Dict[str, Any]) -> Dict[str, Any]:
    return {key: _coerce_for_json(value) for key, value in row.items()}


def _coerce_for_json(value: Any) -> Any:
    if _value_is_missing(value):
        return None
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, bytes):
        try:
            return value.decode("utf-8")
        except Exception:
            return value.hex()
    if isinstance(value, dict):
        return {str(k): _coerce_for_json(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_coerce_for_json(v) for v in value]
    try:
        import numpy as np  # type: ignore

        if isinstance(value, (np.integer, np.floating, np.bool_)):
            return value.item()
    except Exception:
        pass
    if hasattr(value, "item"):
        try:
            return value.item()
        except Exception:
            pass
    return value


def _get_first_value(data: Dict[str, Any], canonical: str) -> Optional[Any]:
    aliases = _COLUMN_ALIASES.get(canonical, (canonical,))
    for alias in aliases:
        value = data.get(alias)
        if _value_is_missing(value):
            idx = 2
            resolved: Optional[Any] = None
            while True:
                suffixed_key = f"{alias}_{idx}"
                if suffixed_key not in data:
                    break
                candidate = data.get(suffixed_key)
                if not _value_is_missing(candidate):
                    resolved = candidate
                    break
                idx += 1
            if resolved is None or _value_is_missing(resolved):
                continue
            value = resolved
        if not _value_is_missing(value):
            return value
    return None


def _value_is_missing(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, str):
        return not value.strip()
    if isinstance(value, (list, tuple, dict)):
        return False
    try:
        return bool(pd.isna(value))
    except Exception:
        return False


def _build_schema_from_dataframe(df: pd.DataFrame) -> List[Dict[str, Any]]:
    schema: List[Dict[str, Any]] = []
    counts: Dict[str, int] = {}
    for column in df.columns:
        base_key = _normalize_key(str(column))
        counts[base_key] = counts.get(base_key, 0) + 1
        key = base_key if counts[base_key] == 1 else f"{base_key}_{counts[base_key]}"
        sample_value = None
        for value in df[column]:
            if not _value_is_missing(value):
                sample_value = _coerce_for_json(value)
                break
        schema.append(
            {
                "key": key,
                "label": str(column),
                "dtype": str(df[column].dtype),
                "sample": None if sample_value is None else str(sample_value),
            }
        )
    return schema
