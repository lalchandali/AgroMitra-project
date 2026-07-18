# ============================================================
#   AgroMitra — Testimonial Routes
#   Farmer/Buyer/Consumer platform নিয়ে feedback দেয়; admin
#   approve করলেই সেটা homepage-এ "Farmer & Buyer Stories"
#   section-এ দেখানো হয়।
# ============================================================

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID

from backend.database import get_db
from backend.database.models.testimonial import Testimonial
from backend.database.models.user import User, UserRole
from backend.database.schemas.testimonial_schema import (
    TestimonialCreate, TestimonialResponse, TestimonialStatusUpdate
)
from backend.database.routes.auth_routes import get_current_user

router = APIRouter(prefix="/api/v1/testimonials", tags=["Testimonials"])

ROLE_LABELS = {
    UserRole.farmer:   "🌾 Farmer",
    UserRole.buyer:    "🛒 Buyer",
    UserRole.consumer: "🧺 Consumer",
    UserRole.admin:    "🛠️ Admin",
}


def _build_response(t: Testimonial, user: User) -> TestimonialResponse:
    return TestimonialResponse(
        testimonial_id=t.testimonial_id,
        user_id=t.user_id,
        name=user.name_en if user else "AgroMitra User",
        role=ROLE_LABELS.get(user.role, str(user.role)) if user else "",
        district=user.district if user else None,
        profile_photo_url=user.profile_photo_url if user else None,
        quote=t.quote,
        rating=t.rating,
        is_approved=t.is_approved,
        created_at=t.created_at,
    )


# ── POST /api/v1/testimonials ───────────────────────────────
@router.post("/", response_model=TestimonialResponse)
async def submit_testimonial(
    payload: TestimonialCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Login করা যেকোনো user (farmer/buyer/consumer) platform নিয়ে একটা
    feedback জমা দিতে পারে। আগে থেকে থাকলে সেটা আপডেট হয়ে যাবে এবং
    পুনরায় approval-এর জন্য pending-এ চলে যাবে।"""
    existing = db.query(Testimonial).filter(Testimonial.user_id == current_user.user_id).first()
    if existing:
        existing.quote = payload.quote
        existing.rating = payload.rating
        existing.is_approved = False
        db.commit()
        db.refresh(existing)
        return _build_response(existing, current_user)

    testimonial = Testimonial(
        user_id=current_user.user_id,
        quote=payload.quote,
        rating=payload.rating,
    )
    db.add(testimonial)
    db.commit()
    db.refresh(testimonial)
    return _build_response(testimonial, current_user)


# ── GET /api/v1/testimonials/my ─────────────────────────────
@router.get("/my", response_model=TestimonialResponse)
async def get_my_testimonial(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    t = db.query(Testimonial).filter(Testimonial.user_id == current_user.user_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="No testimonial submitted yet.")
    return _build_response(t, current_user)


# ── GET /api/v1/testimonials/featured ───────────────────────
@router.get("/featured", response_model=List[TestimonialResponse])
async def get_featured_testimonials(limit: int = Query(6, ge=1, le=20), db: Session = Depends(get_db)):
    """Homepage-এর জন্য public endpoint — শুধু admin-approved testimonial,
    সবচেয়ে বেশি rating ও সাম্প্রতিকগুলো আগে।"""
    rows = db.query(Testimonial, User).join(User, Testimonial.user_id == User.user_id) \
        .filter(Testimonial.is_approved == True) \
        .order_by(Testimonial.rating.desc(), Testimonial.created_at.desc()) \
        .limit(limit).all()
    return [_build_response(t, u) for t, u in rows]


# ── GET /api/v1/testimonials/admin/all ──────────────────────
@router.get("/admin/all", response_model=List[TestimonialResponse])
async def admin_list_testimonials(
    status: str = Query("pending", pattern="^(pending|approved|all)$"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Admin access required.")

    q = db.query(Testimonial, User).join(User, Testimonial.user_id == User.user_id)
    if status == "pending":
        q = q.filter(Testimonial.is_approved == False)
    elif status == "approved":
        q = q.filter(Testimonial.is_approved == True)

    rows = q.order_by(Testimonial.created_at.desc()).all()
    return [_build_response(t, u) for t, u in rows]


# ── PUT /api/v1/testimonials/admin/{testimonial_id}/status ─
@router.put("/admin/{testimonial_id}/status", response_model=TestimonialResponse)
async def admin_update_status(
    testimonial_id: UUID,
    payload: TestimonialStatusUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Admin access required.")

    t = db.query(Testimonial).filter(Testimonial.testimonial_id == testimonial_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Testimonial not found.")

    t.is_approved = payload.is_approved
    db.commit()
    db.refresh(t)
    user = db.query(User).filter(User.user_id == t.user_id).first()
    return _build_response(t, user)


# ── DELETE /api/v1/testimonials/admin/{testimonial_id} ──────
@router.delete("/admin/{testimonial_id}")
async def admin_delete_testimonial(
    testimonial_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Admin access required.")

    t = db.query(Testimonial).filter(Testimonial.testimonial_id == testimonial_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Testimonial not found.")

    db.delete(t)
    db.commit()
    return {"success": True, "message": "Testimonial deleted."}
