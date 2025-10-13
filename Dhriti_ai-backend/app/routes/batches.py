from __future__ import annotations

import json
import os
import tempfile
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

        inserted = 0

        with session.begin():
            for _, row in df.iterrows():
                row_data = _build_row_dict(row)

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
                            priority
                        )
                        VALUES (
                            :id,
                            :batch_id,
                            :external_task_id,
                            :task_name,
                            :file_name,
                            :s3_url,
                            'NEW',
                            5
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
                    SET status='COMPLETED', row_count=:row_count
                    WHERE id=:id
                    """
                ),
                {"row_count": inserted, "id": batch_id},
            )

        return {"ok": True, "batch_id": batch_id, "rows_imported": inserted}

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
    for key, value in row.items():
        normalized = _normalize_key(str(key))
        data[normalized] = value
    return data


def _get_first_value(data: Dict[str, Any], canonical: str) -> Optional[Any]:
    aliases = _COLUMN_ALIASES.get(canonical, (canonical,))
    for alias in aliases:
        value = data.get(alias)
        if _value_is_missing(value):
            continue
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
