from typing import List, Optional, Union

from pydantic import BaseModel


class DashboardStat(BaseModel):
    id: str
    label: str
    value: Union[int, float, str]
    trend: Optional[str] = None
    icon: Optional[str] = None


class DashboardSummary(BaseModel):
    stats: List[DashboardStat]
