import json
import os
from . import export_routes, image_routes, video_routes
from pathlib import Path
from typing import List, Optional, Dict, Any
from uuid import UUID

from pydantic import BaseModel
from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from app import database
from app.models.task_annotation import TaskAnnotation
from app.models.project_template import ProjectTemplate
from app.models.project_task import ProjectTask
from app.models.project import Project, ProjectAssignment, TaskReview
from app.models.user import User
from app.routes.protected import get_current_user
from app.schemas.enums import AnnotationStatus, ProjectStatus, TaskStatus
from app.schemas.tasks import (
    AssignedProject,
    AnnotationCreate,
    AnnotationResponse,
    ProjectAssignmentRequest,
    ProjectUnassignmentRequest,
    ProjectAssignmentResponse,
    ProjectCreate,
    ProjectResponse,
    TaskReviewSummary,
    TasksDashboardResponse,
    TasksStats,
    UserSummary,
)
from app.schemas.token import TokenData
from app.utils.audit import create_audit_log
from tools.json_to_excel import json_to_excel
import tempfile


# --- New Pydantic Models for Auto-Template Generation ---
class MappingRule(BaseModel):
    component_type: str
    target_prop: str
    source_path: str

class AutoTemplateRequest(BaseModel):
    rules: List[MappingRule]
    labels: Optional[List[Dict[str, Any]]] = None

# --- New Pydantic Model for a single ProjectTask ---
class ProjectTaskResponse(BaseModel):
    id: UUID
    project_id: int
    task_id: str
    task_name: str
    file_name: str
    status: str
    payload: Dict[str, Any]
    template: Optional[Dict[str, Any]] = None # Include template for setup mode

    class Config:
        from_attributes = True


router = APIRouter(prefix="/tasks", tags=["tasks"])

# Include the router for exporting task outputs
router.include_router(export_routes.router)
router.include_router(image_routes.router)
router.include_router(video_routes.router)

def require_admin(current_user: TokenData = Depends(get_current_user)) -> TokenData:
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user


