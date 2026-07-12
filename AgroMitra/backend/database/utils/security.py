from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
import bcrypt
import random
import string
import os

# ⚠️ JWT_SECRET_KEY অবশ্যই backend/.env ফাইলে সেট করতে হবে।
# নিচের ভ্যালুটা শুধু local dev-এ ভুলে .env সেট করতে ভুলে গেলে
# app crash না করে চালু থাকার জন্য একটা fallback — production-এ
# এটার উপর ভরসা করা যাবে না, কারণ এটা source code-এ visible।
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-only-fallback-change-me-in-env")
ALGORITHM  = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 15
REFRESH_TOKEN_EXPIRE_DAYS   = 7

# ── Password Hashing ──────────────────────────────────────────
def hash_password(password: str) -> str:
    password_bytes = password.encode('utf-8')[:72]
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password_bytes, salt).decode('utf-8')

def verify_password(plain_password: str, hashed_password: str) -> bool:
    password_bytes = plain_password.encode('utf-8')[:72]
    return bcrypt.checkpw(password_bytes, hashed_password.encode('utf-8'))

# ── JWT Tokens ────────────────────────────────────────────────
def create_access_token(data: dict, expires_delta=None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def create_refresh_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "type": "refresh"})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def decode_token(token: str):
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None

# ── OTP ───────────────────────────────────────────────────────
OTP_STORAGE = {}

def generate_otp(mobile_number: str) -> str:
    otp = ''.join(random.choices(string.digits, k=6))
    OTP_STORAGE[mobile_number] = {
        "otp": otp,
        "expires_at": datetime.utcnow() + timedelta(minutes=5),
        "attempts": 0,
    }
    return otp

def verify_otp(mobile_number: str, otp_input: str):
    record = OTP_STORAGE.get(mobile_number)
    if not record:
        return False, "OTP not found."
    if datetime.utcnow() > record["expires_at"]:
        del OTP_STORAGE[mobile_number]
        return False, "OTP expired."
    if record["attempts"] >= 3:
        del OTP_STORAGE[mobile_number]
        return False, "Too many attempts."
    if record["otp"] != otp_input:
        record["attempts"] += 1
        return False, f"Invalid OTP. {3 - record['attempts']} attempts remaining."
    del OTP_STORAGE[mobile_number]
    return True, "OTP verified successfully."