# ============================================================
#   AgroMitra — Order Schemas (Pydantic)
# ============================================================

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from uuid import UUID
from backend.database.models.order import OrderStatus, PaymentStatus, PaymentMethod, DeliveryType


# ── Nested Mini Schemas for Relationship Data ──────────────────
class ProductMinimalResponse(BaseModel):
    title: str = Field(..., example="দেশী আলু (Diamond)")
    # ভবিষ্যতে প্রোডাক্টের ছবি বা ক্যাটাগরি লাগলে এখানে যোগ করতে পারবেন

    class Config:
        from_attributes = True


class UserMinimalResponse(BaseModel):
    full_name: str = Field(..., example="মোঃ রফিকুল ইসলাম")
    # ফোন নম্বর বা প্রোফাইল পিকচার লাগলে এখানে যোগ করা যাবে

    class Config:
        from_attributes = True


# ── Place Order ───────────────────────────────────────────────
class OrderCreate(BaseModel):
    product_id: UUID
    quantity_kg: float = Field(..., gt=0, example=50.0)
    payment_method: PaymentMethod = Field(..., example="bkash")
    delivery_type: DeliveryType = Field(..., example="pickup")
    delivery_address: Optional[str] = Field(
        None, example="House 12, Road 5, Dhaka")


# ── Update Order Status ───────────────────────────────────────
class OrderStatusUpdate(BaseModel):
    status: OrderStatus = Field(..., example="confirmed")


# ── Order Response ────────────────────────────────────────────
class OrderResponse(BaseModel):
    order_id: UUID
    buyer_id: UUID
    farmer_id: UUID
    product_id: UUID
    quantity_kg: float
    unit_price: float
    total_amount: float
    platform_fee: float
    farmer_amount: float
    status: OrderStatus
    payment_status: PaymentStatus
    payment_method: PaymentMethod
    delivery_type: DeliveryType
    delivery_address: Optional[str]
    created_at: datetime
    confirmed_at: Optional[datetime]
    delivered_at: Optional[datetime]
    product: Optional[ProductMinimalResponse] = None
    buyer: Optional[UserMinimalResponse] = None
    farmer: Optional[UserMinimalResponse] = None
    product_name: Optional[str] = None
    buyer_name: Optional[str] = None
    farmer_name: Optional[str] = None

    class Config:
        from_attributes = True
