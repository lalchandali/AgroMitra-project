# ============================================================
#   AgroMitra — User Model
#   Represents: Farmers, Buyers, Consumers, Admins
# ============================================================

import uuid
from backend.database.database import Base
from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, Numeric, Enum
from sqlalchemy.dialects.postgresql import UUID
import enum


# ── Enums ────────────────────────────────────────────────────
class UserRole(str, enum.Enum):
    farmer   = "farmer"
    buyer    = "buyer"
    consumer = "consumer"
    admin    = "admin"


# ── User Table ───────────────────────────────────────────────
class User(Base):
    __tablename__ = "users"
    __table_args__ = {'extend_existing': True}

    user_id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    mobile_number    = Column(String(15), unique=True, nullable=False, index=True)
    name_en          = Column(String(100), nullable=False)
    name_bn          = Column(String(200), nullable=True)
    role             = Column(Enum(UserRole), nullable=False, default=UserRole.farmer)
    district         = Column(String(50), nullable=True)
    password_hash    = Column(String(255), nullable=False)
    profile_photo_url= Column(String(500), nullable=True)
    is_verified      = Column(Boolean, default=False)
    is_active        = Column(Boolean, default=True)
    trust_score      = Column(Numeric(4, 1), default=50.0)
    created_at       = Column(DateTime, default=datetime.utcnow)
    last_login_at    = Column(DateTime, nullable=True)

    def __repr__(self):
        return f"<User {self.name_en} ({self.role})>"
