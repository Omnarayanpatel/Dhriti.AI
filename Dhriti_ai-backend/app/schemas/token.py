from pydantic import BaseModel


class TokenData(BaseModel):
    email: str | None = None
    user_id: int | None = None
    role: str | None = None
