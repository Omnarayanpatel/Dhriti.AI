from __future__ import annotations

from typing import Any, Annotated, Dict, List, Optional, Union, Literal

from pydantic import BaseModel, ConfigDict, Field


class JsonToExcelResponse(BaseModel):
    excel_upload_id: str
    sheet_name: str
    columns: List[str]
    total_rows: int
    download_url: str
    preview_rows: List[List[Any]] = Field(default_factory=list)


class GenerateCoreConfig(BaseModel):
    mode: Literal["GENERATE"] = "GENERATE"
    strategy: str = Field(..., pattern="^(uuid_v4|seq_per_batch|expr)$")
    expression: Optional[str] = None

    model_config = ConfigDict(extra="forbid")


class ColumnCoreConfig(BaseModel):
    mode: Literal["COLUMN"] = "COLUMN"
    name: str
    transforms: List[str] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")


CoreFieldConfig = Annotated[Union[GenerateCoreConfig, ColumnCoreConfig], Field(discriminator="mode")]


class CoreMapping(BaseModel):
    task_id: CoreFieldConfig
    task_name: ColumnCoreConfig
    file_name: ColumnCoreConfig

    model_config = ConfigDict(extra="forbid")


class PayloadColumnSelection(BaseModel):
    mode: Literal["COLUMN"] = "COLUMN"
    column: str
    key: str
    transforms: List[str] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")


class PayloadConstantSelection(BaseModel):
    mode: Literal["CONSTANT"] = "CONSTANT"
    key: str
    value: Any

    model_config = ConfigDict(extra="forbid")


PayloadSelection = Annotated[Union[PayloadColumnSelection, PayloadConstantSelection], Field(discriminator="mode")]


class MappingConfig(BaseModel):
    sheet: str = "Raw"
    core: CoreMapping
    payload_selected: List[PayloadSelection] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")


class PreviewRequest(BaseModel):
    project_id: int
    mapping_config: Optional[MappingConfig] = None
    excel_upload_id: Optional[str] = None
    rows: Optional[List[Dict[str, Any]]] = None
    limit: int = Field(default=200, ge=1, le=500)

    model_config = ConfigDict(extra="forbid")


class PreviewIssue(BaseModel):
    row: int
    message: str


class PreviewRow(BaseModel):
    row: int
    task_id: str
    task_name: str
    file_name: str
    payload: Dict[str, Any]


class PreviewResponse(BaseModel):
    preview_rows: List[PreviewRow]
    issues: List[PreviewIssue]
    columns: List[str]
    total_rows: int
    suggested_mapping: Optional[MappingConfig] = None
    sheet_name: Optional[str] = None


class ConfirmRequest(BaseModel):
    project_id: int
    mapping_config: MappingConfig = Field(alias="final_mapping_config")
    excel_upload_id: Optional[str] = None
    rows: Optional[List[Dict[str, Any]]] = None

    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class ConfirmResponse(BaseModel):
    inserted: int
    skipped: int
    errors: List[PreviewIssue]
