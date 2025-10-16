# app/schemas/user.py
from typing import Optional

from pydantic import BaseModel, EmailStr, Field


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    role: str | None = "user"
    name: str = Field(min_length=1)
    phone: Optional[str] = None
    status: Optional[str] = "Active"


class UserUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    status: Optional[str] = None
    role: Optional[str] = None
    password: Optional[str] = Field(default=None, min_length=6)


class UserResponse(BaseModel):
    id: int
    email: EmailStr
    role: str
    name: Optional[str] = None
    phone: Optional[str] = None
    status: Optional[str] = None

    class Config:
        orm_mode = True
