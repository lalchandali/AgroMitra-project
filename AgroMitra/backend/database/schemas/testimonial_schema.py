# ============================================================
#   AgroMitra — Testimonial Schemas (Pydantic)
# ============================================================

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from uuid import UUID


class TestimonialCreate(BaseModel):
    quote: str = Field(..., min_length=10, max_length=500, example="AgroMitra-তে সরাসরি buyer পাই, দাম ৪০% বেশি পাচ্ছি।")
    rating: int = Field(..., ge=1, le=5, example=5)


class TestimonialResponse(BaseModel):
    testimonial_id: UUID
    user_id: UUID
    name: str
    role: str
    district: Optional[str] = None
    profile_photo_url: Optional[str] = None
    quote: str
    rating: int
    is_approved: bool
    created_at: datetime

    class Config:
        from_attributes = True


class TestimonialStatusUpdate(BaseModel):
    is_approved: bool