@router.get("/dashboard", response_model=TasksDashboardResponse)
def get_tasks_dashboard(
    current_user: TokenData = Depends(get_current_user),
    db: Session = Depends(database.get_db),
):
    user = db.query(User).filter(User.email == current_user.email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    reviews_avg_subquery = (
        db.query(
            TaskReview.project_id.label("project_id"),
            func.avg(TaskReview.rating).label("avg_rating"),
        )
        .filter(TaskReview.user_id == user.id)
        .group_by(TaskReview.project_id)
        .subquery()
    )

    # Subquery to get the latest template_id for each project
    latest_template_subquery = (
        db.query(
            ProjectTemplate.project_id,
            func.max(ProjectTemplate.created_at).label("max_created_at"),
        )
        .group_by(ProjectTemplate.project_id)
        .subquery()
    )

    template_id_subquery = (
        db.query(ProjectTemplate.id, ProjectTemplate.project_id)
        .join(
            latest_template_subquery,
            (ProjectTemplate.project_id == latest_template_subquery.c.project_id)
            & (ProjectTemplate.created_at == latest_template_subquery.c.max_created_at),
        )
        .subquery()
    )

    assignment_rows = (
        db.query(
            ProjectAssignment,
            Project,
            reviews_avg_subquery.c.avg_rating,
            template_id_subquery.c.id.label("template_id"),
        )
        .join(Project, ProjectAssignment.project_id == Project.id)
        .outerjoin(reviews_avg_subquery, reviews_avg_subquery.c.project_id == Project.id)
        .outerjoin(template_id_subquery, template_id_subquery.c.project_id == Project.id)
        .filter(ProjectAssignment.user_id == user.id)
        .all()
    )

    assignments: list[AssignedProject] = []
    total_completed = 0
    total_pending = 0

    for assignment, project, avg_rating, template_id in assignment_rows:
        avg_minutes = assignment.avg_task_time_minutes
        if avg_minutes is None:
            avg_minutes = project.default_avg_task_time_minutes

        assigned_project = AssignedProject(
            assignment_id=assignment.id,
            project_id=project.id,
            project_name=project.name,
            avg_task_time_minutes=avg_minutes,
            avg_task_time_label=f"{avg_minutes} minutes" if avg_minutes is not None else None,
            rating=round(float(avg_rating), 2) if avg_rating is not None else None,
            completed_tasks=assignment.completed_tasks or 0,
            pending_tasks=assignment.pending_tasks or 0, # This was missing a comma
            task_type=project.task_type,
            data_category=project.data_category,
            status=assignment.status or project.status or ProjectStatus.ACTIVE,
            template_id=template_id,
        )
        assignments.append(assigned_project)

        total_completed += assignment.completed_tasks or 0
        total_pending += assignment.pending_tasks or 0

    overall_avg_rating = (
        db.query(func.avg(TaskReview.rating))
        .filter(TaskReview.user_id == user.id)
        .scalar()
    )

    recent_review_rows = (
        db.query(TaskReview, Project)
        .join(Project, TaskReview.project_id == Project.id)
        .filter(TaskReview.user_id == user.id)
        .order_by(TaskReview.created_at.desc())
        .limit(5)
        .all()
    )

    recent_reviews = [
        TaskReviewSummary(
            id=review.id,
            project_id=project.id,
            project_name=project.name,
            rating=review.rating,
            comment=review.comment,
            created_at=review.created_at,
        )
        for review, project in recent_review_rows
    ]

    stats = TasksStats(
        assigned_projects=len(assignments),
        tasks_completed=total_completed,
        tasks_pending=total_pending,
        avg_rating=round(float(overall_avg_rating), 2) if overall_avg_rating is not None else None,
    )

    return TasksDashboardResponse(
        stats=stats,
        assignments=assignments,
        recent_reviews=recent_reviews,
    )

@router.post(
    "/{task_id}/annotations",
    response_model=AnnotationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Submit annotations for a task",
)
def submit_task_annotations(
    task_id: str,
    payload: AnnotationCreate,
    current_user: TokenData = Depends(get_current_user),
    db: Session = Depends(database.get_db),
):
    user = db.query(User).filter(User.email == current_user.email).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if task_id != payload.task_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Task ID mismatch in URL and payload.")

    # Check if an annotation for this task by this user already exists
    existing_annotation = (
        db.query(TaskAnnotation)
        .filter(TaskAnnotation.task_id == task_id, TaskAnnotation.user_id == user.id)
        .first()
    )
    if existing_annotation:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="You have already submitted this task.")

    
    annotation = TaskAnnotation(
        task_id=payload.task_id,
        user_id=user.id,
        project_id=payload.project_id, # This was missing a comma
        template_id=payload.template_id,
        annotations=payload.annotations,
        status=AnnotationStatus.COMPLETED,
    )
    db.add(annotation)

    # Update the ProjectTask status to 'submitted'
    task = db.query(ProjectTask).filter(ProjectTask.task_id == payload.task_id).first()
    if task:
        task.status = TaskStatus.SUBMITTED

    # Increment the total_tasks_completed count on the project
    project = db.query(Project).filter(Project.id == payload.project_id).first()
    if project:
        project.total_tasks_completed = (project.total_tasks_completed or 0) + 1

    # Decrement pending_tasks and increment completed_tasks for the user's assignment
    assignment = (
        db.query(ProjectAssignment)
        .filter(ProjectAssignment.project_id == payload.project_id, ProjectAssignment.user_id == user.id)
        .first()
    )
    if assignment:
        new_completed = (assignment.completed_tasks or 0) + 1
        assignment.completed_tasks = new_completed
        assignment.pending_tasks = max(0, assignment.total_task_assign - new_completed)
    db.commit()
    db.refresh(annotation)
    return annotation

