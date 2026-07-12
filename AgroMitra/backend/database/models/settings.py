# ============================================================
#   AgroMitra — Platform Settings Model
#   Admin-configurable values (e.g. platform fee %) stored here
#   so they survive restarts instead of being hardcoded constants.
# ============================================================

from backend.database.database import Base
from datetime import datetime
from sqlalchemy import Column, String, Numeric, DateTime


class PlatformSettings(Base):
    __tablename__ = "platform_settings"
    __table_args__ = {'extend_existing': True}

    # সহজ key-value ডিজাইন — ভবিষ্যতে আরও admin-configurable value
    # (যেমন delivery fee, min order amount) একই টেবিলে নতুন row হিসেবে
    # যোগ করা যাবে, নতুন column/migration লাগবে না।
    key        = Column(String(50), primary_key=True)
    value      = Column(Numeric(6, 2), nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f"<PlatformSettings {self.key}={self.value}>"
