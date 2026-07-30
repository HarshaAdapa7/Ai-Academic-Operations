from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.user import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)

async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db)
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        # Fallback to check if token is in header directly
        raise credentials_exception

    email = decode_access_token(token)
    if email is None:
        raise credentials_exception
    
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalars().first()
    if user is None:
        raise credentials_exception
    
    return user

async def get_optional_current_user(
    token: Optional[str] = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db)
) -> Optional[User]:
    if not token:
        return None
    email = decode_access_token(token)
    if email is None:
        return None
    result = await db.execute(select(User).where(User.email == email))
    return result.scalars().first()

async def get_user_department_id(user: User, db: AsyncSession) -> Optional[str]:
    if hasattr(user, "department_id") and user.department_id:
        return user.department_id

    from app.models.faculty import FacultyProfile, Department
    res = await db.execute(select(FacultyProfile.department_id).where(FacultyProfile.user_id == user.id))
    f_dept_id = res.scalars().first()
    if f_dept_id:
        return f_dept_id

    if user.email:
        email_prefix = user.email.split("@")[0].lower()
        parts = email_prefix.split("_")
        possible_code = parts[1].upper() if len(parts) > 1 else parts[0].upper()
        d_res = await db.execute(select(Department.id).where(Department.code == possible_code))
        d_id = d_res.scalars().first()
        if d_id:
            return d_id

    all_d_res = await db.execute(select(Department.id).limit(1))
    return all_d_res.scalars().first()
