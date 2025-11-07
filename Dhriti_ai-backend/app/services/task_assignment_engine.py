from sqlalchemy.orm import Session
from sqlalchemy import and_, or_

from app.models.project import Project, ProjectAssignment
from app.models.project_task import ProjectTask
from app.models.user import User
from app.models.task_annotation import TaskAnnotation


def is_user_available(user: User, db: Session) -> bool:
    """
    Checks if a user is available to receive tasks.
    This is a placeholder for more complex logic, like checking if the user is online,
    has capacity, or meets other criteria.

    Args:
        user: The user object.
        db: The database session.

    Returns:
        True if the user is available, False otherwise.
    """
    # Future logic can be added here, e.g., checking user's `last_seen` timestamp.
    # For now, we assume a user is available if they exist.
    return True


def assign_task_to_user(user: User, db: Session) -> ProjectTask | None:
    """
    Finds and assigns the next available task to a given user.

    The logic is as follows:
    1. Find all projects the user is actively assigned to.
    2. For those projects, find tasks that are 'NEW' (unassigned).
    3. Ensure the user has not already completed an annotation for that task.
    4. Select one task, update its status to 'ASSIGNED', and assign it to the user.

    Args:
        user: The user to assign a task to.
        db: The database session.

    Returns:
        The assigned ProjectTask object if a task was assigned, otherwise None.
    """
    if not is_user_available(user, db):
        return None

    # 1. Find active project assignments for the user
    active_assignments = (
        db.query(ProjectAssignment.project_id)
        .filter(
            ProjectAssignment.user_id == user.id,
            # Assumes 'Active' is the status for an ongoing assignment
            ProjectAssignment.status == "Active",
        )
        .all()
    )

    if not active_assignments:
        return None  # No active projects assigned to the user

    project_ids = [assignment.project_id for assignment in active_assignments]

    # 2. Find tasks that the user has already completed across these projects
    completed_task_ids_query = db.query(TaskAnnotation.task_id).filter(
        TaskAnnotation.user_id == user.id,
        TaskAnnotation.project_id.in_(project_ids),
    )
    
    # 3. Find an available task
    # An available task is 'NEW' and not yet completed by this user.
    # We also need to join with Project to respect project-level status.
    available_task = (
        db.query(ProjectTask)
        .join(Project, Project.id == ProjectTask.project_id)
        .filter(
            ProjectTask.project_id.in_(project_ids),
            ProjectTask.status == "NEW",
            Project.status == "Active", # Ensure project is active
            ~ProjectTask.task_id.in_(completed_task_ids_query)
        )
        .order_by(ProjectTask.created_at)  # FIFO assignment
        .first()
    )

    if not available_task:
        return None  # No available tasks for this user

    # 4. Assign the task
    # Here we are conceptually assigning it. The actual record of who is working
    # on it is created when they fetch the task or start work.
    # For now, we can update the task status to prevent others from picking it up.
    # A more robust system might use a dedicated `task_allocations` table.
    
    # Note: The current `ProjectTask` model does not have a `user_id` field.
    # If we add one, we could set it here.
    # available_task.assigned_to_user_id = user.id
    
    available_task.status = "ASSIGNED"
    db.commit()
    db.refresh(available_task)

    return available_task