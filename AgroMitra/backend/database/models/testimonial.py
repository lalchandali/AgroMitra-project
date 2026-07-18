# ============================================================
#   AgroMitra — Testimonial Model
#   Farmer/Buyer/Consumer কেউই platform নিয়ে নিজের feedback
#   দিতে পারবে। Homepage-এ শুধু admin-approved testimonial
#   দেখানো হয় (spam/fake review ঠেকাতে)।
# ============================================================

import uuid
from backend.database.database import Base
from datetime import datetime
from sqlalchemy import Column, Integer, Text, DateTime, ForeignKey, Boolean
from sqlalchemy.dialects.postgresql import UUID


class Testimonial(Base):
    __tablename__ = "testimonials"
    __table_args__ = {'extend_existing': True}

    testimonial_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id         = Column(UUID(as_uuid=True), ForeignKey("users.user_id"), nullable=False, unique=True)

    quote   = Column(Text, nullable=False)
    rating  = Column(Integer, nullable=False)   # 1–5

    is_approved = Column(Boolean, default=False)   # admin না মেলালে homepage-এ দেখাবে না
    created_at  = Column(DateTime, default=datetime.utcnow)
    updated_at  = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f"<Testimonial {self.testimonial_id} - {self.rating}★ approved={self.is_approved}>"
