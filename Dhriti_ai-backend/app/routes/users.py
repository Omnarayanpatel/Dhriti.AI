from typing import List

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session, selectinload

from app import database
from app.models.user import User, UserProfile
from app.routes.protected import get_current_user
from app.schemas.token import TokenData
from app.schemas.user import UserCreate, UserResponse, UserUpdate
from app.utils import security

router = APIRouter(prefix="/users", tags=["users"])


def require_admin(current_user: TokenData = Depends(get_current_user)) -> TokenData:
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user


def serialize_user(user: User) -> UserResponse:
    profile = user.profile
    return UserResponse(
        id=user.id,
        email=user.email,
        role=user.role,
        name=profile.name if profile else None,
        phone=profile.phone if profile else None,
        status=profile.status if profile else None,
    )


@router.get("/", response_model=List[UserResponse])
def list_users(
    _: TokenData = Depends(require_admin),
    db: Session = Depends(database.get_db),
) -> List[UserResponse]:
    users = (
        db.query(User)
        .options(selectinload(User.profile))
        .order_by(User.email.asc())
        .all()
    )
    return [serialize_user(user) for user in users]


@router.post("/", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreate,
    _: TokenData = Depends(require_admin),
    db: Session = Depends(database.get_db),
) -> UserResponse:
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    hashed_pw = security.hash_password(payload.password)
    user = User(email=payload.email, hashed_password=hashed_pw, role=payload.role or "user")
    profile = UserProfile(
        name=payload.name,
        phone=payload.phone,
        status=payload.status or "Active",
    )
    user.profile = profile
    db.add(user)
    db.commit()
    db.refresh(user)
    return serialize_user(user)


@router.put("/{user_id}", response_model=UserResponse)
def update_user(
    user_id: int,
    payload: UserUpdate,
    _: TokenData = Depends(require_admin),
    db: Session = Depends(database.get_db),
) -> UserResponse:
    user: User | None = (
        db.query(User)
        .options(selectinload(User.profile))
        .filter(User.id == user_id)
        .first()
    )
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if payload.role is not None:
        user.role = payload.role

    if payload.password is not None:
        user.hashed_password = security.hash_password(payload.password)

    profile = user.profile
    if not profile and any([payload.name, payload.phone, payload.status]):
        profile = UserProfile(
            name=payload.name or user.email,
            phone=payload.phone,
            status=payload.status or "Active",
        )
        user.profile = profile
    elif profile:
        if payload.name is not None:
            profile.name = payload.name
        if payload.phone is not None:
            profile.phone = payload.phone
        if payload.status is not None:
            profile.status = payload.status

    db.commit()
    db.refresh(user)
    return serialize_user(user)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    _: TokenData = Depends(require_admin),
    db: Session = Depends(database.get_db),
) -> Response:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    db.delete(user)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
