from __future__ import annotations

from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app import database
from app.models.user import User
from app.routes.protected import get_current_user
from app.schemas.token import TokenData

router = APIRouter(prefix="/admin", tags=["admin"])

# Define UPLOAD_DIR relative to the backend app's root directory
UPLOAD_DIR = Path(__file__).resolve().parents[2] / "client_uploads"


class ClientUploadInfo(BaseModel):
    filename: str
    client_id: int
    client_email: str
    uploaded_at: datetime
    size_kb: float


def require_admin(current_user: TokenData = Depends(get_current_user)) -> TokenData:
    """Requires the current user to have the 'admin' role."""
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This area is for admin accounts only.",
        )
    return current_user


@router.get("/client-uploads", response_model=list[ClientUploadInfo])
def list_client_uploads(
    _: TokenData = Depends(require_admin), db: Session = Depends(database.get_db)
):
    """Lists all files uploaded by clients."""
    if not UPLOAD_DIR.exists():
        return []

    clients = db.query(User).filter(User.role == "client").all()
    client_map = {str(client.id): client.email for client in clients}

    uploads = []
    for f in sorted(UPLOAD_DIR.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True):
        if not f.is_file():
            continue
        try:
            user_id_str, _ = f.name.split("_", 1)
            stat = f.stat()
            uploads.append(
                ClientUploadInfo(
                    filename=f.name,
                    client_id=int(user_id_str),
                    client_email=client_map.get(user_id_str, f"Unknown User ID: {user_id_str}"),
                    uploaded_at=datetime.fromtimestamp(stat.st_mtime),
                    size_kb=round(stat.st_size / 1024, 2),
                )
            )
        except (ValueError, IndexError):
            continue  # Skip files that don't match the "userid_filename" format
    return uploads


@router.get("/client-uploads/download/{filename}")
def download_client_upload(filename: str, _: TokenData = Depends(require_admin)):
    """Allows an admin to download a specific file uploaded by a client."""
    file_path = UPLOAD_DIR / filename
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found.")
    return FileResponse(path=file_path, filename=filename)