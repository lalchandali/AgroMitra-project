# ============================================================
#   AgroMitra — Platform Settings Schemas (Pydantic)
# ============================================================

from pydantic import BaseModel, Field


class PlatformFeeResponse(BaseModel):
    platform_fee_percent: float = Field(..., example=3.0, description="e.g. 3.0 means 3%")


class PlatformFeeUpdate(BaseModel):
    # 0% থেকে 20% এর মধ্যে বেঁধে রাখা হয়েছে — ভুল করে 300 বা negative
    # বসিয়ে ফেললে সব order-এর হিসাব নষ্ট হয়ে যাওয়া থেকে বাঁচার জন্য।
    platform_fee_percent: float = Field(..., ge=0, le=20, example=3.0)
