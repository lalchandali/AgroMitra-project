# ============================================================
#   AgroMitra — Order Item Model
#   একটা Order-এর ভিতরে একাধিক product line হিসেবে থাকে।
#   Order = এক buyer + এক farmer + এক checkout; OrderItem = তার
#   ভিতরের প্রতিটা আলাদা product লাইন (qty, দাম, subtotal সহ)।
# ============================================================

import uuid
from backend.database.database import Base
from sqlalchemy import Column, Numeric, ForeignKey
from sqlalchemy.dialects.postgresql import UUID


class OrderItem(Base):
    __tablename__ = "order_items"
    __table_args__ = {'extend_existing': True}

    order_item_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    order_id      = Column(UUID(as_uuid=True), ForeignKey("orders.order_id"), nullable=False)
    product_id    = Column(UUID(as_uuid=True), ForeignKey("products.product_id"), nullable=False)

    quantity_kg = Column(Numeric(10, 2), nullable=False)
    unit_price  = Column(Numeric(10, 2), nullable=False)   # অর্ডার করার সময়কার দাম (পরে product-এর দাম বদলালেও এটা অপরিবর্তিত থাকে)
    subtotal    = Column(Numeric(12, 2), nullable=False)   # quantity_kg * unit_price

    def __repr__(self):
        return f"<OrderItem {self.order_item_id} - {self.quantity_kg}kg @ ৳{self.unit_price}>"
