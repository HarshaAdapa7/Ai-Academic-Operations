import logging
import random
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
import aiosmtplib
from email.mime.text import MIMEText

from app.core.config import settings
from app.core.database import get_db
from app.core.security import get_password_hash, verify_password, create_access_token
from app.models.user import User, PasswordReset, UserRole
from app.schemas.user import UserCreate, UserResponse, Token, ForgotPasswordRequest, VerifyOTPRequest, ResetPasswordRequest
from app.api.deps import get_current_user

# Setup logger
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("auth-api")

router = APIRouter()

async def send_otp_email(email: str, otp_code: str):
    """Utility to send OTP code to user's email asynchronously."""
    subject = "Your Verification OTP - AI Academic Operations"
    body = f"Hello,\n\nYour One-Time Password (OTP) for password recovery is: {otp_code}\n\nThis code will expire in 10 minutes.\n\nBest regards,\nAI Academic Operations Team"
    
    if not settings.SMTP_HOST:
        logger.warning(f"\n========================================\n[DEV-ONLY] OTP Email Not Sent (SMTP_HOST is empty)\nRecipient: {email}\nOTP Code: {otp_code}\n========================================\n")
        return

    message = MIMEText(body)
    message["Subject"] = subject
    message["From"] = settings.SMTP_FROM_EMAIL
    message["To"] = email

    try:
        await aiosmtplib.send(
            message,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            username=settings.SMTP_USER,
            password=settings.SMTP_PASSWORD,
            start_tls=True if settings.SMTP_PORT == 587 else False
        )
        logger.info(f"OTP Email sent successfully to {email}")
    except Exception as e:
        logger.error(f"Failed to send email to {email}: {str(e)}")
        logger.warning(f"\n========================================\n[FALLBACK] OTP Code: {otp_code}\n========================================\n")

@router.post("/signup", response_model=UserResponse)
async def signup(user_in: UserCreate, db: AsyncSession = Depends(get_db)):
    email_clean = user_in.email.strip().lower()
    
    # Check if user already exists
    result = await db.execute(select(User).where(User.email == email_clean))
    existing_user = result.scalars().first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email already exists"
        )
    
    # Check if role is valid
    if user_in.role not in [UserRole.ADMIN, UserRole.HOD, UserRole.FACULTY]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid role selected. Allowed: ADMIN, HOD, FACULTY"
        )

    # First user registered in the system automatically gets ADMIN role
    role_to_assign = user_in.role
    result_any = await db.execute(select(User).limit(1))
    if not result_any.scalars().first():
        role_to_assign = UserRole.ADMIN
        logger.info(f"System bootstrapping: First user {email_clean} registered as ADMIN")

    hashed_pw = get_password_hash(user_in.password)
    new_user = User(
        email=email_clean,
        password_hash=hashed_pw,
        full_name=user_in.full_name.strip(),
        role=role_to_assign
    )
    
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    return new_user

@router.post("/login", response_model=Token)
async def login(login_data: UserCreate, db: AsyncSession = Depends(get_db)):
    email_clean = login_data.email.strip().lower()
    
    # Find user by email
    result = await db.execute(select(User).where(User.email == email_clean))
    user = result.scalars().first()
    if not user or not verify_password(login_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Generate access token
    access_token = create_access_token(subject=user.email)
    token_str = access_token.decode('utf-8') if isinstance(access_token, bytes) else str(access_token)
    role_str = user.role.value if hasattr(user.role, 'value') else str(user.role)

    return {
        "access_token": token_str,
        "token_type": "bearer",
        "role": role_str,
        "full_name": user.full_name,
        "email": user.email
    }

@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user

@router.post("/forgot-password")
async def forgot_password(req: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    email_clean = req.email.strip().lower()
    
    # Check if user exists
    result = await db.execute(select(User).where(User.email == email_clean))
    user = result.scalars().first()
    if not user:
        # Prevent user enumeration for security
        return {"message": "If this email is registered, an OTP has been sent."}

    # Generate 6-digit OTP code
    otp = f"{random.randint(100000, 999999)}"
    expiry = datetime.utcnow() + timedelta(minutes=10)
    
    new_reset = PasswordReset(
        email=email_clean,
        otp_code=otp,
        expires_at=expiry,
        is_verified=False
    )
    db.add(new_reset)
    await db.commit()

    # Send Email asynchronously
    await send_otp_email(email_clean, otp)
    
    return {"message": "If this email is registered, an OTP has been sent."}

@router.post("/verify-otp")
async def verify_otp(req: VerifyOTPRequest, db: AsyncSession = Depends(get_db)):
    email_clean = req.email.strip().lower()
    otp_clean = req.otp_code.strip()
    
    result = await db.execute(
        select(PasswordReset)
        .where(PasswordReset.email == email_clean)
        .where(PasswordReset.otp_code == otp_clean)
        .where(PasswordReset.is_verified == False)
        .order_by(PasswordReset.created_at.desc())
    )
    reset_request = result.scalars().first()
    
    # Perform expiration check directly in Python to avoid DB timezone translation differences
    if not reset_request or reset_request.expires_at < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired OTP code"
        )
    
    reset_request.is_verified = True
    await db.commit()
    
    return {"message": "OTP verified successfully. You may now reset your password."}

@router.post("/reset-password")
async def reset_password(req: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    email_clean = req.email.strip().lower()
    otp_clean = req.otp_code.strip()
    
    # Check if the OTP was verified
    result = await db.execute(
        select(PasswordReset)
        .where(PasswordReset.email == email_clean)
        .where(PasswordReset.otp_code == otp_clean)
        .where(PasswordReset.is_verified == True)
    )
    reset_request = result.scalars().first()
    
    # Verify validity window in Python
    if not reset_request or reset_request.expires_at < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="OTP verification has expired or was not completed. Please request a new OTP."
        )

    # Fetch user
    user_result = await db.execute(select(User).where(User.email == email_clean))
    user = user_result.scalars().first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    # Update password
    user.password_hash = get_password_hash(req.new_password)
    
    # Invalidate reset request
    await db.delete(reset_request)
    await db.commit()

    return {"message": "Password reset successfully. You can now login."}
