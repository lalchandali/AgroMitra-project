# ============================================================
#   AgroMitra — User & Auth Schemas (Pydantic)
#   Request/Response data validation
# ============================================================

from pydantic import BaseModel, Field, field_validator
from typing import Optional
from datetime import datetime
from uuid import UUID
from backend.database.models.user import UserRole


# ============================================================
# REGISTRATION
# ============================================================
class UserRegister(BaseModel):
    mobile_number: str = Field(..., example="01711223344")
    name_en:       str = Field(..., example="Mohammad Rahim")
    name_bn:       Optional[str] = Field(None, example="মোহাম্মদ রহিম")
    role:          UserRole = Field(default=UserRole.farmer, example="farmer")
    district:      str = Field(..., example="Bogura")
    password:      str = Field(..., min_length=6, example="agromitra123")

    @field_validator("mobile_number")
    @classmethod
    def validate_mobile(cls, v):
        v = v.strip()
        if not v.isdigit() or len(v) != 11 or not v.startswith("01"):
            raise ValueError("Mobile number must be 11 digits starting with 01 (e.g., 01711223344)")
        return v


# ============================================================
# LOGIN
# ============================================================
class UserLogin(BaseModel):
    mobile_number: str = Field(..., example="01711223344")
    password:      str = Field(..., example="agromitra123")


# ============================================================
# OTP
# ============================================================
class OTPRequest(BaseModel):
    mobile_number: str = Field(..., example="01711223344")


class OTPVerify(BaseModel):
    mobile_number: str = Field(..., example="01711223344")
    otp:           str = Field(..., min_length=6, max_length=6, example="123456")


# ============================================================
# TOKEN RESPONSE
# ============================================================
class Token(BaseModel):
    access_token:  str
    refresh_token: str
    token_type:    str = "bearer"
    user:          "UserResponse"


class TokenRefresh(BaseModel):
    refresh_token: str


# ============================================================
# USER RESPONSE
# ============================================================
class UserResponse(BaseModel):
    user_id:           UUID
    mobile_number:     str
    name_en:           str
    name_bn:           Optional[str] = None
    role:              UserRole
    district:          Optional[str] = None
    is_verified:       bool
    is_active:         bool
    trust_score:       float
    created_at:        datetime
    profile_photo_url: Optional[str] = None  # ← এটা যোগ করো

    class Config:
        from_attributes = True


# ============================================================
# UPDATE PROFILE
# ============================================================
class UserUpdate(BaseModel):
    name_en:           Optional[str] = None
    name_bn:           Optional[str] = None
    district:          Optional[str] = None
    profile_photo_url: Optional[str] = None


# ============================================================
# PASSWORD RESET
# ============================================================
class PasswordResetRequest(BaseModel):
    mobile_number: str = Field(..., example="01711223344")


class PasswordResetConfirm(BaseModel):
    mobile_number: str = Field(..., example="01711223344")
    otp:           str = Field(..., min_length=6, max_length=6)
    new_password:  str = Field(..., min_length=6)


Token.model_rebuild()
