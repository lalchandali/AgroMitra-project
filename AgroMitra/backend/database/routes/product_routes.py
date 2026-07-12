# ============================================================
#   AgroMitra — Product Listing Routes
#   Create, Read, Update, Delete product listings
# ============================================================

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form  # type: ignore[import]
from sqlalchemy.orm import Session  # type: ignore[import]
from typing import Optional, List
from uuid import UUID
from datetime import datetime
import os
import uuid as uuid_lib

from backend.database import get_db
from backend.database.models.product import Product, ProductStatus, QualityGrade
from backend.database.models.user import User, UserRole
from backend.database.schemas.product_schema import ProductResponse
from backend.database.routes.auth_routes import get_current_user

def _parse_dt(value: Optional[str]):
    """Form দিয়ে আসা ISO date string-কে datetime এ পার্স করে; খালি/ভুল হলে None।"""
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None


router = APIRouter(prefix="/api/v1/products", tags=["Products"])

UPLOAD_DIR = "uploads/product_photos"
os.makedirs(UPLOAD_DIR, exist_ok=True)


def _save_product_photo(file: UploadFile, contents: bytes) -> str:
    """
    প্রোফাইল ফটো আপলোডের মতো একই pattern — validate করে uploads/product_photos/
    এ সেভ করে, আর URL রিটার্ন করে (যেটা main.py-এর /uploads static mount দিয়ে serve হবে)।
    """
    if file.content_type not in ["image/jpeg", "image/png", "image/webp"]:
        raise HTTPException(status_code=400, detail="Only JPG, PNG, WebP allowed.")
    if len(contents) > 5 * 1024 * 1024:  # প্রোডাক্ট ছবি একটু বড় (5MB) অনুমতি দেওয়া হয়েছে
        raise HTTPException(status_code=400, detail="File too large. Max 5MB.")

    ext = file.filename.split(".")[-1] if "." in file.filename else "jpg"
    filename = f"{uuid_lib.uuid4().hex}.{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)
    with open(filepath, "wb") as f:
        f.write(contents)

    return f"/uploads/product_photos/{filename}"


# ── POST /api/v1/products ─────────────────────────────────────
@router.post("/", response_model=ProductResponse)
async def create_product(
    title_en       : str = Form(...),
    title_bn       : Optional[str] = Form(None),
    category       : str = Form(...),
    description_en : Optional[str] = Form(None),
    quantity_kg    : float = Form(...),
    unit_price_bdt : float = Form(...),
    quality_grade  : QualityGrade = Form(default=QualityGrade.A),
    district       : str = Form(...),
    is_organic     : str = Form("false"),           # FormData বুলিয়ানকে string হিসেবে পাঠায় ('true'/'false')
    harvest_date   : Optional[str] = Form(None),
    availability_until: Optional[str] = Form(None),
    file           : Optional[UploadFile] = File(None),
    image_url      : Optional[str] = Form(None),     # আগে থেকেই কোনো URL থাকলে (নতুন ফাইল সিলেক্ট না করলে)
    current_user   : User = Depends(get_current_user),
    db             : Session = Depends(get_db)
):
    """Farmer নতুন product listing তৈরি করো (ছবিসহ, multipart/form-data)।"""
    if current_user.role not in [UserRole.farmer, UserRole.admin]:
        raise HTTPException(status_code=403, detail="Only farmers can create listings.")

    photos = None
    if file is not None:
        contents = await file.read()
        photos = [_save_product_photo(file, contents)]
    elif image_url:
        photos = [image_url]

    new_product = Product(
        farmer_id      = current_user.user_id,
        title_en       = title_en,
        title_bn       = title_bn,
        category       = category,
        description_en = description_en,
        quantity_kg    = quantity_kg,
        unit_price_bdt = unit_price_bdt,
        quality_grade  = quality_grade,
        district       = district,
        is_organic     = is_organic.lower() == "true",
        harvest_date   = _parse_dt(harvest_date),
        availability_until = _parse_dt(availability_until),
        photos         = photos,
        # AI fair price — simple calculation
        ai_fair_price_min = round(float(unit_price_bdt) * 0.90, 2),
        ai_fair_price_max = round(float(unit_price_bdt) * 1.10, 2),
    )

    db.add(new_product)
    db.commit()
    db.refresh(new_product)
    return new_product


