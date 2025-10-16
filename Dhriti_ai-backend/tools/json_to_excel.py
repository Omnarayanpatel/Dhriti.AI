from __future__ import annotations

import io
import json
import os
from typing import Any, Iterable, Optional, Union

import pandas as pd


def json_to_excel(
    json_input: Union[str, bytes, io.IOBase, dict, list],
    output_excel_path: str,
    *,
    sheet_name: str = "Sheet1",
    records_key: Optional[str] = None,
    id_columns_priority: Iterable[str] = ("workItemId", "id", "uid", "uuid"),
    excel_engine: Optional[str] = None,
) -> str:
    """
    Convert nested JSON to an Excel file with flattened columns (dot-separated).

    Parameters
    ----------
    json_input
        - Path to a .json file, raw JSON string, bytes, file-like object, or a pre-parsed dict/list.
    output_excel_path
        - Target .xlsx path. Parent dirs are created if missing.
    sheet_name
        - Excel sheet name.
    records_key
        - Optional explicit key containing the list of records (e.g., "workItems").
          If omitted, the function auto-detects.
    id_columns_priority
        - Columns to pull to the front (in order) if present.
    excel_engine
        - Optional engine override ("openpyxl" or "xlsxwriter"). Autodetect if None.

    Returns
    -------
    str
        The output_excel_path.
    """

    def _load_json(inp: Union[str, bytes, io.IOBase, dict, list]) -> Any:
        # Why: allow flexible sources; users often pass path OR already-parsed objects.
        if isinstance(inp, (dict, list)):
            return inp
        if isinstance(inp, (bytes, bytearray)):
            return json.loads(inp)
        if isinstance(inp, io.IOBase):
            return json.load(inp)
        if isinstance(inp, str):
            if os.path.exists(inp):
                with open(inp, "r", encoding="utf-8") as f:
                    return json.load(f)
            # Treat as raw JSON string
            return json.loads(inp)
        raise TypeError(f"Unsupported json_input type: {type(inp)!r}")

    def _detect_records(data: Any) -> list:
        # Why: pick the most likely table when structure varies.
        if isinstance(data, list):
            return data
        if isinstance(data, dict):
            if records_key is not None:
                if records_key in data and isinstance(data[records_key], list):
                    return data[records_key]
            # Heuristic: prefer first list of dicts; otherwise largest list.
            candidates = [
                (k, v) for k, v in data.items() if isinstance(v, list) and any(isinstance(x, dict) for x in v)
            ]
            if candidates:
                # Choose the list with the most dict-like entries
                k_best, v_best = max(
                    candidates,
                    key=lambda kv: sum(isinstance(x, dict) for x in kv[1]),
                )
                return v_best
            # If no list of dicts, try to treat whole object as a single record
            return [data]
        # Fallback: wrap scalars
        return [dict(value=data)]

    data = _load_json(json_input)
    records = _detect_records(data)

    # Flatten to columns like "inputData.orig"
    df = pd.json_normalize(records, sep=".")

    # Reorder columns: bring common IDs first (if they exist), then the rest.
    front = [c for c in id_columns_priority if c in df.columns]
    rest = [c for c in df.columns if c not in front]
    df = df[front + rest] if front else df

    # Ensure output directory
    os.makedirs(os.path.dirname(os.path.abspath(output_excel_path)), exist_ok=True)

    # Write to Excel
    with pd.ExcelWriter(output_excel_path, engine=excel_engine) as writer:
        df.to_excel(writer, sheet_name=sheet_name, index=False)

    return output_excel_path


__all__ = ["json_to_excel"]

