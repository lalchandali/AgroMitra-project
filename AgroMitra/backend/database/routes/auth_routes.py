# ============================================================
#   AgroMitra — Authentication Routes
#   Register, Login, OTP, Profile, Password Reset
# ============================================================

from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi import UploadFile, File
import uuid
import os
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import datetime
from typing import List, Optional
from fastapi import Query
from backend.database.models.user import User, UserRole

from backend.database import get_db
from backend.database.models.user import User
from backend.database.schemas.user_schema import (
    UserRegister, UserLogin, OTPRequest, OTPVerify,
    Token, TokenRefresh, UserResponse, UserUpdate,
    PasswordResetRequest, PasswordResetConfirm
)
from backend.database.utils.security import (
    hash_password, verify_password,
    create_access_token, create_refresh_token, decode_token,
    generate_otp, verify_otp
)

router = APIRouter(prefix="/api/v1/auth", tags=["Authentication"])

# ── Get current user helper ───────────────────────────────────
security = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> User:
    token = credentials.credentials
    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        raise HTTPException(
            status_code=401, detail="Invalid or expired token.")
    user = db.query(User).filter(
        User.user_id == payload.get("user_id")).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account suspended.")
    return user


# ── POST /api/v1/auth/request-otp ────────────────────────────
@router.post("/request-otp")
async def request_otp(req: OTPRequest):
    otp = generate_otp(req.mobile_number)
    print(f"  📱 OTP for {req.mobile_number}: {otp}")
    return {"message": f"OTP sent to {req.mobile_number}", "dev_otp": otp, "expires": "5 minutes"}


# ── POST /api/v1/auth/verify-otp ─────────────────────────────
@router.post("/verify-otp")
async def verify_otp_route(req: OTPVerify, db: Session = Depends(get_db)):
    is_valid, message = verify_otp(req.mobile_number, req.otp)
    if not is_valid:
        raise HTTPException(status_code=400, detail=message)
    user = db.query(User).filter(
        User.mobile_number == req.mobile_number).first()
    if user:
        user.is_verified = True
        db.commit()
    return {"message": message, "verified": True}


# ── POST /api/v1/auth/register ───────────────────────────────
@router.post("/register", response_model=UserResponse)
async def register(user_data: UserRegister, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.mobile_number ==
                                     user_data.mobile_number).first()
    if existing:
        raise HTTPException(
            status_code=400, detail="Mobile number already registered.")
    new_user = User(
        mobile_number=user_data.mobile_number,
        name_en=user_data.name_en,
        name_bn=user_data.name_bn,
        role=user_data.role,
        district=user_data.district,
        password_hash=hash_password(user_data.password),
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


# ── POST /api/v1/auth/login ──────────────────────────────────
@router.post("/login", response_model=Token)
async def login(user_data: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.mobile_number ==
                                 user_data.mobile_number).first()
    if not user:
        raise HTTPException(
            status_code=401, detail="Mobile number not registered.")
    if not verify_password(user_data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect password.")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account suspended.")
    user.last_login_at = datetime.utcnow()
    db.commit()
    token_data = {"user_id": str(
        user.user_id), "mobile": user.mobile_number, "role": user.role.value}
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)
    return Token(access_token=access_token, refresh_token=refresh_token, token_type="bearer", user=user)


