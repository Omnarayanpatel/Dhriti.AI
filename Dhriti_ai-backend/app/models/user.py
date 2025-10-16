from sqlalchemy import Column, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(String, default="user")

    assignments = relationship(
        "ProjectAssignment", back_populates="user", cascade="all, delete-orphan"
    )
    reviews = relationship(
        "TaskReview", back_populates="user", cascade="all, delete-orphan"
    )
    profile = relationship(
        "UserProfile",
        uselist=False,
        back_populates="user",
        cascade="all, delete-orphan",
    )


class UserProfile(Base):
    __tablename__ = "user_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    name = Column(String, nullable=False)
    phone = Column(String, nullable=True)
    status = Column(String, default="Active")

    user = relationship("User", back_populates="profile")
