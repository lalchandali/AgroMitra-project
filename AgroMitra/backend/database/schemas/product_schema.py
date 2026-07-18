# ============================================================
#   AgroMitra — Product Schemas (Pydantic)
# ============================================================

from pydantic import BaseModel, Field  # type: ignore[import]
from typing import Optional
from datetime import datetime
from uuid import UUID
from backend.database.models.product import QualityGrade, ProductStatus


class ProductCreate(BaseModel):
    title_en       : str            = Field(..., example="Fresh Tomato")
    title_bn       : Optional[str]  = Field(None, example="তাজা টমেটো")
    category       : str            = Field(..., example="Vegetable")
    description_en : Optional[str]  = Field(None, example="Fresh organic tomatoes from Bogura")
    quantity_kg    : float          = Field(..., gt=0, example=500.0)
    unit_price_bdt : float          = Field(..., gt=0, example=22.0)
    quality_grade  : QualityGrade   = Field(default=QualityGrade.A)
    district       : str            = Field(..., example="Bogura")
    is_organic     : bool           = Field(default=False)
    harvest_date   : Optional[datetime] = None
    availability_until: Optional[datetime] = None


class ProductUpdate(BaseModel):
    title_en       : Optional[str]   = None
    title_bn       : Optional[str]   = None
    description_en : Optional[str]   = None
    quantity_kg    : Optional[float] = None
    unit_price_bdt : Optional[float] = None
    quality_grade  : Optional[QualityGrade] = None
    is_organic     : Optional[bool]  = None
    status         : Optional[ProductStatus] = None
    availability_until: Optional[datetime] = None


class ProductResponse(BaseModel):
    product_id     : UUID
    farmer_id      : UUID
    farmer_name    : Optional[str] = None   # joined from User table
    farmer_photo_url: Optional[str] = None  # joined from User table
    title_en       : str
    title_bn       : Optional[str]
    category       : str
    description_en : Optional[str]
    quantity_kg    : float
    unit_price_bdt : float
    quality_grade  : QualityGrade
    district       : str
    is_organic     : bool
    image_url      : Optional[str] = None   # photos[0] থেকে আসে, DB-তে multiple photo রাখার জায়গা থাকলেও frontend আপাতত একটাই ব্যবহার করে
    ai_fair_price_min: Optional[float]
    ai_fair_price_max: Optional[float]
    status         : ProductStatus
    views_count    : int
    created_at     : datetime
    average_rating : Optional[float] = None   # reviews থেকে aggregate করা, review না থাকলে None
    review_count   : int = 0

    class Config:
        from_attributes = True
