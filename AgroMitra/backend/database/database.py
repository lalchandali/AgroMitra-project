# ============================================================
#   AgroMitra — Database Connection (SQLAlchemy + PostgreSQL)
#   Uttara University | CSE Department
# ============================================================
#
#   এই file PostgreSQL-এর সাথে connection তৈরি করে।
#
# ============================================================

import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# ============================================================
# DATABASE URL — PostgreSQL connection string
# ============================================================
# Format: postgresql://username:password@host:port/database_name
#
# ⚠️ কোনো real password এখানে hardcode করা হয় না। DATABASE_URL
# অবশ্যই .env ফাইলে (বা environment variable হিসেবে) সেট করতে হবে।
# Local dev-এর জন্য backend/.env ফাইলে এভাবে লিখো:
#   DATABASE_URL=postgresql://postgres:YOUR_LOCAL_PASSWORD@localhost:5432/agromitra_db
LOCAL_DEV_FALLBACK_URL = "postgresql://postgres:postgres@localhost:5432/agromitra_db"
raw_database_url = os.getenv("DATABASE_URL", "").strip()

PLACEHOLDER_URLS = {
    "postgresql://user:password@host:port/dbname",
    "postgresql://YOUR_USERNAME:YOUR_PASSWORD@host:port/dbname",
    "postgresql://postgres:YOUR_PASSWORD@localhost:5432/dbname",
}

if not raw_database_url or raw_database_url in PLACEHOLDER_URLS or "user:password" in raw_database_url or "host:port" in raw_database_url:
    print(
        "  [WARNING] DATABASE_URL not set (or still a placeholder) in the environment.",
        "Falling back to a generic local-dev connection string - set DATABASE_URL",
        "in backend/.env for anything beyond local testing.",
    )
    DATABASE_URL = LOCAL_DEV_FALLBACK_URL
else:
    DATABASE_URL = raw_database_url

# ============================================================
# Engine তৈরি করো
# ============================================================
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,   # connection check করে নেয় ব্যবহারের আগে
    echo=False,           # True করলে সব SQL query terminal-এ দেখাবে (debugging)
)

# ============================================================
# Session — প্রতিটা request-এর জন্য একটা database session
# ============================================================
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# ============================================================
# Base — সব models এই Base থেকে inherit করবে
# ============================================================
Base = declarative_base()

# ============================================================
# Dependency — FastAPI route-এ db session inject করার জন্য
# ============================================================
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
