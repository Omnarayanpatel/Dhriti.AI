import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.task_annotation import TaskAnnotation
from app.routes.protected import get_current_user
from app.schemas.token import TokenData
from app.schemas.tasks import AnnotationResponse

router = APIRouter()

pass

@router.get(
    "/admin/projects/{project_id}/export-outputs",
    summary="Export all task outputs for a project",
    response_description="A JSON file with all annotations for the project.",
)
async def export_project_outputs(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """
    Exports all annotations for a given project as a streaming JSON file.

    This endpoint is restricted to admin users. It retrieves all task
    annotations associated with the specified project, formats them into a
    JSON structure, and streams the response for download.
    """
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to access this resource.",
        )

    annotations = (
        db.query(TaskAnnotation).filter(TaskAnnotation.project_id == project_id).all()
    )

    # Use the Pydantic schema to serialize the SQLAlchemy objects
    # The .dict() method is available on Pydantic models
    output_data = [AnnotationResponse.from_orm(ann).dict() for ann in annotations]

    json_content = json.dumps(output_data, indent=2, default=str).encode("utf-8")

    filename = f"project_{project_id}_outputs_{datetime.utcnow().strftime('%Y%m%d')}.json"
    headers = {
        "Content-Disposition": f'attachment; filename="{filename}"',
        "Content-Type": "application/json",
    }

    return StreamingResponse(iter([json_content]), headers=headers)
