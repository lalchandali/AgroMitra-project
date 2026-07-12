# ============================================================
#   AgroMitra — Order Model
#   Represents transactions between buyers and farmers
# ============================================================

import uuid
from backend.database.database import Base
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Numeric, Enum, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
import enum


class OrderStatus(str, enum.Enum):
    placed = "placed"
    confirmed = "confirmed"
    ready = "ready"
    dispatched = "dispatched"
    shipped = "shipped"
    in_transit = "in_transit"
    out_for_delivery = "out_for_delivery"
    delivered = "delivered"
    cancelled = "cancelled"
    disputed = "disputed"


class PaymentStatus(str, enum.Enum):
    pending = "pending"
    in_escrow = "in_escrow"
    released = "released"
    refunded = "refunded"
    failed = "failed"


class PaymentMethod(str, enum.Enum):
    bkash = "bkash"
    nagad = "nagad"
    bank_transfer = "bank_transfer"


class DeliveryType(str, enum.Enum):
    pickup = "pickup"
    delivery = "delivery"


class Order(Base):
    __tablename__ = "orders"
    __table_args__ = {'extend_existing': True}

    order_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    buyer_id = Column(UUID(as_uuid=True), ForeignKey(
        "users.user_id"), nullable=False)

    farmer_id = Column(UUID(as_uuid=True), ForeignKey(
        "users.user_id"), nullable=False)
    # ── product_id / quantity_kg / unit_price এখন এখানে নেই ──
    # একটা order-এ একাধিক product থাকতে পারে, তাই সেগুলো এখন
    # OrderItem (order_items টেবিল)-এ প্রতিটা লাইন হিসেবে থাকে।
    # (backend/database/models/order_item.py দেখুন)

    total_amount = Column(Numeric(12, 2), nullable=False)
    platform_fee = Column(Numeric(10, 2), nullable=False)
    farmer_amount = Column(Numeric(12, 2), nullable=False)

    status = Column(Enum(OrderStatus), default=OrderStatus.placed)
    payment_status = Column(Enum(PaymentStatus), default=PaymentStatus.pending)
    payment_method = Column(Enum(PaymentMethod), nullable=False)
    delivery_type = Column(Enum(DeliveryType), nullable=False)
    delivery_address = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    confirmed_at = Column(DateTime, nullable=True)
    delivered_at = Column(DateTime, nullable=True)

    def __repr__(self):
        return f"<Order {self.order_id} - ৳{self.total_amount} - {self.status} - {self.payment_status}>"
