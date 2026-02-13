from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class ProjectSummary(BaseModel):
    id: int
    name: str
    status: Optional[str] = None
    updated_at: datetime

    class Config:
        from_attributes = True