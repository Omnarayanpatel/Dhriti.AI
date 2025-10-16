# app/routes/auth.py
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import database
from app.models.user import User, UserProfile
from app.schemas.user import LoginRequest, UserCreate
from app.utils import security

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register")
def register_user(request: UserCreate, db: Session = Depends(database.get_db)):
    """Register a new user."""
    user = db.query(User).filter(User.email == request.email).first()
    if user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

    hashed_pw = security.hash_password(request.password)
    new_user = User(email=request.email, hashed_password=hashed_pw, role=request.role or "user")
    profile = UserProfile(
        name=request.name,
        phone=request.phone,
        status=request.status or "Active",
    )
    new_user.profile = profile
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return {
        "msg": "User registered successfully",
        "id": new_user.id,
        "role": new_user.role,
        "email": new_user.email,
        "name": profile.name,
        "phone": profile.phone,
        "status": profile.status,
    }


@router.post("/login")
def login(request: LoginRequest, db: Session = Depends(database.get_db)):
    """Login user and return JWT token."""
    user = db.query(User).filter(User.email == request.email).first()
    if not user or not security.verify_password(request.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid credentials")

    token = security.create_access_token(data={"sub": user.email, "role": user.role})
    return {"access_token": token, "token_type": "bearer", "role": user.role}