@router.post(
    "/image/{task_id}/annotations",
    response_model=AnnotationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Submit annotations for an image task",
)
def submit_image_task_annotations(
    task_id: UUID,
    payload: Dict[str, Any], # Using a generic Dict for flexibility from image tool
    current_user: TokenData = Depends(get_current_user),
    db: Session = Depends(database.get_db),
):
    """Handles submission from the dedicated image annotation tool."""
    user = db.query(User).filter(User.email == current_user.email).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    task = db.query(ProjectTask).filter(ProjectTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    # Check if the task has already been submitted
    if task.status == TaskStatus.SUBMITTED:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This task has already been submitted.")

    # Find the latest template for this task's project
    template = db.query(ProjectTemplate).filter(ProjectTemplate.project_id == task.project_id).order_by(ProjectTemplate.created_at.desc()).first()

    # Check if an annotation for this task by this user already exists
    existing_annotation = (
        db.query(TaskAnnotation)
        .filter(TaskAnnotation.task_id == task.task_id, TaskAnnotation.user_id == user.id)
        .first()
    )
    if existing_annotation:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="You have already submitted an annotation for this task.")

    annotation = TaskAnnotation(
        task_id=task.task_id,
        user_id=user.id,
        project_id=task.project_id,
        template_id=template.id,
        annotations=payload,
        status=AnnotationStatus.COMPLETED,
    )
    db.add(annotation)

    # Update task status and project statistics in a transaction
    task.status = TaskStatus.SUBMITTED # Task is now ready for QC (as per enum definition)
    try:
        project = db.query(Project).filter(Project.id == task.project_id).with_for_update().one()
        project.total_tasks_completed = (project.total_tasks_completed or 0) + 1

        assignment = db.query(ProjectAssignment).filter(
            ProjectAssignment.project_id == task.project_id,
            ProjectAssignment.user_id == user.id
        ).with_for_update().first()

        if assignment:
            assignment.completed_tasks = (assignment.completed_tasks or 0) + 1
            assignment.pending_tasks = max(0, (assignment.total_task_assign or 0) - assignment.completed_tasks)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update project statistics: {str(e)}")

    db.commit()
    db.refresh(annotation)
    return annotation