# ── POST /api/v1/auth/refresh-token ──────────────────────────
@router.post("/refresh-token")
async def refresh_token_route(req: TokenRefresh):
    payload = decode_token(req.refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid refresh token.")
    new_token = create_access_token({"user_id": payload.get(
        "user_id"), "mobile": payload.get("mobile"), "role": payload.get("role")})
    return {"access_token": new_token, "token_type": "bearer"}


# ── GET /api/v1/auth/me ───────────────────────────────────────
@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user


# ── PUT /api/v1/auth/profile ─────────────────────────────────
@router.put("/profile", response_model=UserResponse)
async def update_profile(update_data: UserUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if update_data.name_en:
        current_user.name_en = update_data.name_en
    if update_data.name_bn:
        current_user.name_bn = update_data.name_bn
    if update_data.district:
        current_user.district = update_data.district
    if update_data.profile_photo_url:
        current_user.profile_photo_url = update_data.profile_photo_url
    db.commit()
    db.refresh(current_user)
    return current_user


# ── POST /api/v1/auth/forgot-password ────────────────────────
@router.post("/forgot-password")
async def forgot_password(req: PasswordResetRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(
        User.mobile_number == req.mobile_number).first()
    if not user:
        raise HTTPException(status_code=404, detail="Mobile number not found.")
    otp = generate_otp(req.mobile_number)
    print(f"  🔑 Reset OTP for {req.mobile_number}: {otp}")
    return {"message": "Password reset OTP sent.", "dev_otp": otp}


# ── POST /api/v1/auth/reset-password ─────────────────────────
@router.post("/reset-password")
async def reset_password(req: PasswordResetConfirm, db: Session = Depends(get_db)):
    is_valid, message = verify_otp(req.mobile_number, req.otp)
    if not is_valid:
        raise HTTPException(status_code=400, detail=message)
    user = db.query(User).filter(
        User.mobile_number == req.mobile_number).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    user.password_hash = hash_password(req.new_password)
    db.commit()
    return {"message": "Password reset successfully."}


# ── DELETE /api/v1/auth/account ──────────────────────────────
@router.delete("/account")
async def deactivate_account(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    current_user.is_active = False
    db.commit()
    return {"message": "Account deactivated successfully."}

# ── GET /api/v1/auth/admin/users ──────────────────────────────
@router.get("/admin/users", response_model=List[UserResponse], tags=["Authentication"])
async def get_all_users(
    role: Optional[UserRole] = Query(None),
    search: Optional[str] = Query(
        None, description="Search by name or mobile number"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Admin সব users দেখতে পারবে — role অনুযায়ী filter ও নাম/মোবাইল দিয়ে search করা যাবে।"""
    if current_user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Admin access required.")

    query = db.query(User)

    if role:
        query = query.filter(User.role == role)

    if search:
        like_pattern = f"%{search}%"
        query = query.filter(
            (User.name_en.ilike(like_pattern)) |
            (User.mobile_number.ilike(like_pattern))
        )

    return query.order_by(User.created_at.desc()).limit(200).all()


# ── PUT /api/v1/auth/admin/users/{user_id}/status ─────────────
@router.put("/admin/users/{user_id}/status", response_model=UserResponse, tags=["Authentication"])
async def update_user_status(
    user_id: str,
    is_active: bool,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Admin কোনো user-কে suspend/activate করতে পারবে।"""
    if current_user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Admin access required.")

    target_user = db.query(User).filter(User.user_id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found.")

    if str(target_user.user_id) == str(current_user.user_id):
        raise HTTPException(
            status_code=400, detail="You cannot change your own account status.")

    target_user.is_active = is_active
    db.commit()
    db.refresh(target_user)
    return target_user


# ── PUT /api/v1/auth/admin/users/{user_id}/verify ─────────────
@router.put("/admin/users/{user_id}/verify", response_model=UserResponse, tags=["Authentication"])
async def verify_user(
    user_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Admin কোনো user-কে verified mark করতে পারবে।"""
    if current_user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Admin access required.")

    target_user = db.query(User).filter(User.user_id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found.")

    target_user.is_verified = True
    db.commit()
    db.refresh(target_user)
    return target_user


UPLOAD_DIR = "uploads/profile_photos"
os.makedirs(UPLOAD_DIR, exist_ok=True)


@router.post("/upload-photo")
async def upload_profile_photo(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # File type check
    if file.content_type not in ["image/jpeg", "image/png", "image/webp"]:
        raise HTTPException(
            status_code=400, detail="Only JPG, PNG, WebP allowed.")

    # File size check (max 2MB)
    contents = await file.read()
    if len(contents) > 2 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large. Max 2MB.")

    # Save file
    ext = file.filename.split(".")[-1]
    filename = f"{current_user.user_id}_{uuid.uuid4().hex[:8]}.{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)

    with open(filepath, "wb") as f:
        f.write(contents)

    # DB update
    photo_url = f"/uploads/profile_photos/{filename}"
    db.query(User).filter(User.user_id == current_user.user_id).update(
        {"profile_photo_url": photo_url}
    )
    db.commit()

    return {"photo_url": photo_url}
