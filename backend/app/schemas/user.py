from datetime import datetime
from pydantic import BaseModel, EmailStr, Field
from typing import Optional

class UserBase(BaseModel):
    email: EmailStr
    full_name: str

class UserCreate(UserBase):
    password: str = Field(..., min_length=6, description="Password must be at least 6 characters")
    role: str = Field("FACULTY", description="User role (ADMIN, HOD, FACULTY)")

class UserResponse(UserBase):
    id: str
    role: str
    created_at: datetime

    model_config = {
        "from_attributes": True
    }

class Token(BaseModel):
    access_token: str
    token_type: str
    role: str
    full_name: str
    email: str

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class VerifyOTPRequest(BaseModel):
    email: EmailStr
    otp_code: str = Field(..., min_length=6, max_length=6, description="6-digit verification code")

class ResetPasswordRequest(BaseModel):
    email: EmailStr
    otp_code: str = Field(..., min_length=6, max_length=6, description="6-digit verification code")
    new_password: str = Field(..., min_length=6, description="New password must be at least 6 characters")