@router.post(
    "/admin/projects",
    response_model=ProjectResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_project(
    payload: ProjectCreate,
    _: TokenData = Depends(require_admin),
    db: Session = Depends(database.get_db),
):
    existing = db.query(Project).filter(Project.name == payload.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Project with this name already exists")

    # If client_id is 0 or not provided, treat it as an internal project (NULL)
    client_id = payload.client_id if payload.client_id and payload.client_id > 0 else None

    project = Project(
        name=payload.name,
        status=payload.status,
        description=payload.description,
        data_category=payload.data_category,
        project_type=payload.project_type,
        task_type=payload.task_type,
        default_avg_task_time_minutes=payload.default_avg_task_time_minutes,
        review_time_minutes=payload.review_time_minutes,
        max_users_per_task=payload.max_users_per_task,
        association=payload.association,
        auto_submit_task=payload.auto_submit_task,
        allow_reviewer_edit=payload.allow_reviewer_edit,
        allow_reviewer_push_back=payload.allow_reviewer_push_back,
        allow_reviewer_feedback=payload.allow_reviewer_feedback,
        reviewer_screen_mode=payload.reviewer_screen_mode,
        reviewer_guidelines=payload.reviewer_guidelines,
        client_id=client_id,
    )
    db.add(project)
    db.commit()

    create_audit_log(
        db,
        user=_,
        action="CREATE_PROJECT",
        target_entity="Project",
        target_id=str(project.id),
    )
    db.refresh(project)
    return project


@router.get("/admin/projects", response_model=List[ProjectResponse])
def list_projects(
    _: TokenData = Depends(require_admin),
    db: Session = Depends(database.get_db),
):
    # With the new columns, we can query the Project model directly.
    projects = db.query(Project).order_by(Project.name.asc()).all()

    client_ids = {p.client_id for p in projects if p.client_id}
    clients = db.query(User).filter(User.id.in_(client_ids)).all() if client_ids else []
    client_map = {client.id: client.email for client in clients}

    # Get all project IDs that have at least one template
    projects_with_templates = {
        r[0] for r in db.query(ProjectTemplate.project_id).distinct().all()
    }

    result: list[ProjectResponse] = []
    for project in projects:
        # The values now come directly from the project object.
        total_tasks_added = project.total_tasks_added or 0
        total_tasks_completed = project.total_tasks_completed or 0

        has_template = project.id in projects_with_templates
        client_email = client_map.get(project.client_id)

        # Create the response, which already includes the new fields from the model.
        payload = ProjectResponse.from_orm(project).copy(
            update={
                "total_tasks_added": total_tasks_added,
                "total_tasks_completed": total_tasks_completed,
                "has_template": has_template,
            }
        )
        response_data = payload.model_dump()
        response_data["client_email"] = client_email
        result.append(ProjectResponse(**response_data))

    return result

@router.post("/admin/projects/{project_id}/increment-tasks", status_code=status.HTTP_204_NO_CONTENT)
def increment_project_tasks(
    project_id: int,
    count: int,
    _: TokenData = Depends(require_admin),
    db: Session = Depends(database.get_db),
):
    """
    An endpoint to increment the total_tasks_added for a project.
    This should be called after tasks are successfully imported/added.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    project.total_tasks_added = (project.total_tasks_added or 0) + count
    db.commit()

@router.post("/admin/projects/{project_id}/autogenerate-template", status_code=status.HTTP_201_CREATED)
def autogenerate_project_template(
    project_id: int,
    payload: AutoTemplateRequest,
    _: TokenData = Depends(require_admin),
    db: Session = Depends(database.get_db),
):
    """
    Generates a simple UI template for a project based on mapping rules.
    This is used for just-in-time template creation from the annotation UI.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    # Create the annotation_settings block, similar to text annotation
    annotation_settings = {
        "labels": payload.labels or [],
    }
    meta_block = {
        "id": "meta_settings", "type": "meta", "props": {"annotation_settings": annotation_settings}
    }


    layout = []
    rules = []
    y_pos = 60

    for rule in payload.rules:
        comp_id = f"comp_{rule.component_type.lower()}_{len(layout)}"
        layout.append({
            "id": comp_id,
            "type": rule.component_type,
            "frame": {"x": 60, "y": y_pos, "w": 640, "h": 480 if rule.component_type == "Image" else 60},
            "props": {},
        })
        rules.append({
            "component_key": comp_id,
            "target_prop": rule.target_prop,
            "source_kind": "TASK_PAYLOAD", # Use TASK_PAYLOAD for direct mapping from the task's data
            "source_path": rule.source_path,
        })
        y_pos += (480 if rule.component_type == "Image" else 60) + 20

    # Add the meta block to the layout
    layout.append(meta_block)

    creator = db.query(User).filter(User.email == _.email).first()

    # Upsert logic: Find existing or create new
    template = db.query(ProjectTemplate).filter(ProjectTemplate.project_id == project_id).order_by(ProjectTemplate.created_at.desc()).first()
    if template:
        # If a template exists, update its layout and rules
        template.layout = layout
        template.rules = rules
    else:
        # If no template exists, create a new one with all required fields
        template = ProjectTemplate(
            project_id=project_id, name=f"Auto-generated for {project.name}", layout=layout, rules=rules, created_by=creator.id if creator else None
        )
        db.add(template)
    db.commit()
    return {"message": "Template created successfully", "template_id": template.id}

@router.get("/admin/projects/{project_id}/sample-task", response_model=ProjectTaskResponse)
def get_project_sample_task(
    project_id: int,
    _: TokenData = Depends(require_admin),
    db: Session = Depends(database.get_db),
):
    """
    Fetches the first task for a given project to be used as a sample.
    """
    task = db.query(ProjectTask).filter(ProjectTask.project_id == project_id).first()
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No tasks found for this project to use as a sample.",
        )
    
    # Also fetch the latest template to help pre-fill the setup UI
    template_model = db.query(ProjectTemplate).filter(ProjectTemplate.project_id == project_id).order_by(ProjectTemplate.created_at.desc()).first()
    
    # Manually construct the response to include the template
    task_response = ProjectTaskResponse.from_orm(task).model_dump()
    if template_model:
        task_response['template'] = template_model.to_dict()

    return task_response

@router.get("/admin/projects/{project_id}/tasks", status_code=status.HTTP_200_OK)
def get_project_tasks(
    project_id: int,
    _: TokenData = Depends(require_admin),
    db: Session = Depends(database.get_db),
):
    """
    An endpoint to get all tasks for a given project, including allocation info.
    """
    # 1. Get all users assigned to this project
    assignments_query = (
        db.query(User.id, User.email)
        .join(ProjectAssignment, User.id == ProjectAssignment.user_id)
        .filter(ProjectAssignment.project_id == project_id)
        .all()
    )
    
    # Create a list of assigned users with their IDs and emails
    assigned_users = [{"user_id": user_id, "email": email} for user_id, email in assignments_query]

    # For simplicity in the task list, we can just show the first assigned user's email
    # or a count. Let's stick with the first email for now.
    allocated_email = assigned_users[0]['email'] if assigned_users else None

    # 2. Get all tasks for the project
    tasks = db.query(ProjectTask).filter(ProjectTask.project_id == project_id).all()

    # 3. Add the allocation email to each task object
    # Pydantic models from SQLAlchemy are not directly mutable, so we convert to dict
    tasks_response = [{**task.__dict__, "email": allocated_email} for task in tasks]

    # We'll return a dictionary containing both tasks and the list of assigned users
    # so the frontend can manage them.
    return {"tasks": tasks_response, "assigned_users": assigned_users}


@router.get("/admin/projects/{project_id}/review-tasks", status_code=status.HTTP_200_OK)
def get_project_review_tasks(
    project_id: int,
    annotator_id: Optional[int] = None,
    data_category_filter: Optional[str] = None,
    status_filter: Optional[TaskStatus] = None,
    page: int = 1,
    limit: int = 20,
    current_user: TokenData = Depends(require_admin), # Use current_user for role check
    db: Session = Depends(database.get_db),
):
    """
    An endpoint to get all completed tasks for a given project that are ready for review.
    It joins the task with the annotation and the user who submitted it.
    """
    # Base query
    query = (
        db.query(ProjectTask, TaskAnnotation, User, Project.data_category, Project.project_type)
        .join(TaskAnnotation, ProjectTask.task_id == TaskAnnotation.task_id)
        .join(User, TaskAnnotation.user_id == User.id)
        .join(Project, ProjectTask.project_id == Project.id)
        .filter(ProjectTask.project_id == project_id)
    )

    # Apply filters
    if annotator_id:
        query = query.filter(TaskAnnotation.user_id == annotator_id)
    if data_category_filter:
        query = query.filter(Project.data_category == data_category_filter)
    if status_filter:
        query = query.filter(ProjectTask.status == status_filter)
    else:
        # Default filter for QC review page: tasks that are submitted, rejected, or in rework
        query = query.filter(ProjectTask.status.in_([TaskStatus.SUBMITTED, TaskStatus.QC_REJECTED, TaskStatus.REWORK]))

    # Get total count before applying pagination
    total_count = query.count()

    # Apply pagination and ordering
    tasks_data = query.order_by(TaskAnnotation.submitted_at.desc()).offset((page - 1) * limit).limit(limit).all()

    results = []
    for task, annotation, user, data_category, project_type in tasks_data:
        task_dict = task.__dict__
        # The __dict__ from SQLAlchemy might contain internal state like _sa_instance_state
        # which we don't want in the response. A cleaner way is to build the dict.
        results.append({
            "id": task.id,
            "task_id": task.task_id,
            "task_name": task.task_name,
            "file_name": task.file_name,
            "annotator_id": user.id,
            "annotator_email": user.email,
            "submitted_at": annotation.submitted_at,
            "data_category": data_category,
            "project_type": project_type, # Added project_type for potential future use
            "status": task.status, # Added task status
            "payload": task.payload, # Input data
            "annotations": annotation.annotations, # Output data
        })

    return {"tasks": results, "total_count": total_count}

@router.get("/admin/users", response_model=List[UserSummary])
def list_users(
    _: TokenData = Depends(require_admin),
    db: Session = Depends(database.get_db),
):
    users = (
        db.query(User)
        .options(selectinload(User.profile))
        .order_by(User.email.asc())
        .all()
    )
    summaries = []
    for user in users:
        profile = user.profile
        summaries.append(
            UserSummary(
                id=user.id,
                email=user.email,
                # The 'role' field is a string, not an enum. Access it directly.
                role=user.role,
                name=profile.name if profile else None,
                phone=profile.phone if profile else None,
                # Correctly and safely get the string value of the status enum
                status=profile.status.value if profile and profile.status else None,
            )
        )   
    return summaries


@router.get("/admin/{task_id}", status_code=status.HTTP_200_OK)
def get_task_for_review(
    task_id: UUID,
    current_user: TokenData = Depends(require_admin),
    db: Session = Depends(database.get_db),
):
    """
    Fetches a single task by its UUID, including its annotation and user details, for QC review.
    This is used by the QC detail pages when loaded directly.
    """
    # Query for the task and join with related tables to get all necessary info
    task_data = (
        db.query(ProjectTask, TaskAnnotation, User, Project.data_category, Project.project_type, Project.id.label("project_id"))
        .join(TaskAnnotation, ProjectTask.task_id == TaskAnnotation.task_id)
        .join(User, TaskAnnotation.user_id == User.id)
        .join(Project, ProjectTask.project_id == Project.id)
        .filter(ProjectTask.id == task_id)
        .order_by(TaskAnnotation.submitted_at.desc()) # Get the latest annotation
        .first()
    )

    if not task_data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task with associated annotation not found.")

    task, annotation, user, data_category, project_type, project_id = task_data

    # Fetch the template used for this annotation, or fallback to latest project template
    template = None
    if annotation.template_id:
        template = db.query(ProjectTemplate).filter(ProjectTemplate.id == annotation.template_id).first()
    if not template:
        template = db.query(ProjectTemplate).filter(ProjectTemplate.project_id == project_id).order_by(ProjectTemplate.created_at.desc()).first()

    # Construct the response dictionary, similar to the list endpoint
    result = {
        "id": task.id,
        "task_id": task.task_id,
        "task_name": task.task_name,
        "file_name": task.file_name,
        "project_id": project_id,
        "annotator_id": user.id,
        "annotator_email": user.email,
        "submitted_at": annotation.submitted_at,
        "data_category": data_category,
        "project_type": project_type,
        "status": task.status,
        "payload": task.payload,
        "annotations": annotation.annotations,
        "template": template.to_dict() if template else None,
    }

    return result

@router.post(
    "/projects/{project_id}/next-task",
    response_model=ProjectTaskResponse,
    summary="Get the next available task for a specific project",
)
def get_next_project_task(
    project_id: int,
    current_user: TokenData = Depends(get_current_user),
    db: Session = Depends(database.get_db),
):
    """
    Finds and returns the next available task for the current user within a specific project.
    This is used when a user clicks "Start" on a project from their task list.
    """
    user = db.query(User).filter(User.email == current_user.email).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Check if the user has reached their assigned task limit for this project
    assignment = (
        db.query(ProjectAssignment)
        .filter(
            ProjectAssignment.user_id == user.id,
            ProjectAssignment.project_id == project_id,
        )
        .first()
    )
    if assignment and assignment.total_task_assign > 0:
        if (assignment.completed_tasks or 0) >= assignment.total_task_assign:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="You have completed all your assigned tasks for this project.",
            )

    # Find tasks that the user has already completed for this specific project
    completed_task_ids_query = db.query(TaskAnnotation.task_id).filter(
        TaskAnnotation.user_id == user.id,
        TaskAnnotation.project_id == project_id,
    )

    # Find an available task in the specified project.
    # An available task is 'NEW' and not yet completed by this user.
    # The project itself must also be 'Active'.
    available_task = (
        db.query(ProjectTask)
        .join(Project, Project.id == ProjectTask.project_id)
        .filter(
            ProjectTask.project_id == project_id,
            ProjectTask.status == TaskStatus.NEW,
            Project.status.in_([ProjectStatus.ACTIVE, ProjectStatus.RUNNING]),
            ~ProjectTask.task_id.in_(completed_task_ids_query)
        )
        .order_by(ProjectTask.created_at)  # FIFO assignment
        .first()
    )

    if not available_task:
        # No more tasks for this user. Check if the project is fully completed.
        project = db.query(Project).filter(Project.id == project_id).first()
        if project:
            total_added = project.total_tasks_added or 0
            total_completed = project.total_tasks_completed or 0
            if total_added > 0 and total_added == total_completed and project.status != ProjectStatus.COMPLETED:
                project.status = ProjectStatus.COMPLETED
                db.commit()

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No available tasks for this project right now. It may be fully completed.",
        )

    return available_task



