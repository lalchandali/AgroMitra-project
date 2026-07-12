from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from backend.database import engine, Base, get_db
from backend.database.models.user import User, UserRole
from backend.database.models.product import Product
from backend.database.models.order import Order
from backend.database.routes.auth_routes import router as auth_router
from backend.database.routes.product_routes import router as product_router
from backend.database.routes.order_routes import router as order_router
from backend.database.utils.security import hash_password
from backend.database.routes.weather_routes import router as weather_router
print("✅ Loaded weather router from:", weather_router)

Base.metadata.create_all(bind=engine)
print("  ✅ Database tables created!")

app = FastAPI(
    title       = "🌾 AgroMitra API",
    description = "AI-Powered Agricultural Marketplace — Uttara University",
    version     = "2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(order_router)
app.include_router(product_router)
app.include_router(weather_router)
@app.get("/")
async def root():
    return {"message": "🌾 AgroMitra API v2.0", "docs": "/docs"}

@app.get("/health")
async def health():
    from datetime import datetime
    return {"status": "healthy", "database": "PostgreSQL connected", "timestamp": datetime.now().isoformat()}

@app.post("/test-register")
async def test_register(db: Session = Depends(get_db)):
    try:
        user = User(
            mobile_number = "01799999999",
            name_en       = "Test User",
            role          = UserRole.farmer,
            district      = "Bogura",
            password_hash = hash_password("test123"),
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return {"success": True, "user_id": str(user.user_id), "name": user.name_en}
    except Exception as e:
        db.rollback()
        return {"error": str(e), "type": type(e).__name__}