# ── GET /api/v1/products ──────────────────────────────────────
@router.get("/", response_model=List[ProductResponse])
async def get_products(
    category  : Optional[str]  = Query(None, example="Vegetable"),
    district  : Optional[str]  = Query(None, example="Bogura"),
    is_organic: Optional[bool] = Query(None),
    min_price : Optional[float]= Query(None),
    max_price : Optional[float]= Query(None),
    skip      : int            = Query(0, ge=0),
    limit     : int            = Query(20, ge=1, le=100),
    db        : Session        = Depends(get_db)
):
    """সব active product listings দেখাও। Filter করা যাবে।"""
    query = db.query(Product).filter(Product.status == ProductStatus.active)

    if category:   query = query.filter(Product.category == category)
    if district:   query = query.filter(Product.district == district)
    if is_organic is not None: query = query.filter(Product.is_organic == is_organic)
    if min_price:  query = query.filter(Product.unit_price_bdt >= min_price)
    if max_price:  query = query.filter(Product.unit_price_bdt <= max_price)

    products = query.order_by(Product.created_at.desc()).offset(skip).limit(limit).all()

    # farmer_name join
    farmer_ids = list({p.farmer_id for p in products})
    farmers = db.query(User).filter(User.user_id.in_(farmer_ids)).all()
    farmer_map = {str(f.user_id): f.name_en for f in farmers}

    result = []
    for p in products:
        data = {
            "product_id": p.product_id,
            "farmer_id": p.farmer_id,
            "farmer_name": farmer_map.get(str(p.farmer_id)),
            "title_en": p.title_en,
            "title_bn": p.title_bn,
            "category": p.category,
            "description_en": p.description_en,
            "quantity_kg": p.quantity_kg,
            "unit_price_bdt": p.unit_price_bdt,
            "quality_grade": p.quality_grade,
            "district": p.district,
            "is_organic": p.is_organic,
            "image_url": p.image_url,
            "ai_fair_price_min": p.ai_fair_price_min,
            "ai_fair_price_max": p.ai_fair_price_max,
            "status": p.status,
            "views_count": p.views_count,
            "created_at": p.created_at,
        }
        result.append(ProductResponse(**data))
    return result


# ── GET /api/v1/products/my ───────────────────────────────────
@router.get("/my", response_model=List[ProductResponse])
async def get_my_products(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Farmer-এর নিজের সব listings দেখাও।"""
    products = db.query(Product).filter(
        Product.farmer_id == current_user.user_id
    ).order_by(Product.created_at.desc()).all()
    return products


# ── GET /api/v1/products/{product_id} ────────────────────────
@router.get("/{product_id}", response_model=ProductResponse)
async def get_product(
    product_id: UUID,
    db: Session = Depends(get_db)
):
    """একটি product-এর details দেখাও।"""
    product = db.query(Product).filter(Product.product_id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found.")

    # View count বাড়াও
    product.views_count += 1
    db.commit()
    db.refresh(product)
    return product


# ── PUT /api/v1/products/{product_id} ────────────────────────
@router.put("/{product_id}", response_model=ProductResponse)
async def update_product(
    product_id     : UUID,
    title_en       : Optional[str] = Form(None),
    title_bn       : Optional[str] = Form(None),
    category       : Optional[str] = Form(None),
    description_en : Optional[str] = Form(None),
    quantity_kg    : Optional[float] = Form(None),
    unit_price_bdt : Optional[float] = Form(None),
    quality_grade  : Optional[QualityGrade] = Form(None),
    district       : Optional[str] = Form(None),
    is_organic     : Optional[str] = Form(None),
    status         : Optional[ProductStatus] = Form(None),
    harvest_date   : Optional[str] = Form(None),
    availability_until: Optional[str] = Form(None),
    file           : Optional[UploadFile] = File(None),
    image_url      : Optional[str] = Form(None),
    current_user   : User = Depends(get_current_user),
    db             : Session = Depends(get_db)
):
    """Product listing update করো (শুধু owner করতে পারবে), ছবি বদলানোসহ।"""
    product = db.query(Product).filter(Product.product_id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found.")
    if str(product.farmer_id) != str(current_user.user_id):
        raise HTTPException(status_code=403, detail="You can only edit your own listings.")

    if title_en       is not None: product.title_en       = title_en
    if title_bn       is not None: product.title_bn       = title_bn
    if category       is not None: product.category       = category
    if description_en is not None: product.description_en = description_en
    if quantity_kg     is not None: product.quantity_kg    = quantity_kg
    if unit_price_bdt is not None:
        product.unit_price_bdt    = unit_price_bdt
        product.ai_fair_price_min = round(float(unit_price_bdt) * 0.90, 2)
        product.ai_fair_price_max = round(float(unit_price_bdt) * 1.10, 2)
    if quality_grade  is not None: product.quality_grade  = quality_grade
    if district       is not None: product.district       = district
    if is_organic     is not None: product.is_organic     = is_organic.lower() == "true"
    if status         is not None: product.status         = status
    if harvest_date   is not None: product.harvest_date   = _parse_dt(harvest_date)
    if availability_until is not None: product.availability_until = _parse_dt(availability_until)

    # নতুন ছবি আপলোড করলে পুরোনোটা replace হবে; নতুন কিছু না দিলে আগেরটাই থেকে যাবে
    if file is not None:
        contents = await file.read()
        product.photos = [_save_product_photo(file, contents)]
    elif image_url is not None:
        product.photos = [image_url] if image_url else None

    db.commit()
    db.refresh(product)
    return product


# ── DELETE /api/v1/products/{product_id} ─────────────────────
@router.delete("/{product_id}")
async def delete_product(
    product_id  : UUID,
    current_user: User = Depends(get_current_user),
    db          : Session = Depends(get_db)
):
    """Product listing remove করো।"""
    product = db.query(Product).filter(Product.product_id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found.")
    if str(product.farmer_id) != str(current_user.user_id) and current_user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="You can only delete your own listings.")

    product.status = ProductStatus.removed
    db.commit()
    return {"message": "Product removed successfully.", "product_id": str(product_id)}