@router.post("/admin/assignments", response_model=ProjectAssignmentResponse)
def assign_project_to_user(
    payload: ProjectAssignmentRequest,
    _: TokenData = Depends(require_admin),
    db: Session = Depends(database.get_db),
):
    user = db.query(User).filter(User.id == payload.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    project = db.query(Project).filter(Project.id == payload.project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # If the project is currently 'Active', change its status to 'Running'
    if project.status == ProjectStatus.ACTIVE:
        project.status = ProjectStatus.RUNNING

    assignment = (
        db.query(ProjectAssignment)
        .filter(
            ProjectAssignment.user_id == payload.user_id,
            ProjectAssignment.project_id == payload.project_id,
        )
        .first()
    )

    if not assignment:
        assignment = ProjectAssignment(
            user_id=payload.user_id,
            project_id=payload.project_id,
            completed_tasks=0,  # Set initial value
            pending_tasks=0,    # Set initial value
        )
        db.add(assignment)

    # Set total assigned tasks and completed tasks
    assignment.total_task_assign = payload.total_task_assign or assignment.total_task_assign or 0

    # Pending tasks are now calculated, not set directly
    assignment.pending_tasks = max(0, assignment.total_task_assign - (assignment.completed_tasks or 0))

    db.commit()
    db.refresh(assignment)

    return assignment


@router.delete("/admin/assignments", status_code=status.HTTP_204_NO_CONTENT)
def unassign_project_from_user(
    payload: ProjectUnassignmentRequest,
    _: TokenData = Depends(require_admin),
    db: Session = Depends(database.get_db),
):
    """
    Removes a user's assignment from a project.
    If it's the last assignment, the project status is reverted to 'Active'.
    """
    assignment = (
        db.query(ProjectAssignment)
        .filter(
            ProjectAssignment.user_id == payload.user_id,
            ProjectAssignment.project_id == payload.project_id,
        )
        .first()
    )

    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found for this user and project.")

    db.delete(assignment)
    db.commit()

    # Check if any assignments are left for this project
    remaining_assignments = db.query(ProjectAssignment).filter(ProjectAssignment.project_id == payload.project_id).count()

    if remaining_assignments == 0:
        project = db.query(Project).filter(Project.id == payload.project_id).first()
        if project and project.status == ProjectStatus.RUNNING:
            project.status = ProjectStatus.ACTIVE
            db.commit()

@router.post(
    "/admin/json-to-excel",
    response_class=FileResponse,
    status_code=status.HTTP_200_OK,
)
async def convert_json_to_excel(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    sheet_name: str = "Sheet1",
    records_key: Optional[str] = None,
    _: TokenData = Depends(require_admin),
) -> FileResponse:
    if file.content_type not in {"application/json", "application/octet-stream", "text/json", "text/plain"}:
        raise HTTPException(status_code=400, detail="Upload must be a JSON file")

    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    output_path = ""
    try:
        with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as tmp:
            output_path = tmp.name
        sheet = sheet_name.strip() if sheet_name and sheet_name.strip() else "Sheet1"
        records = records_key.strip() if records_key and records_key.strip() else None
        json_to_excel(
            contents,
            output_path,
            sheet_name=sheet,
            records_key=records,
        )
    except json.JSONDecodeError as exc:
        if os.path.exists(output_path):
            os.remove(output_path)
        raise HTTPException(status_code=400, detail="Invalid JSON payload") from exc
    except Exception as exc:  # pragma: no cover - unexpected errors are surfaced to client
        if os.path.exists(output_path):
            os.remove(output_path)
        raise HTTPException(status_code=500, detail="Failed to convert JSON to Excel") from exc

    export_name = f"{Path(file.filename).stem}.xlsx" if file.filename else "output.xlsx"
    background_tasks.add_task(os.remove, output_path)
    return FileResponse(
        output_path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=export_name,
    )
