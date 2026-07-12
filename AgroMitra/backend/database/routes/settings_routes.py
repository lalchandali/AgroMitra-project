# ============================================================
#   AgroMitra — Platform Settings Routes
#   Admin panel থেকে platform fee % সেট/দেখার জন্য
# ============================================================

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.database.models.settings import PlatformSettings
from backend.database.models.user import User, UserRole
from backend.database.schemas.settings_schema import PlatformFeeResponse, PlatformFeeUpdate
from backend.database.routes.auth_routes import get_current_user

router = APIRouter(prefix="/api/v1/admin/settings", tags=["Admin Settings"])

PLATFORM_FEE_KEY = "platform_fee_percent"
DEFAULT_PLATFORM_FEE_PERCENT = 3.00  # DB-তে কোনো row না থাকলে এই default ব্যবহার হবে


def get_platform_fee_percent(db: Session) -> float:
    """
    বর্তমান platform fee percentage (যেমন 3.0 মানে 3%) রিটার্ন করে।
    order_routes.py এখান থেকেই fee পড়ে — আর হার্ডকোড করা constant নয়।
    """
    row = db.query(PlatformSettings).filter(PlatformSettings.key == PLATFORM_FEE_KEY).first()
    if row:
        return float(row.value)
    return DEFAULT_PLATFORM_FEE_PERCENT


# ── GET /api/v1/admin/settings/platform-fee ───────────────────
@router.get("/platform-fee", response_model=PlatformFeeResponse)
async def get_platform_fee(db: Session = Depends(get_db)):
    """
    বর্তমান platform fee % দেখাও। Public রাখা হয়েছে (login ছাড়াই দেখা
    যাবে) যাতে buyer/farmer চাইলে অর্ডার করার আগে fee % জানতে পারে।
    """
    return PlatformFeeResponse(platform_fee_percent=get_platform_fee_percent(db))


# ── PUT /api/v1/admin/settings/platform-fee ───────────────────
@router.put("/platform-fee", response_model=PlatformFeeResponse)
async def update_platform_fee(
    payload: PlatformFeeUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Admin panel থেকে platform fee % আপডেট করো (শুধু admin পারবে)।"""
    if current_user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Admin access required.")

    row = db.query(PlatformSettings).filter(PlatformSettings.key == PLATFORM_FEE_KEY).first()
    if row:
        row.value = payload.platform_fee_percent
    else:
        row = PlatformSettings(key=PLATFORM_FEE_KEY, value=payload.platform_fee_percent)
        db.add(row)

    db.commit()
    db.refresh(row)
    return PlatformFeeResponse(platform_fee_percent=float(row.value))
