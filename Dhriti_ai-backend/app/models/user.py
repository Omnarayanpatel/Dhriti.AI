import enum
from sqlalchemy import Column, Enum, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(String, default="user")

    projects = relationship(
        "Project", back_populates="client", cascade="all, delete-orphan"
    )
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


class UserStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"
    SUSPENDED = "SUSPENDED"

class UserProfile(Base):
    __tablename__ = "user_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    name = Column(String, nullable=False)
    phone = Column(String, nullable=True)
    status = Column(
        Enum(
            UserStatus,
            native_enum=False,
        ), default=UserStatus.ACTIVE, nullable=False
    )

    user = relationship("User", back_populates="profile")
