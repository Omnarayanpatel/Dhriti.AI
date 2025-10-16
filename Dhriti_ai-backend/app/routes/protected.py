from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from app.schemas.token import TokenData

SECRET_KEY = "supersecretkey"
ALGORITHM = "HS256"

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")
router = APIRouter(prefix="/protected", tags=["Protected"])

def get_current_user(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        role: str = payload.get("role")
        if email is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        token_data = TokenData(email=email, role=role)
        return token_data
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

@router.get("/")
def read_protected(current_user: TokenData = Depends(get_current_user)):
    return {"email": current_user.email, "role": current_user.role}

@router.get("/admin")
def read_admin(current_user: TokenData = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not enough permissions")
    return {"email": current_user.email, "role": current_user.role}
