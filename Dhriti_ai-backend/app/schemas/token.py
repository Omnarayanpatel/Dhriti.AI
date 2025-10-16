from pydantic import BaseModel


class TokenData(BaseModel):
    email: str | None = None
    role: str | None = None
