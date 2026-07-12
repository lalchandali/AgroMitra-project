# ============================================================
#   AgroMitra — Order Schemas (Pydantic)
#   একটা Order-এ এখন একাধিক OrderItem (product line) থাকতে পারে।
# ============================================================

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from uuid import UUID
from backend.database.models.order import OrderStatus, PaymentStatus, PaymentMethod, DeliveryType


# ── Place Order ───────────────────────────────────────────────
class OrderItemCreate(BaseModel):
    product_id: UUID
    quantity_kg: float = Field(..., gt=0, example=50.0)


class OrderCreate(BaseModel):
    # সব item একই farmer-এর হতে হবে — এক Order = এক farmer-এর একটা checkout।
    # আলাদা farmer-এর product থাকলে frontend প্রতি farmer-এর জন্য আলাদা
    # OrderCreate পাঠাবে (cart-কে farmer অনুযায়ী group করে)।
    items: List[OrderItemCreate] = Field(..., min_length=1)
    payment_method: PaymentMethod = Field(..., example="bkash")
    delivery_type: DeliveryType = Field(..., example="pickup")
    delivery_address: Optional[str] = Field(
        None, example="House 12, Road 5, Dhaka")


# ── Update Order Status ───────────────────────────────────────
class OrderStatusUpdate(BaseModel):
    status: OrderStatus = Field(..., example="confirmed")


# ── Order Item Response ─────────────────────────────────────
class OrderItemResponse(BaseModel):
    order_item_id: UUID
    product_id: UUID
    quantity_kg: float
    unit_price: float
    subtotal: float
    product_name: Optional[str] = None
    product_name_bn: Optional[str] = None
    product_image_url: Optional[str] = None

    class Config:
        from_attributes = True


# ── Order Response ────────────────────────────────────────────
class OrderResponse(BaseModel):
    order_id: UUID
    buyer_id: UUID
    farmer_id: UUID
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
    buyer_name: Optional[str] = None
    farmer_name: Optional[str] = None
    items: List[OrderItemResponse] = []

    class Config:
        from_attributes = True
