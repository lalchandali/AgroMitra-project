# ============================================================
#   AgroMitra — Order Management Routes
#   Place, Track, Update, Cancel orders
# ============================================================

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from uuid import UUID
from datetime import datetime

from backend.database import get_db
from backend.database.models.order import Order, OrderStatus, PaymentStatus
from backend.database.models.product import Product, ProductStatus
from backend.database.models.user import User, UserRole
from backend.database.schemas.order_schema import OrderCreate, OrderStatusUpdate, OrderResponse
from backend.database.routes.auth_routes import get_current_user
import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from backend.database.routes.settings_routes import get_platform_fee_percent

router = APIRouter(prefix="/api/v1/orders", tags=["Orders"])


# ── POST /api/v1/orders ───────────────────────────────────────
@router.post("/", response_model=OrderResponse)
async def place_order(
    order_data: OrderCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Buyer নতুন order place করো।"""

    # Product খোঁজো
    product = db.query(Product).filter(
        Product.product_id == order_data.product_id,
        Product.status == ProductStatus.active
    ).first()

    if not product:
        raise HTTPException(
            status_code=404, detail="Product not found or not available.")

    # নিজের product কিনতে পারবে না
    if str(product.farmer_id) == str(current_user.user_id):
        raise HTTPException(
            status_code=400, detail="You cannot order your own product.")

    # Quantity check
    if order_data.quantity_kg > float(product.quantity_kg):
        raise HTTPException(
            status_code=400,
            detail=f"Only {product.quantity_kg} kg available. You requested {order_data.quantity_kg} kg."
        )

    # Delivery address check
    if order_data.delivery_type.value == "delivery" and not order_data.delivery_address:
        raise HTTPException(
            status_code=400, detail="Delivery address required for delivery orders.")

    # Price calculation
    unit_price = float(product.unit_price_bdt)
    total_amount = round(unit_price * order_data.quantity_kg, 2)
    platform_fee_percent = get_platform_fee_percent(db)  # e.g. 3.0 মানে 3% — admin panel থেকে সেট করা
    platform_fee = round(total_amount * (platform_fee_percent / 100), 2)
    farmer_amount = round(total_amount - platform_fee, 2)

    # Order তৈরি করো
    new_order = Order(
        buyer_id=current_user.user_id,
        farmer_id=product.farmer_id,
        product_id=product.product_id,
        quantity_kg=order_data.quantity_kg,
        unit_price=unit_price,
        total_amount=total_amount,
        platform_fee=platform_fee,
        farmer_amount=farmer_amount,
        payment_method=order_data.payment_method,
        delivery_type=order_data.delivery_type,
        delivery_address=order_data.delivery_address,
        status=OrderStatus.placed,
        payment_status=PaymentStatus.in_escrow,
    )

    # Product quantity কমাও
    product.quantity_kg = float(product.quantity_kg) - order_data.quantity_kg
    if float(product.quantity_kg) <= 0:
        product.status = ProductStatus.sold_out

    db.add(new_order)
    db.commit()
    db.refresh(new_order)

    print(
        f"  🛒 New order: {new_order.order_id} | ৳{total_amount} | Escrow held")
    return new_order


# ── GET /api/v1/orders ────────────────────────────────────────
@router.get("/", response_model=List[OrderResponse])
async def get_my_orders(
    status: Optional[OrderStatus] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Buyer বা Farmer-এর সব orders দেখাও।"""
    if current_user.role == UserRole.farmer:
        query = db.query(Order).filter(Order.farmer_id == current_user.user_id)
    else:
        query = db.query(Order).filter(Order.buyer_id == current_user.user_id)

    if status:
        query = query.filter(Order.status == status)

    orders = query.order_by(Order.created_at.desc()).all()
    result = []
    for order in orders:
        order_dict = {c.name: getattr(order, c.name)
                      for c in order.__table__.columns}

        # Product name
        product = db.query(Product).filter(
            Product.product_id == order.product_id).first()
        order_dict['product_name'] = product.title_en if product else None
        order_dict['product_name_bn'] = product.title_bn if product else None

        # Buyer name
        buyer = db.query(User).filter(User.user_id == order.buyer_id).first()
        order_dict['buyer_name'] = buyer.name_en if buyer else None

        result.append(OrderResponse(**order_dict))

    return result


# ── GET /api/v1/orders/{order_id} ────────────────────────────
@router.get("/{order_id}", response_model=OrderResponse)
async def get_order(
    order_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """একটি order-এর details দেখাও।"""
    order = db.query(Order).filter(Order.order_id == order_id).first()

    if not order:
        raise HTTPException(status_code=404, detail="Order not found.")

    # শুধু buyer বা farmer দেখতে পারবে
    if str(order.buyer_id) != str(current_user.user_id) and \
       str(order.farmer_id) != str(current_user.user_id) and \
       current_user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Access denied.")

    return order


# ── PUT /api/v1/orders/{order_id}/status ─────────────────────
@router.put("/{order_id}/status", response_model=OrderResponse)
async def update_order_status(
    order_id: UUID,
    update: OrderStatusUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Order status update করো।"""
    order = db.query(Order).filter(Order.order_id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found.")

    new_status = update.status

    # Status flow validation
    farmer_actions = [OrderStatus.confirmed, OrderStatus.ready,
                      OrderStatus.dispatched, OrderStatus.shipped, OrderStatus.in_transit, OrderStatus.out_for_delivery, OrderStatus.delivered]
    buyer_actions = [OrderStatus.cancelled]

    if new_status in farmer_actions and str(order.farmer_id) != str(current_user.user_id):
        raise HTTPException(
            status_code=403, detail="Only the farmer can update to this status.")

    if new_status in buyer_actions and str(order.buyer_id) != str(current_user.user_id):
        raise HTTPException(
            status_code=403, detail="Only the buyer can update to this status.")

    order.status = new_status

    # Timestamps update
    if new_status == OrderStatus.confirmed:
        order.confirmed_at = datetime.utcnow()

    # Delivery confirmed → release escrow
    if new_status == OrderStatus.delivered:
        order.delivered_at = datetime.utcnow()
        order.payment_status = PaymentStatus.released
        print(f"  💰 Escrow released: ৳{order.farmer_amount} → Farmer")

    # Cancelled → refund
    if new_status == OrderStatus.cancelled:
        order.payment_status = PaymentStatus.refunded
        # Product quantity ফেরত দাও
        product = db.query(Product).filter(
            Product.product_id == order.product_id).first()
        if product:
            product.quantity_kg = float(
                product.quantity_kg) + float(order.quantity_kg)
            if product.status == ProductStatus.sold_out:
                product.status = ProductStatus.active

    db.commit()
    db.refresh(order)
    return order


# ── DELETE /api/v1/orders/{order_id} ─────────────────────────
@router.delete("/{order_id}")
async def cancel_order(
    order_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Order cancel করো (শুধু placed status-এ)।"""
    order = db.query(Order).filter(Order.order_id == order_id).first()

    if not order:
        raise HTTPException(status_code=404, detail="Order not found.")

    if str(order.buyer_id) != str(current_user.user_id):
        raise HTTPException(
            status_code=403, detail="Only the buyer can cancel this order.")

    if order.status != OrderStatus.placed:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot cancel order with status '{order.status.value}'. Only 'placed' orders can be cancelled."
        )

    order.status = OrderStatus.cancelled
    order.payment_status = PaymentStatus.refunded

    # Product quantity ফেরত দাও
    product = db.query(Product).filter(
        Product.product_id == order.product_id).first()
    if product:
        product.quantity_kg = float(
            product.quantity_kg) + float(order.quantity_kg)
        if product.status == ProductStatus.sold_out:
            product.status = ProductStatus.active

    db.commit()
    return {"message": "Order cancelled and payment refunded.", "order_id": str(order_id)}


# ── GET /api/v1/orders/admin/all ─────────────────────────────
@router.get("/admin/all", response_model=List[OrderResponse])
async def get_all_orders(
    status: Optional[OrderStatus] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Admin সব orders দেখতে পারবে।"""
    if current_user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Admin access required.")

    query = db.query(Order)
    if status:
        query = query.filter(Order.status == status)

    return query.order_by(Order.created_at.desc()).limit(100).all()
