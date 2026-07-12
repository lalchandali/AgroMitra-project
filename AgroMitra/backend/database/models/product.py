# ============================================================
#   AgroMitra — Product Model
#   Represents farmer product listings
# ============================================================

import uuid
from backend.database.database import Base
from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, Numeric, Integer, Text, Enum, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, ARRAY
import enum


class QualityGrade(str, enum.Enum):
    A = "A"
    B = "B"
    C = "C"


class ProductStatus(str, enum.Enum):
    active   = "active"
    sold_out = "sold_out"
    expired  = "expired"
    removed  = "removed"


class Product(Base):
    __tablename__ = "products"
    __table_args__ = {'extend_existing': True}

    product_id     = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    farmer_id      = Column(UUID(as_uuid=True), ForeignKey("users.user_id"), nullable=False)

    title_en       = Column(String(150), nullable=False)
    title_bn       = Column(String(200), nullable=True)
    category       = Column(String(50), nullable=False)     # Vegetable, Fruit, Grain, Spice
    description_en = Column(Text, nullable=True)

    quantity_kg    = Column(Numeric(10, 2), nullable=False)
    unit_price_bdt = Column(Numeric(10, 2), nullable=False)
    quality_grade  = Column(Enum(QualityGrade), default=QualityGrade.A)

    photos         = Column(ARRAY(String), nullable=True)   # S3 URLs array
    district       = Column(String(50), nullable=False)

    harvest_date       = Column(DateTime, nullable=True)
    availability_until = Column(DateTime, nullable=True)
    is_organic         = Column(Boolean, default=False)

    ai_fair_price_min = Column(Numeric(10, 2), nullable=True)
    ai_fair_price_max = Column(Numeric(10, 2), nullable=True)

    status      = Column(Enum(ProductStatus), default=ProductStatus.active)
    views_count = Column(Integer, default=0)
    created_at  = Column(DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f"<Product {self.title_en} - {self.quantity_kg}kg @ ৳{self.unit_price_bdt}>"

    @property
    def image_url(self):
        """
        photos array-এর প্রথম ছবিটাকে "main image" হিসেবে ব্যবহার করা হয়।
        Frontend আপাতত একটাই ছবি আপলোড করে, তাই এই singular property-টা
        ProductResponse-এ সরাসরি ব্যবহার হয় (SQLAlchemy attribute হিসেবেই
        দেখা যায়, তাই Pydantic-এর from_attributes সাথে সাথে কাজ করে)।
        """
        return self.photos[0] if self.photos else None
