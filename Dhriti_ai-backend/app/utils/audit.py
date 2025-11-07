from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from app.models.audit import AuditLog
from app.models.user import User
from app.schemas.token import TokenData


def create_audit_log(
    db: Session,
    user: Optional[TokenData],
    action: str,
    target_entity: Optional[str] = None,
    target_id: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
) -> None:
    """Creates and saves an audit log entry."""
    user_db_id = None
    if user:
        # The token user.id is a UUID, but the users table uses an integer ID.
        # We need to look up the user by email to get the correct integer ID.
        user_obj = db.query(User).filter(User.email == user.email).first()
        if user_obj:
            user_db_id = user_obj.id
    log_entry = AuditLog(
        user_id=user_db_id,
        action=action,
        target_entity=target_entity,
        target_id=str(target_id) if target_id else None,
        details=details,
    )
    db.add(log_entry)
    # The calling function is responsible for the db.commit()
    # This allows audit logs to be part of a larger transaction.