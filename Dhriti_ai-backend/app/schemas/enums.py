from enum import Enum


class ProjectStatus(str, Enum):
    ACTIVE = "Active"
    RUNNING = "Running"
    COMPLETED = "Completed"


class TaskStatus(str, Enum):
    NEW = "NEW"
    SUBMITTED = "submitted" # Now represents a task ready for QC
    QC_PENDING = "qc_pending"
    QC_REJECTED = "qc_rejected"
    QC_ACCEPTED = "qc_accepted"
    REWORK = "rework"

class AnnotationStatus(str, Enum):
    COMPLETED = "completed"