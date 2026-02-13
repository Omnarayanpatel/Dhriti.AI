import json
from datetime import datetime
from pathlib import Path
import os

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.project import Project
from app.models.task_annotation import TaskAnnotation
from app.models.project_import_file import ProjectImportFile
from app.models.project_task import ProjectTask
from app.routes.protected import get_current_user
from app.schemas.token import TokenData
from app.schemas.tasks import AnnotationResponse

router = APIRouter()

IMPORT_FILES_ROOT = Path(__file__).resolve().parents[1] / "import_files"


@router.get("/admin/projects/{project_id}/export-outputs")
async def export_project_outputs(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(403, "No permission")

    # 1. Verify the project exists
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")

    # 2. Load all tasks for the project
    all_tasks = (
        db.query(ProjectTask)
        .filter(ProjectTask.project_id == project_id)
        .all()
    )

    if not all_tasks:
        raise HTTPException(status_code=404, detail="No tasks found for this project to export.")

    # 3. Build the output by iterating through each task and finding its annotation.
    output_items = []
    for task in all_tasks:
        # Start with an empty dictionary to control the key order.
        item_data = {}

        # Add core task metadata first for consistent ordering.
        item_data["task_id"] = task.task_id
        item_data["task_name"] = task.task_name
        item_data["file_name"] = task.file_name

        # Then, merge the original payload data.
        if isinstance(task.payload, dict):
            item_data.update(task.payload)

        # Find the annotation for this specific task.
        ann = (
            db.query(TaskAnnotation)
            .filter(TaskAnnotation.project_id == project_id, TaskAnnotation.task_id == task.task_id)
            .first()
        )

        # If an annotation exists, add it to the item data.
        if ann:
            item_data["outputData"] = AnnotationResponse.from_orm(ann).model_dump()

        output_items.append(item_data)

    # 4. Assemble the final JSON structure.
    output_json = {"s": output_items}
    json_content = json.dumps(output_json, indent=2, default=str).encode("utf-8")

    filename = f"project_{project_id}_export.json"
    headers = {
        "Content-Disposition": f'attachment; filename="{filename}"',
        "Content-Type": "application/json",
    }

    return StreamingResponse(iter([json_content]), headers=headers)
