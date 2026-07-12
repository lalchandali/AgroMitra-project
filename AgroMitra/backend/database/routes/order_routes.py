# ============================================================
#   AgroMitra — Order Management Routes
#   Place, Track, Update, Cancel orders
#   একটা Order-এ একাধিক product (OrderItem) থাকতে পারে —
#   একই farmer থেকে কেনা সব product এক Order-এ group হয়ে যায়।
# ============================================================

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from uuid import UUID
from datetime import datetime
import sys

# Windows console UTF-8 fix এখন main.py-এর একদম শুরুতে একবারই করা হয়
# (sys.stdout.reconfigure) — তাই এখানে আলাদা করে stdout wrap করার
# দরকার নেই।

from backend.database import get_db
from backend.database.models.order import Order, OrderStatus, PaymentStatus
from backend.database.models.order_item import OrderItem
from backend.database.models.product import Product, ProductStatus
from backend.database.models.user import User, UserRole
from backend.database.schemas.order_schema import OrderCreate, OrderStatusUpdate, OrderResponse, OrderItemResponse
from backend.database.routes.auth_routes import get_current_user
from backend.database.routes.settings_routes import get_platform_fee_percent

router = APIRouter(prefix="/api/v1/orders", tags=["Orders"])


# ── Helper: Order + তার সব items + product/user নাম জুড়ে একটা OrderResponse বানাও ──
def _build_order_response(order: Order, db: Session) -> OrderResponse:
    items = db.query(OrderItem).filter(OrderItem.order_id == order.order_id).all()

    product_ids = [i.product_id for i in items]
    products = {}
    if product_ids:
        rows = db.query(Product).filter(Product.product_id.in_(product_ids)).all()
        products = {p.product_id: p for p in rows}

    item_responses = []
    for i in items:
        p = products.get(i.product_id)
        item_responses.append(OrderItemResponse(
            order_item_id=i.order_item_id,
            product_id=i.product_id,
            quantity_kg=float(i.quantity_kg),
            unit_price=float(i.unit_price),
            subtotal=float(i.subtotal),
            product_name=p.title_en if p else None,
            product_name_bn=p.title_bn if p else None,
            product_image_url=p.image_url if p else None,
        ))

    buyer = db.query(User).filter(User.user_id == order.buyer_id).first()
    farmer = db.query(User).filter(User.user_id == order.farmer_id).first()

    return OrderResponse(
        order_id=order.order_id,
        buyer_id=order.buyer_id,
        farmer_id=order.farmer_id,
        total_amount=float(order.total_amount),
        platform_fee=float(order.platform_fee),
        farmer_amount=float(order.farmer_amount),
        status=order.status,
        payment_status=order.payment_status,
        payment_method=order.payment_method,
        delivery_type=order.delivery_type,
        delivery_address=order.delivery_address,
        created_at=order.created_at,
        confirmed_at=order.confirmed_at,
        delivered_at=order.delivered_at,
        buyer_name=buyer.name_en if buyer else None,
        farmer_name=farmer.name_en if farmer else None,
        items=item_responses,
    )


# ── Helper: order cancel/reject হলে সব item-এর stock ফেরত দাও ──
def _restock_order_items(order: Order, db: Session):
    items = db.query(OrderItem).filter(OrderItem.order_id == order.order_id).all()
    for item in items:
        product = db.query(Product).filter(Product.product_id == item.product_id).first()
        if product:
            product.quantity_kg = float(product.quantity_kg) + float(item.quantity_kg)
            if product.status == ProductStatus.sold_out:
                product.status = ProductStatus.active


# ── POST /api/v1/orders ───────────────────────────────────────
@router.post("/", response_model=OrderResponse)
async def place_order(
    order_data: OrderCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Buyer নতুন order place করো — একাধিক product একসাথে (একই farmer-এর হতে হবে)।
    Frontend cart-কে farmer অনুযায়ী group করে, প্রতি farmer-এর জন্য এই
    endpoint আলাদাভাবে কল করে।
    """
    if not order_data.items:
        raise HTTPException(status_code=400, detail="Cart is empty.")

    # ডুপ্লিকেট product_id ঠেকাও (একই product দুইবার লাইনে থাকলে গুলিয়ে যাবে)
    seen_ids = set()
    for item in order_data.items:
        if item.product_id in seen_ids:
            raise HTTPException(
                status_code=400,
                detail="Duplicate product in the same order — combine the quantity into one line."
            )
        seen_ids.add(item.product_id)

    product_ids = [item.product_id for item in order_data.items]
    products = db.query(Product).filter(
        Product.product_id.in_(product_ids),
        Product.status == ProductStatus.active
    ).all()
    product_map = {p.product_id: p for p in products}

    missing = [str(i.product_id) for i in order_data.items if i.product_id not in product_map]
    if missing:
        raise HTTPException(
            status_code=404,
            detail=f"Product(s) not found or unavailable: {', '.join(missing)}"
        )

    # সব item একই farmer-এর কিনা check করো — এক Order = এক farmer
    farmer_ids = {product_map[i.product_id].farmer_id for i in order_data.items}
    if len(farmer_ids) > 1:
        raise HTTPException(
            status_code=400,
            detail="All items in one order must be from the same farmer. Place separate orders for different farmers."
        )
    farmer_id = farmer_ids.pop()

    if str(farmer_id) == str(current_user.user_id):
        raise HTTPException(status_code=400, detail="You cannot order your own product.")

    if order_data.delivery_type.value == "delivery" and not order_data.delivery_address:
        raise HTTPException(status_code=400, detail="Delivery address required for delivery orders.")

    # প্রতিটা item-এর জন্য stock atomically check + decrement করো
    # (WHERE quantity_kg >= চাহিদা — দুইজন একসাথে অর্ডার করলেও overselling হবে না)
    order_items_data = []  # (product, quantity_kg, unit_price, subtotal)
    total_amount = 0.0
    try:
        for item in order_data.items:
            product = product_map[item.product_id]
            unit_price = float(product.unit_price_bdt)
            subtotal = round(unit_price * item.quantity_kg, 2)
            total_amount += subtotal

            updated_rows = db.query(Product).filter(
                Product.product_id == item.product_id,
                Product.quantity_kg >= item.quantity_kg
            ).update(
                {"quantity_kg": Product.quantity_kg - item.quantity_kg},
                synchronize_session=False,
                # synchronize_session=False: SQLAlchemy shouldn't try to replay this
                # subtraction in plain Python to keep the in-memory session in sync —
                # Product.quantity_kg is a Decimal (from Postgres NUMERIC) but
                # item.quantity_kg is a plain float, and Python refuses Decimal - float
                # arithmetic. The DB does the subtraction correctly either way; we
                # db.refresh(product) right after, so session sync isn't needed here.
            )

            if updated_rows == 0:
                raise HTTPException(
                    status_code=400,
                    detail=f"Not enough stock for '{product.title_en}'. Only {product.quantity_kg} kg available."
                )
            order_items_data.append((product, item.quantity_kg, unit_price, subtotal))
    except HTTPException:
        db.rollback()
        raise

    total_amount = round(total_amount, 2)
    platform_fee_percent = get_platform_fee_percent(db)  # admin panel থেকে সেট করা %
    platform_fee = round(total_amount * (platform_fee_percent / 100), 2)
    farmer_amount = round(total_amount - platform_fee, 2)

    new_order = Order(
        buyer_id=current_user.user_id,
        farmer_id=farmer_id,
        total_amount=total_amount,
        platform_fee=platform_fee,
        farmer_amount=farmer_amount,
        payment_method=order_data.payment_method,
        delivery_type=order_data.delivery_type,
        delivery_address=order_data.delivery_address,
        status=OrderStatus.placed,
        payment_status=PaymentStatus.in_escrow,
    )
    db.add(new_order)
    db.flush()  # commit ছাড়াই order_id পাওয়ার জন্য

    for product, qty, unit_price, subtotal in order_items_data:
        db.add(OrderItem(
            order_id=new_order.order_id,
            product_id=product.product_id,
            quantity_kg=qty,
            unit_price=unit_price,
            subtotal=subtotal,
        ))
        # bulk .update() এর পর in-memory ORM object automatically sync থাকে না, তাই refresh করে নেওয়া হচ্ছে
        db.refresh(product)
        if float(product.quantity_kg) <= 0:
            product.status = ProductStatus.sold_out

    db.commit()
    db.refresh(new_order)

    print(f"  New order: {new_order.order_id} | {len(order_items_data)} item(s) | Tk.{total_amount} | Escrow held")
    return _build_order_response(new_order, db)


# ── GET /api/v1/orders ────────────────────────────────────────
@router.get("/", response_model=List[OrderResponse])
async def get_my_orders(
    status: Optional[OrderStatus] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Buyer বা Farmer-এর সব orders দেখাও (প্রতিটা order-এ তার সব item সহ)।"""
    if current_user.role == UserRole.farmer:
        query = db.query(Order).filter(Order.farmer_id == current_user.user_id)
    else:
        query = db.query(Order).filter(Order.buyer_id == current_user.user_id)

    if status:
        query = query.filter(Order.status == status)

    orders = query.order_by(Order.created_at.desc()).all()
    return [_build_order_response(order, db) for order in orders]


# ── GET /api/v1/orders/{order_id} ────────────────────────────
@router.get("/{order_id}", response_model=OrderResponse)
async def get_order(
    order_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """একটি order-এর details (সব item সহ) দেখাও।"""
    order = db.query(Order).filter(Order.order_id == order_id).first()

    if not order:
        raise HTTPException(status_code=404, detail="Order not found.")

    if str(order.buyer_id) != str(current_user.user_id) and \
       str(order.farmer_id) != str(current_user.user_id) and \
       current_user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Access denied.")

    return _build_order_response(order, db)


# ── PUT /api/v1/orders/{order_id}/status ─────────────────────
@router.put("/{order_id}/status", response_model=OrderResponse)
async def update_order_status(
    order_id: UUID,
    update: OrderStatusUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Order status update করো (পুরো order-এর সব item-এর status একসাথে বদলায়)।"""
    order = db.query(Order).filter(Order.order_id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found.")

    new_status = update.status

    farmer_actions = [OrderStatus.confirmed, OrderStatus.ready,
                      OrderStatus.dispatched, OrderStatus.shipped, OrderStatus.in_transit,
                      OrderStatus.out_for_delivery, OrderStatus.delivered]
    buyer_actions = [OrderStatus.cancelled]

    if new_status in farmer_actions and str(order.farmer_id) != str(current_user.user_id):
        raise HTTPException(status_code=403, detail="Only the farmer can update to this status.")

    if new_status in buyer_actions and str(order.buyer_id) != str(current_user.user_id):
        raise HTTPException(status_code=403, detail="Only the buyer can update to this status.")

    order.status = new_status

    if new_status == OrderStatus.confirmed:
        order.confirmed_at = datetime.utcnow()

    if new_status == OrderStatus.delivered:
        order.delivered_at = datetime.utcnow()
        order.payment_status = PaymentStatus.released
        print(f"  Escrow released: Tk.{order.farmer_amount} -> Farmer")

    if new_status == OrderStatus.cancelled:
        order.payment_status = PaymentStatus.refunded
        _restock_order_items(order, db)

    db.commit()
    db.refresh(order)
    return _build_order_response(order, db)


# ── DELETE /api/v1/orders/{order_id} ─────────────────────────
@router.delete("/{order_id}")
async def cancel_order(
    order_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Order cancel করো (শুধু placed status-এ, buyer নিজে)।"""
    order = db.query(Order).filter(Order.order_id == order_id).first()

    if not order:
        raise HTTPException(status_code=404, detail="Order not found.")

    if str(order.buyer_id) != str(current_user.user_id):
        raise HTTPException(status_code=403, detail="Only the buyer can cancel this order.")

    if order.status != OrderStatus.placed:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot cancel order with status '{order.status.value}'. Only 'placed' orders can be cancelled."
        )

    order.status = OrderStatus.cancelled
    order.payment_status = PaymentStatus.refunded
    _restock_order_items(order, db)

    db.commit()
    return {"message": "Order cancelled and payment refunded.", "order_id": str(order_id)}


# ── GET /api/v1/orders/admin/all ─────────────────────────────
@router.get("/admin/all", response_model=List[OrderResponse])
async def get_all_orders(
    status: Optional[OrderStatus] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Admin সব orders দেখতে পারবে (প্রতিটা তার সব item সহ)।"""
    if current_user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Admin access required.")

    query = db.query(Order)
    if status:
        query = query.filter(Order.status == status)

    orders = query.order_by(Order.created_at.desc()).limit(100).all()
    return [_build_order_response(order, db) for order in orders]
