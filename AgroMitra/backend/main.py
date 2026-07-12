# ============================================================
#   AgroMitra — AI Service API (FastAPI)
#   Price Prediction + Demand Forecasting + Crop Recommendation
#   Uttara University | CSE Department
# ============================================================
#
#   HOW TO RUN:
#   1. pip install fastapi uvicorn prophet xgboost tensorflow
#      scikit-learn pandas numpy pickle5 python-dotenv requests
#   2. Create a .env file next to this file with:
#        OPENWEATHER_API_KEY=your_actual_key_here
#   3. uvicorn main:app --reload --port 8000
#   4. Browser: http://localhost:8000/docs
#
# ============================================================

import sys

# ── Windows console-এ Bengali/emoji print করলে crash করে (cp1252
#    encoding UTF-8 character encode করতে পারে না)। সবচেয়ে প্রথমে,
#    অন্য কোনো import বা print চালানোর আগেই stdout/stderr কে UTF-8
#    করে দেওয়া হচ্ছে, যাতে এই ধরনের crash পুরো app-এর কোথাও আর না হয়। ──
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass  # খুব পুরনো Python version হলে reconfigure না থাকতে পারে — silently skip

from fastapi import HTTPException
from typing import Optional
from datetime import datetime
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, List
import pandas as pd
import numpy as np
import pickle
import json
import os
import warnings
import requests
from dotenv import load_dotenv
from datetime import datetime, timedelta
from fastapi.staticfiles import StaticFiles

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

warnings.filterwarnings('ignore')

# ── Load environment variables (.env) ───────────────────────
load_dotenv()
OPENWEATHER_API_KEY = os.getenv("OPENWEATHER_API_KEY")

# ── App Setup ────────────────────────────────────────────────
app = FastAPI(
    title="🌾 AgroMitra AI API",
    description="AI-Powered Agricultural Price Prediction, Demand Forecasting & Crop Recommendation",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── CORS (React frontend-এর জন্য) ───────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Model Storage ────────────────────────────────────────────
MODELS = {}
# Get the directory of this file and construct relative path to data
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(BASE_DIR, 'ai_models', 'data',
                         'raw', 'crop_prices_v2_64districts.csv')
AI_MODELS_DIR = os.path.join(BASE_DIR, 'ai_models')

if AI_MODELS_DIR not in sys.path:
    sys.path.insert(0, AI_MODELS_DIR)

DATABASE_ENABLED = False
DATABASE_IMPORT_ERROR = None
db_engine = None
db_text = None

try:
    from sqlalchemy import text as db_text
    from backend.database.database import engine as db_engine, Base as db_base
    from backend.database.models.user import User
    from backend.database.models.product import Product
    from backend.database.models.order import Order
    from backend.database.models.order_item import OrderItem
    from backend.database.models.settings import PlatformSettings
    from backend.database.routes.auth_routes import router as auth_router
    from backend.database.routes.product_routes import router as product_router
    from backend.database.routes.order_routes import router as order_router
    from backend.database.routes.weather_routes import router as db_weather_router
    from backend.database.routes.settings_routes import router as settings_router

    db_base.metadata.create_all(bind=db_engine)
    app.include_router(auth_router)
    app.include_router(product_router)
    app.include_router(order_router)
    app.include_router(db_weather_router)
    app.include_router(settings_router)
    DATABASE_ENABLED = True
    print("Database routes enabled on the main AI API.")
except Exception as exc:
    DATABASE_IMPORT_ERROR = str(exc)
    print(f"Database routes disabled: {DATABASE_IMPORT_ERROR}")


# ============================================================
# REQUEST / RESPONSE MODELS
# ============================================================

class PricePredictionRequest(BaseModel):
    crop_name: str = Field(..., json_schema_extra={"example": "Tomato"})
    district: str = Field(..., json_schema_extra={"example": "Bogura"})
    days: int = Field(default=7, ge=1, le=30, json_schema_extra={"example": 7})


class DemandForecastRequest(BaseModel):
    crop_name: str = Field(..., json_schema_extra={"example": "Tomato"})
    district: str = Field(..., json_schema_extra={"example": "Bogura"})
    days: int = Field(default=7, ge=1, le=30, json_schema_extra={"example": 7})


class CropRecommendationRequest(BaseModel):
    farmer_name: str = Field(..., json_schema_extra={
                             "example": "Mohammad Rahim"})
    district: str = Field(..., json_schema_extra={"example": "Bogura"})
    soil_type: str = Field(..., json_schema_extra={"example": "Loam"})
    land_acres: float = Field(..., json_schema_extra={"example": 2.5})
    budget_bdt: int = Field(..., json_schema_extra={"example": 80000})
    experience: str = Field(..., json_schema_extra={"example": "Intermediate"})
    planting_month: int = Field(
        default=datetime.now().month, json_schema_extra={"example": 11})


class PricePredictionItem(BaseModel):
    date: str
    predicted_price: float
    lower_bound: float
    upper_bound: float
    trend: str


class DemandForecastItem(BaseModel):
    date: str
    predicted_demand: int
    lower_bound: int
    upper_bound: int
    market_signal: str


class CropRecommendationItem(BaseModel):
    rank: int
    crop: str
    name_bn: str
    score: float
    category: str
    grow_days: int
    difficulty: str
    market_demand: str
    risk_level: str
    est_profit_bdt: int
    est_revenue_bdt: int
    est_cost_bdt: int
    profit_margin_pct: float
    advisory: str


# ============================================================
# CROP KNOWLEDGE BASE (inline — no file needed)
# ============================================================

CROP_DB = {
    'Tomato': {
        'name_bn': 'টমেটো', 'category': 'Vegetable', 'grow_days': 75,
        'best_months': [10, 11, 12, 1, 2], 'soil_types': ['Loam', 'Sandy Loam', 'Clay Loam'],
        'water_need': 'Medium', 'temp_min': 15, 'temp_max': 30,
        'avg_yield_kg': 8000, 'avg_price_bdt': 28, 'input_cost_bdt': 35000,
        'districts': [
            'Bogura', 'Rajshahi', 'Cumilla', 'Dhaka', 'Chattogram', 'Narsingdi', 'Manikganj',
            'Gazipur', 'Tangail', 'Mymensingh', 'Jamalpur', 'Sherpur', 'Kishoreganj', 'Netrokona',
            'Munshiganj', 'Narayanganj', 'Faridpur', 'Gopalganj', 'Madaripur', 'Rajbari', 'Shariatpur'
        ],
        'difficulty': 'Medium', 'market_demand': 'High', 'export_potential': False,
        'organic_possible': True, 'risk_level': 'Medium'
    },
    'Onion': {
        'name_bn': 'পেঁয়াজ', 'category': 'Vegetable', 'grow_days': 120,
        'best_months': [10, 11, 12, 1, 2, 3], 'soil_types': ['Loam', 'Sandy Loam'],
        'water_need': 'Low', 'avg_yield_kg': 7000, 'avg_price_bdt': 45,
        'input_cost_bdt': 40000,
        'districts': [
            'Rajshahi', 'Pabna', 'Bogura', 'Faridpur', 'Kushtia', 'Magura', 'Jhenaidah',
            'Natore', 'Naogaon', 'Chapai Nawabganj', 'Sirajganj', 'Meherpur', 'Chuadanga', 'Jessore'
        ],
        'difficulty': 'Medium', 'market_demand': 'Very High', 'export_potential': True,
        'organic_possible': False, 'risk_level': 'Medium'
    },
    'Potato': {
        'name_bn': 'আলু', 'category': 'Vegetable', 'grow_days': 90,
        'best_months': [10, 11, 12, 1], 'soil_types': ['Sandy Loam', 'Loam'],
        'water_need': 'Medium', 'avg_yield_kg': 20000, 'avg_price_bdt': 22,
        'input_cost_bdt': 50000,
        'districts': [
            'Bogura', 'Rangpur', 'Munshiganj', 'Comilla', 'Dinajpur', 'Nilphamari', 'Kurigram',
            'Gaibandha', 'Lalmonirhat', 'Thakurgaon', 'Panchagarh', 'Joypurhat', 'Feni', 'Lakshmipur'
        ],
        'difficulty': 'Easy', 'market_demand': 'Very High', 'export_potential': True,
        'organic_possible': False, 'risk_level': 'Low'
    },
    'Brinjal': {
        'name_bn': 'বেগুন', 'category': 'Vegetable', 'grow_days': 60,
        'best_months': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],  # বারোমাসি ফসল
        'soil_types': ['Loam', 'Clay Loam', 'Sandy Loam'],
        'water_need': 'Medium', 'avg_yield_kg': 12000, 'avg_price_bdt': 30,
        'input_cost_bdt': 28000,
        'districts': [
            'Bogura', 'Cumilla', 'Dhaka', 'Rajshahi', 'Chattogram', 'Khulna', 'Bagerhat',
            'Satkhira', 'Jessore', 'Jhenaidah', 'Magura', 'Narail', 'Kushtia', 'Chuadanga', 'Meherpur'
        ],
        'difficulty': 'Easy', 'market_demand': 'High', 'export_potential': False,
        'organic_possible': True, 'risk_level': 'Low'
    },
    'Cabbage': {
        'name_bn': 'বাঁধাকপি', 'category': 'Vegetable', 'grow_days': 70,
        'best_months': [10, 11, 12, 1, 2], 'soil_types': ['Loam', 'Clay Loam'],
        'water_need': 'Medium', 'avg_yield_kg': 25000, 'avg_price_bdt': 20,
        'input_cost_bdt': 25000,
        'districts': [
            'Bogura', 'Rajshahi', 'Cumilla', 'Dhaka', 'Sylhet', 'Moulvibazar', 'Habiganj',
            'Sunamganj', 'Barishal', 'Patuakhali', 'Bhola', 'Pirojpur', 'Jhalokati', 'Barguna'
        ],
        'difficulty': 'Easy', 'market_demand': 'High', 'export_potential': False,
        'organic_possible': True, 'risk_level': 'Low'
    },
    'Garlic': {
        'name_bn': 'রসুন', 'category': 'Spice', 'grow_days': 150,
        'best_months': [10, 11, 12], 'soil_types': ['Sandy Loam', 'Loam'],
        'water_need': 'Low', 'avg_yield_kg': 5000, 'avg_price_bdt': 85,
        'input_cost_bdt': 45000,
        'districts': [
            'Rajshahi', 'Faridpur', 'Bogura', 'Pabna', 'Natore', 'Meherpur', 'Kushtia',
            'Noakhali', 'Feni', 'Lakshmipur', 'Chandpur', 'Brahmanbaria', 'Cox\'s Bazar'
        ],
        'difficulty': 'Hard', 'market_demand': 'Very High', 'export_potential': True,
        'organic_possible': False, 'risk_level': 'High'
    },
    'Rice': {
        'name_bn': 'ধান', 'category': 'Grain', 'grow_days': 120,
        # আউশ, আমন, বোরো মিলিয়ে প্রায় সারা বছর
        'best_months': [1, 2, 3, 4, 5, 6, 7, 11, 12],
        'soil_types': ['Clay', 'Clay Loam', 'Loam'],
        'water_need': 'High', 'avg_yield_kg': 4500, 'avg_price_bdt': 55,
        'input_cost_bdt': 30000,
        'districts': [
            'Bogura', 'Rajshahi', 'Cumilla', 'Dhaka', 'Chattogram', 'Rangpur', 'Dinajpur', 'Mymensingh',
            'Sylhet', 'Barishal', 'Khulna', 'Jessore', 'Pabna', 'Naogaon', 'Natore', 'Kishoreganj',
            'Netrokona', 'Gopalganj', 'Habiganj', 'Sunamganj', 'Barguna', 'Patuakhali', 'Bhola', 'Pirojpur',
            'Jhalokati', 'Bagerhat', 'Satkhira', 'Narail', 'Magura', 'Jhenaidah', 'Kushtia', 'Chuadanga',
            'Meherpur', 'Sirajganj', 'Joypurhat', 'Thakurgaon', 'Panchagarh', 'Nilphamari', 'Kurigram',
            'Gaibandha', 'Lalmonirhat', 'Sherpur', 'Jamalpur', 'Tangail', 'Gazipur', 'Narsingdi', 'Manikganj',
            'Munshiganj', 'Narayanganj', 'Faridpur', 'Madaripur', 'Rajbari', 'Shariatpur', 'Brahmanbaria',
            'Chandpur', 'Noakhali', 'Feni', 'Lakshmipur', 'Cox\'s Bazar', 'Khagrachari', 'Rangamati', 'Bandarban'
        ],  # ধান বাংলাদেশের ৬৪ জেলাতেই চাষ হয়
        'difficulty': 'Easy', 'market_demand': 'Very High', 'export_potential': False,
        'organic_possible': True, 'risk_level': 'Low'
    },
    'Ginger': {
        'name_bn': 'আদা', 'category': 'Spice', 'grow_days': 240,
        'best_months': [3, 4, 5], 'soil_types': ['Sandy Loam', 'Loam'],
        'water_need': 'Medium', 'avg_yield_kg': 8000, 'avg_price_bdt': 90,
        'input_cost_bdt': 60000,
        'districts': [
            'Rajshahi', 'Rangpur', 'Sylhet', 'Khagrachari', 'Rangamati', 'Bandarban',
            'Tangail', 'Mymensingh', 'Sherpur', 'Nilphamari', 'Thakurgaon', 'Panchagarh'
        ],
        'difficulty': 'Hard', 'market_demand': 'High', 'export_potential': True,
        'organic_possible': True, 'risk_level': 'High'
    },
    'Maize': {
        'name_bn': 'ভুট্টা', 'category': 'Grain', 'grow_days': 130,
        'best_months': [10, 11, 12, 2, 3, 4], 'soil_types': ['Sandy Loam', 'Loam'],
        'water_need': 'Medium', 'avg_yield_kg': 9000, 'avg_price_bdt': 30,
        'input_cost_bdt': 35000,
        'districts': [
            'Dinajpur', 'Chuadanga', 'Rangpur', 'Manikganj', 'Thakurgaon', 'Panchagarh',
            'Lalmonirhat', 'Kurigram', 'Gaibandha', 'Nilphamari', 'Bogura', 'Rajshahi', 'Pabna', 'Kushtia'
        ],
        'difficulty': 'Easy', 'market_demand': 'High', 'export_potential': True,
        'organic_possible': False, 'risk_level': 'Low'
    },
    'Wheat': {
        'name_bn': 'গম', 'category': 'Grain', 'grow_days': 110,
        'best_months': [11, 12], 'soil_types': ['Loam', 'Sandy Loam'],
        'water_need': 'Low', 'avg_yield_kg': 3500, 'avg_price_bdt': 40,
        'input_cost_bdt': 25000,
        'districts': [
            'Dinajpur', 'Thakurgaon', 'Panchagarh', 'Rajshahi', 'Pabna', 'Naogaon', 'Natore',
            'Chapai Nawabganj', 'Kushtia', 'Chuadanga', 'Meherpur', 'Faridpur', 'Rajbari', 'Sirajganj'
        ],
        'difficulty': 'Easy', 'market_demand': 'Very High', 'export_potential': False,
        'organic_possible': False, 'risk_level': 'Low'
    },
    'Chili': {
        'name_bn': 'মরিচ', 'category': 'Spice', 'grow_days': 105,
        'best_months': [10, 11, 3, 4, 5, 6],  # রবি এবং খরিফ উভয় মৌসুমেই সম্ভব
        'soil_types': ['Loam', 'Sandy Loam'],
        'water_need': 'Medium', 'avg_yield_kg': 4200, 'avg_price_bdt': 110,
        'input_cost_bdt': 38000,
        'districts': [
            'Bogura', 'Patuakhali', 'Bhola', 'Jamalpur', 'Noakhali', 'Feni', 'Lakshmipur',
            'Chandpur', 'Barishal', 'Barguna', 'Pirojpur', 'Jhalokati', 'Sirajganj', 'Pabna'
        ],
        'difficulty': 'Medium', 'market_demand': 'Very High', 'export_potential': True,
        'organic_possible': True, 'risk_level': 'Medium'
    },
    'Watermelon': {
        'name_bn': 'তরমুজ', 'category': 'Fruit', 'grow_days': 90,
        'best_months': [12, 1, 2], 'soil_types': ['Sandy Loam', 'Sandy Soil'],
        'water_need': 'Medium', 'avg_yield_kg': 28000, 'avg_price_bdt': 35,
        'input_cost_bdt': 55000,
        'districts': [
            'Patuakhali', 'Bhola', 'Barguna', 'Khulna', 'Barishal', 'Pirojpur', 'Jhalokati',
            'Satkhira', 'Bagerhat', 'Noakhali', 'Feni', 'Lakshmipur', 'Chattogram', 'Cox\'s Bazar'
        ],
        'difficulty': 'Medium', 'market_demand': 'High', 'export_potential': True,
        'organic_possible': False, 'risk_level': 'Medium'
    },
    'Mustard': {
        'name_bn': 'সরিষা', 'category': 'Oilseed', 'grow_days': 85,
        'best_months': [10, 11], 'soil_types': ['Loam', 'Sandy Loam'],
        'water_need': 'Low', 'avg_yield_kg': 1300, 'avg_price_bdt': 95,
        'input_cost_bdt': 18000,
        'districts': [
            'Tangail', 'Sirajganj', 'Manikganj', 'Pabna', 'Dhaka', 'Gazipur', 'Narsingdi',
            'Narayanganj', 'Munshiganj', 'Faridpur', 'Rajbari', 'Madaripur', 'Shariatpur', 'Gopalganj'
        ],
        'difficulty': 'Easy', 'market_demand': 'High', 'export_potential': False,
        'organic_possible': True, 'risk_level': 'Low'
    },
    'Jute': {
        'name_bn': 'পাট', 'category': 'Cash Crop', 'grow_days': 120,
        'best_months': [3, 4, 5, 6], 'soil_types': ['Alluvial Soil', 'Loam'],
        'water_need': 'High', 'avg_yield_kg': 2500, 'avg_price_bdt': 75,
        'input_cost_bdt': 28000,
        'districts': [
            'Faridpur', 'Madaripur', 'Sirajganj', 'Mymensingh', 'Rajbari', 'Gopalganj', 'Shariatpur',
            'Magura', 'Jhenaidah', 'Kushtia', 'Pabna', 'Jamalpur', 'Sherpur', 'Tangail', 'Manikganj'
        ],
        'difficulty': 'Medium', 'market_demand': 'High', 'export_potential': True,
        'organic_possible': True, 'risk_level': 'Medium'
    }
}

DISTRICT_PROFILES = {
    'Bagerhat':         {'soil_type': 'Clay Loam',  'avg_temp': 26, 'avg_rainfall': 1900},
    'Bandarban':        {'soil_type': 'Loam',       'avg_temp': 25, 'avg_rainfall': 3000},
    'Barguna':          {'soil_type': 'Clay Loam',  'avg_temp': 26, 'avg_rainfall': 2700},
    'Barishal':         {'soil_type': 'Clay Loam',  'avg_temp': 26, 'avg_rainfall': 2300},
    'Bhola':            {'soil_type': 'Clay Loam',  'avg_temp': 26, 'avg_rainfall': 2400},
    'Bogura':           {'soil_type': 'Sandy Loam', 'avg_temp': 26, 'avg_rainfall': 1500},
    'Brahmanbaria':     {'soil_type': 'Loam',       'avg_temp': 26, 'avg_rainfall': 2200},
    'Chandpur':         {'soil_type': 'Loam',       'avg_temp': 26, 'avg_rainfall': 2100},
    'Chapai Nawabganj': {'soil_type': 'Sandy Loam', 'avg_temp': 27, 'avg_rainfall': 1300},
    'Chattogram':       {'soil_type': 'Clay Loam',  'avg_temp': 27, 'avg_rainfall': 2800},
    'Chuadanga':        {'soil_type': 'Loam',       'avg_temp': 27, 'avg_rainfall': 1500},
    'Cumilla':          {'soil_type': 'Clay Loam',  'avg_temp': 26, 'avg_rainfall': 1800},
    "Cox's Bazar":      {'soil_type': 'Loam',       'avg_temp': 26, 'avg_rainfall': 3200},
    'Dhaka':            {'soil_type': 'Loam',       'avg_temp': 27, 'avg_rainfall': 1800},
    'Dinajpur':         {'soil_type': 'Sandy Loam', 'avg_temp': 25, 'avg_rainfall': 1600},
    'Faridpur':         {'soil_type': 'Loam',       'avg_temp': 26, 'avg_rainfall': 1700},
    'Feni':             {'soil_type': 'Clay Loam',  'avg_temp': 26, 'avg_rainfall': 2700},
    'Gaibandha':        {'soil_type': 'Clay',       'avg_temp': 25, 'avg_rainfall': 1600},
    'Gazipur':          {'soil_type': 'Loam',       'avg_temp': 26, 'avg_rainfall': 1900},
    'Gopalganj':        {'soil_type': 'Loam',       'avg_temp': 26, 'avg_rainfall': 1900},
    'Habiganj':         {'soil_type': 'Clay Loam',  'avg_temp': 25, 'avg_rainfall': 3200},
    'Jamalpur':         {'soil_type': 'Clay',       'avg_temp': 26, 'avg_rainfall': 2100},
    'Jashore':          {'soil_type': 'Loam',       'avg_temp': 26, 'avg_rainfall': 1600},
    'Jhalokathi':       {'soil_type': 'Clay Loam',  'avg_temp': 26, 'avg_rainfall': 2300},
    'Jhenaidah':        {'soil_type': 'Loam',       'avg_temp': 26, 'avg_rainfall': 1600},
    'Joypurhat':        {'soil_type': 'Sandy Loam', 'avg_temp': 26, 'avg_rainfall': 1500},
    'Khagrachhari':     {'soil_type': 'Loam',       'avg_temp': 25, 'avg_rainfall': 2400},
    'Khulna':           {'soil_type': 'Clay Loam',  'avg_temp': 26, 'avg_rainfall': 1800},
    'Kishoreganj':      {'soil_type': 'Clay',       'avg_temp': 26, 'avg_rainfall': 2400},
    'Kurigram':         {'soil_type': 'Clay',       'avg_temp': 25, 'avg_rainfall': 2200},
    'Kushtia':          {'soil_type': 'Loam',       'avg_temp': 26, 'avg_rainfall': 1500},
    'Lakshmipur':       {'soil_type': 'Clay Loam',  'avg_temp': 26, 'avg_rainfall': 2400},
    'Lalmonirhat':      {'soil_type': 'Clay',       'avg_temp': 25, 'avg_rainfall': 2300},
    'Madaripur':        {'soil_type': 'Loam',       'avg_temp': 26, 'avg_rainfall': 1900},
    'Magura':           {'soil_type': 'Loam',       'avg_temp': 26, 'avg_rainfall': 1600},
    'Manikganj':        {'soil_type': 'Loam',       'avg_temp': 26, 'avg_rainfall': 1700},
    'Meherpur':         {'soil_type': 'Loam',       'avg_temp': 26, 'avg_rainfall': 1500},
    'Moulvibazar':      {'soil_type': 'Clay Loam',  'avg_temp': 25, 'avg_rainfall': 3300},
    'Munshiganj':       {'soil_type': 'Loam',       'avg_temp': 26, 'avg_rainfall': 1900},
    'Mymensingh':       {'soil_type': 'Clay',       'avg_temp': 26, 'avg_rainfall': 2300},
    'Naogaon':          {'soil_type': 'Sandy Loam', 'avg_temp': 26, 'avg_rainfall': 1400},
    'Narail':           {'soil_type': 'Loam',       'avg_temp': 26, 'avg_rainfall': 1700},
    'Narayanganj':      {'soil_type': 'Loam',       'avg_temp': 27, 'avg_rainfall': 1900},
    'Narsingdi':        {'soil_type': 'Loam',       'avg_temp': 26, 'avg_rainfall': 1900},
    'Natore':           {'soil_type': 'Sandy Loam', 'avg_temp': 26, 'avg_rainfall': 1400},
    'Netrokona':        {'soil_type': 'Clay',       'avg_temp': 26, 'avg_rainfall': 2700},
    'Nilphamari':       {'soil_type': 'Clay',       'avg_temp': 25, 'avg_rainfall': 2400},
    'Noakhali':         {'soil_type': 'Clay Loam',  'avg_temp': 26, 'avg_rainfall': 2800},
    'Pabna':            {'soil_type': 'Sandy Loam', 'avg_temp': 26, 'avg_rainfall': 1500},
    'Panchagarh':       {'soil_type': 'Sandy Loam', 'avg_temp': 24, 'avg_rainfall': 2800},
    'Patuakhali':       {'soil_type': 'Clay Loam',  'avg_temp': 26, 'avg_rainfall': 2500},
    'Pirojpur':         {'soil_type': 'Clay Loam',  'avg_temp': 26, 'avg_rainfall': 2400},
    'Rajbari':          {'soil_type': 'Loam',       'avg_temp': 26, 'avg_rainfall': 1700},
    'Rajshahi':         {'soil_type': 'Sandy Loam', 'avg_temp': 27, 'avg_rainfall': 1400},
    'Rangamati':        {'soil_type': 'Loam',       'avg_temp': 25, 'avg_rainfall': 2600},
    'Rangpur':          {'soil_type': 'Sandy Loam', 'avg_temp': 25, 'avg_rainfall': 1700},
    'Satkhira':         {'soil_type': 'Clay Loam',  'avg_temp': 26, 'avg_rainfall': 1700},
    'Shariatpur':       {'soil_type': 'Loam',       'avg_temp': 26, 'avg_rainfall': 1900},
    'Sherpur':          {'soil_type': 'Clay',       'avg_temp': 25, 'avg_rainfall': 2500},
    'Sirajganj':        {'soil_type': 'Loam',       'avg_temp': 26, 'avg_rainfall': 1500},
    'Sunamganj':        {'soil_type': 'Clay Loam',  'avg_temp': 25, 'avg_rainfall': 3800},
    'Sylhet':           {'soil_type': 'Clay Loam',  'avg_temp': 25, 'avg_rainfall': 3800},
    'Tangail':          {'soil_type': 'Loam',       'avg_temp': 26, 'avg_rainfall': 1900},
    'Thakurgaon':       {'soil_type': 'Sandy Loam', 'avg_temp': 24, 'avg_rainfall': 2000},
}

# District name -> approximate lat/lon (centroids), used for weather lookups.
DISTRICT_COORDS = {
    "Bagerhat":         {"lat": 22.6602, "lon": 89.7895},
    "Bandarban":        {"lat": 22.1953, "lon": 92.2184},
    "Barguna":          {"lat": 22.0953, "lon": 90.1121},
    "Barishal":         {"lat": 22.7010, "lon": 90.3535},
    "Bhola":            {"lat": 22.6859, "lon": 90.6482},
    "Bogura":           {"lat": 24.8465, "lon": 89.3773},
    "Brahmanbaria":     {"lat": 23.9571, "lon": 91.1115},
    "Chandpur":         {"lat": 23.2333, "lon": 90.6712},
    "Chapai Nawabganj": {"lat": 24.5965, "lon": 88.2776},
    "Chattogram":       {"lat": 22.3569, "lon": 91.7832},
    "Chuadanga":        {"lat": 23.6402, "lon": 88.8410},
    "Cumilla":          {"lat": 23.4607, "lon": 91.1809},
    "Cox's Bazar":      {"lat": 21.4272, "lon": 92.0058},
    "Dhaka":            {"lat": 23.8103, "lon": 90.4125},
    "Dinajpur":         {"lat": 25.6279, "lon": 88.6332},
    "Faridpur":         {"lat": 23.6070, "lon": 89.8429},
    "Feni":             {"lat": 23.0159, "lon": 91.3976},
    "Gaibandha":        {"lat": 25.3288, "lon": 89.5286},
    "Gazipur":          {"lat": 23.9999, "lon": 90.4203},
    "Gopalganj":        {"lat": 23.0050, "lon": 89.8266},
    "Habiganj":         {"lat": 24.3745, "lon": 91.4155},
    "Jamalpur":         {"lat": 24.9375, "lon": 89.9372},
    "Jashore":          {"lat": 23.1664, "lon": 89.2081},
    "Jhalokathi":       {"lat": 22.6406, "lon": 90.1987},
    "Jhenaidah":        {"lat": 23.5448, "lon": 89.1539},
    "Joypurhat":        {"lat": 25.0968, "lon": 89.0227},
    "Khagrachhari":     {"lat": 23.1193, "lon": 91.9847},
    "Khulna":           {"lat": 22.8456, "lon": 89.5403},
    "Kishoreganj":      {"lat": 24.4449, "lon": 90.7766},
    "Kurigram":         {"lat": 25.8054, "lon": 89.6361},
    "Kushtia":          {"lat": 23.9013, "lon": 89.1206},
    "Lakshmipur":       {"lat": 22.9447, "lon": 90.8282},
    "Lalmonirhat":      {"lat": 25.9923, "lon": 89.2847},
    "Madaripur":        {"lat": 23.1641, "lon": 90.1897},
    "Magura":           {"lat": 23.4855, "lon": 89.4197},
    "Manikganj":        {"lat": 23.8644, "lon": 90.0047},
    "Meherpur":         {"lat": 23.7622, "lon": 88.6318},
    "Moulvibazar":      {"lat": 24.4829, "lon": 91.7774},
    "Munshiganj":       {"lat": 23.5422, "lon": 90.5305},
    "Mymensingh":       {"lat": 24.7471, "lon": 90.4203},
    "Naogaon":          {"lat": 24.8062, "lon": 88.9318},
    "Narail":           {"lat": 23.1725, "lon": 89.5126},
    "Narayanganj":      {"lat": 23.6238, "lon": 90.5000},
    "Narsingdi":        {"lat": 23.9322, "lon": 90.7150},
    "Natore":           {"lat": 24.4206, "lon": 88.9956},
    "Netrokona":        {"lat": 24.8824, "lon": 90.7280},
    "Nilphamari":       {"lat": 25.9317, "lon": 88.8560},
    "Noakhali":         {"lat": 22.8696, "lon": 91.0995},
    "Pabna":            {"lat": 24.0064, "lon": 89.2372},
    "Panchagarh":       {"lat": 26.3411, "lon": 88.5541},
    "Patuakhali":       {"lat": 22.3596, "lon": 90.3296},
    "Pirojpur":         {"lat": 22.5841, "lon": 89.9720},
    "Rajbari":          {"lat": 23.7574, "lon": 89.6444},
    "Rajshahi":         {"lat": 24.3745, "lon": 88.6042},
    "Rangamati":        {"lat": 22.6533, "lon": 92.1796},
    "Rangpur":          {"lat": 25.7460, "lon": 89.2502},
    "Satkhira":         {"lat": 22.7185, "lon": 89.0705},
    "Shariatpur":       {"lat": 23.2423, "lon": 90.4348},
    "Sherpur":          {"lat": 25.0204, "lon": 90.0153},
    "Sirajganj":        {"lat": 24.4533, "lon": 89.7006},
    "Sunamganj":        {"lat": 25.0658, "lon": 91.3950},
    "Sylhet":           {"lat": 24.8949, "lon": 91.8687},
    "Tangail":          {"lat": 24.2513, "lon": 89.9167},
    "Thakurgaon":       {"lat": 26.0336, "lon": 88.4616},
}


# ============================================================
# HELPER FUNCTIONS
# ============================================================

def load_crop_data(crop_name: str, district: str):
    """CSV থেকে নির্দিষ্ট crop ও district-এর data load করো।"""
    try:
        df = pd.read_csv(DATA_FILE)
        df['date'] = pd.to_datetime(df['date'])
        filtered = df[
            (df['crop_name'] == crop_name) &
            (df['district'] == district)
        ].sort_values('date').reset_index(drop=True)

        if len(filtered) == 0:
            raise HTTPException(
                status_code=404,
                detail=f"No data found for {crop_name} in {district}"
            )
        return filtered
    except FileNotFoundError:
        raise HTTPException(
            status_code=500,
            detail="Data file not found. Please check DATA_FILE path."
        )


def simple_price_forecast(df: pd.DataFrame, days: int):
    """
    Simple statistical price forecast।
    Prophet model না থাকলেও কাজ করবে।
    """
    prices = pd.to_numeric(
        df['avg_price'], errors='coerce').to_numpy(dtype=float)
    dates = pd.to_datetime(df['date']).to_numpy()
    last_price = prices[-1]
    last_date = pd.to_datetime(dates[-1])

    # Rolling statistics
    roll_7 = np.mean(prices[-7:]) if len(prices) >= 7 else last_price
    roll_30 = np.mean(prices[-30:]) if len(prices) >= 30 else last_price
    roll_90 = np.mean(prices[-90:]) if len(prices) >= 90 else last_price

    # Trend
    if len(prices) >= 14:
        trend = (np.mean(prices[-7:]) - np.mean(prices[-14:-7])) / 7
    else:
        trend = 0

    # Seasonal adjustment
    month = last_date.month
    seasonal_factors = {
        1: 1.05, 2: 1.03, 3: 0.95, 4: 0.92, 5: 0.90,
        6: 0.88, 7: 0.85, 8: 0.88, 9: 0.92, 10: 1.00,
        11: 1.08, 12: 1.10
    }

    forecasts = []
    for d in range(1, days + 1):
        future_date = last_date + timedelta(days=d)
        future_month = future_date.month
        seasonal_adj = seasonal_factors.get(future_month, 1.0)
        predicted = (roll_7 * 0.5 + roll_30 * 0.3 + last_price * 0.2)
        predicted = predicted + (trend * d * 0.3)
        predicted = predicted * seasonal_adj
        predicted = max(predicted, last_price * 0.5)

        noise = np.random.normal(0, abs(predicted) * 0.03)
        predicted = round(predicted + noise, 2)
        lower = round(predicted * 0.88, 2)
        upper = round(predicted * 1.12, 2)

        prev = forecasts[-1]['predicted_price'] if forecasts else last_price
        if predicted > prev * 1.01:
            trend_label = "↑ Rising"
        elif predicted < prev * 0.99:
            trend_label = "↓ Falling"
        else:
            trend_label = "→ Stable"

        forecasts.append({
            'date':            future_date.strftime('%Y-%m-%d'),
            'predicted_price': predicted,
            'lower_bound':     lower,
            'upper_bound':     upper,
            'trend':           trend_label,
        })

    return forecasts, last_price, roll_7, roll_30


def simple_demand_forecast(df: pd.DataFrame, days: int):
    """Simple statistical demand forecast."""
    demand = df['quantity_available'].to_numpy(dtype=float)
    dates = df['date'].to_numpy(dtype='datetime64[ns]')
    last_date = pd.to_datetime(dates[-1])
    last_dem = demand[-1]

    roll_7 = np.mean(demand[-7:]) if len(demand) >= 7 else last_dem
    roll_30 = np.mean(demand[-30:]) if len(demand) >= 30 else last_dem
    mean_dem = np.mean(demand)

    month = last_date.month
    seasonal = {
        1: 1.10, 2: 1.05, 3: 0.90, 4: 0.88, 5: 0.92,
        6: 0.80, 7: 0.78, 8: 0.82, 9: 0.90, 10: 1.05,
        11: 1.20, 12: 1.15
    }

    forecasts = []
    for d in range(1, days + 1):
        future_date = last_date + timedelta(days=d)
        future_month = future_date.month
        s_adj = seasonal.get(future_month, 1.0)
        predicted = (roll_7 * 0.5 + roll_30 * 0.3 + last_dem * 0.2) * s_adj
        noise = np.random.normal(0, abs(predicted) * 0.05)
        predicted = max(0, int(predicted + noise))
        lower = int(predicted * 0.82)
        upper = int(predicted * 1.18)

        if predicted > mean_dem * 1.15:
            signal = "🟢 High Demand"
        elif predicted < mean_dem * 0.85:
            signal = "🔴 Low Demand"
        else:
            signal = "🟡 Normal"

        forecasts.append({
            'date':             future_date.strftime('%Y-%m-%d'),
            'predicted_demand': predicted,
            'lower_bound':      lower,
            'upper_bound':      upper,
            'market_signal':    signal,
        })

    return forecasts, mean_dem


def score_crop_api(crop_name, crop_info, farmer_profile):
    """Crop scoring engine."""
    district = farmer_profile['district']
    month = farmer_profile['planting_month']
    soil = farmer_profile['soil_type']
    land = farmer_profile['land_acres']
    budget = farmer_profile['budget_bdt']
    exp = farmer_profile['experience']

    # Season score
    if month in crop_info['best_months']:
        season_s = 100
    elif any(abs(month-m) <= 1 or abs(month-m) == 11
             for m in crop_info['best_months']):
        season_s = 65
    else:
        season_s = 20

    # Soil score
    soil_s = 100 if soil in crop_info['soil_types'] else (
        70 if soil == 'Loam' else 40)

    # District score
    dist_s = 100 if district in crop_info.get('districts', []) else 50

    # Profit score
    rev = crop_info['avg_yield_kg'] * crop_info['avg_price_bdt'] * land
    cost = crop_info['input_cost_bdt'] * land
    margin = ((rev-cost)/rev*100) if rev > 0 else 0
    profit_s = min(100, max(0, margin * 1.5))

    # Budget score
    total_cost = crop_info['input_cost_bdt'] * land
    if budget >= total_cost*1.2:
        budget_s = 100
    elif budget >= total_cost:
        budget_s = 80
    elif budget >= total_cost*0.8:
        budget_s = 50
    else:
        budget_s = 20

    # Experience score
    diff_map = {'Easy': 1, 'Medium': 2, 'Hard': 3}
    exp_map = {'Beginner': 1, 'Intermediate': 2, 'Expert': 3}
    diff_v = diff_map.get(crop_info['difficulty'], 2)
    exp_v = exp_map.get(exp, 2)
    exp_s = 100 if exp_v >= diff_v else (60 if exp_v == diff_v-1 else 25)

    final = (season_s*0.25 + soil_s*0.20 + dist_s*0.15 +
             profit_s*0.20 + budget_s*0.10 + exp_s*0.10)

    est_profit = int(rev - cost)
    est_revenue = int(rev)
    est_cost = int(cost)

    if final >= 80:
        advisory = "✅ Highly Recommended — Excellent fit!"
    elif final >= 65:
        advisory = "⚡ Recommended — Good choice this season."
    elif final >= 50:
        advisory = "⚠️  Consider carefully — Some risks present."
    else:
        advisory = "❌ Not Recommended — Poor fit this season."

    return {
        'crop':              crop_name,
        'name_bn':           crop_info['name_bn'],
        'score':             round(final, 1),
        'category':          crop_info['category'],
        'grow_days':         crop_info['grow_days'],
        'difficulty':        crop_info['difficulty'],
        'market_demand':     crop_info['market_demand'],
        'risk_level':        crop_info['risk_level'],
        'est_profit_bdt':    est_profit,
        'est_revenue_bdt':   est_revenue,
        'est_cost_bdt':      est_cost,
        'profit_margin_pct': round(margin, 1),
        'advisory':          advisory,
    }


def _build_weather_advisory(weather_id: int, wind_speed: float, description: str):
    """OpenWeatherMap condition code -> short farmer-facing advisory.
    Codes reference: https://openweathermap.org/weather-conditions
    Returns (title, message) or (None, None) when no alert is needed.
    """
    if 200 <= weather_id < 300:
        return ("⚠️ Thunderstorm Warning",
                f"Thunderstorms expected ({description}). Secure mature crops and avoid open fields.")
    if 500 <= weather_id < 600:
        if weather_id >= 502:
            return ("⚠️ Heavy Rain Warning",
                    f"Heavy rainfall expected ({description}). Ensure proper field drainage to prevent waterlogging.")
        return ("🌧️ Rain Advisory",
                f"Rain expected ({description}). Delay any planned pesticide or fertilizer spraying.")
    if 600 <= weather_id < 700:
        return ("❄️ Cold Advisory", f"Cold conditions expected ({description}). Protect seedlings from cold stress.")
    if wind_speed >= 10:
        return ("💨 High Wind Warning",
                f"Strong winds expected ({wind_speed} m/s). Stake tall crops and secure greenhouse covers.")
    if weather_id == 800:
        return (None, None)  # clear sky — no advisory needed
    return ("ℹ️ Weather Update", f"Current conditions: {description}.")


# ============================================================
# API ROUTES
# ============================================================

# ── Root ─────────────────────────────────────────────────────
@app.get("/", tags=["General"])
async def root():
    return {
        "message":     "🌾 Welcome to AgroMitra AI API",
        "version":     "1.0.0",
        "university":  "Uttara University | CSE Department",
        "endpoints": {
            "docs":              "/docs",
            "price_prediction":  "/api/v1/ai/price-prediction",
            "demand_forecast":   "/api/v1/ai/demand-forecast",
            "crop_recommend":    "/api/v1/ai/crop-recommendation",
            "auth":              "/api/v1/auth",
            "products":          "/api/v1/products",
            "orders":            "/api/v1/orders",
            "health":            "/health",
            "crops_list":        "/api/v1/crops",
            "districts_list":    "/api/v1/districts",
            "weather_alert":     "/api/v1/weather/alert",
            "sowing_calendar":   "/api/v1/crops/sowing-calendar",
        }
    }


# ── Health Check ─────────────────────────────────────────────
@app.get("/health", tags=["General"])
async def health_check():
    database_status = {
        "enabled": DATABASE_ENABLED,
        "status": "disabled",
    }

    if DATABASE_ENABLED and db_engine is not None and db_text is not None:
        try:
            with db_engine.connect() as conn:
                conn.execute(db_text("SELECT 1"))
            database_status["status"] = "connected"
        except Exception as exc:
            database_status["status"] = "connection_failed"
            database_status["error"] = str(exc)
    elif DATABASE_IMPORT_ERROR:
        database_status["error"] = DATABASE_IMPORT_ERROR

    return {
        "status":    "healthy",
        "timestamp": datetime.now().isoformat(),
        "database":  database_status,
        "models": {
            "price_prediction":  "✅ Ready (Statistical)",
            "demand_forecasting": "✅ Ready (Statistical)",
            "crop_recommendation": "✅ Ready (Rule-Based)",
        }
    }


# ── Available Crops ──────────────────────────────────────────
@app.get("/api/v1/crops", tags=["Reference"])
async def get_crops():
    return {
        "crops": [
            {"name": k, "name_bn": v['name_bn'], "category": v['category']}
            for k, v in CROP_DB.items()
        ]
    }


# ── Available Districts ──────────────────────────────────────
@app.get("/api/v1/districts", tags=["Reference"])
async def get_districts():
    return {
        "districts": [
            {"name": k, "soil_type": v['soil_type']}
            for k, v in DISTRICT_PROFILES.items()
        ]
    }


# ── Market Prices (Current) ──────────────────────────────────
@app.get("/api/v1/market/prices", tags=["Market"])
async def get_market_prices(
    crop_name: Optional[str] = None,
    district: Optional[str] = None
):
    try:
        df = pd.read_csv(DATA_FILE)
        df['date'] = pd.to_datetime(df['date'])
        latest = df.sort_values('date').groupby(
            ['crop_name', 'district']).last().reset_index()

        if crop_name:
            latest = latest[latest['crop_name'] == crop_name]
        if district:
            latest = latest[latest['district'] == district]

        return {
            "prices": latest[['crop_name', 'district', 'avg_price', 'min_price', 'max_price', 'date']]
            .rename(columns={'date': 'last_updated'})
            .assign(last_updated=lambda x: x['last_updated'].dt.strftime('%Y-%m-%d'))
            .to_dict(orient='records'),
            "count": len(latest)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── PRICE PREDICTION ─────────────────────────────────────────
@app.post("/api/v1/ai/price-prediction", tags=["AI Models"])
async def price_prediction(req: PricePredictionRequest):
    """
    🤖 AI Price Prediction
    - Crop-এর আগামী N দিনের দাম predict করো
    - Prophet + XGBoost hybrid model
    """
    # Validate inputs
    if req.crop_name not in CROP_DB:
        raise HTTPException(
            status_code=400,
            detail=f"Crop '{req.crop_name}' not found. Available: {list(CROP_DB.keys())}"
        )
    if req.district not in DISTRICT_PROFILES:
        raise HTTPException(
            status_code=400,
            detail=f"District '{req.district}' not found. Available: {list(DISTRICT_PROFILES.keys())}"
        )

    df = load_crop_data(req.crop_name, req.district)
    forecasts, last_price, roll_7, roll_30 = simple_price_forecast(
        df, req.days)

    avg_forecast = np.mean([f['predicted_price'] for f in forecasts])
    trend_pct = ((avg_forecast - last_price) / last_price) * 100

    if trend_pct > 3:
        market_outlook = "📈 Prices rising — Good time to sell!"
    elif trend_pct < -3:
        market_outlook = "📉 Prices falling — Consider early harvest."
    else:
        market_outlook = "📊 Prices stable — Normal conditions."

    return {
        "crop":            req.crop_name,
        "district":        req.district,
        "current_price":   round(float(last_price), 2),
        "forecast_days":   req.days,
        "forecasts":       forecasts,
        "summary": {
            "avg_7day_price":  round(roll_7, 2),
            "avg_30day_price": round(roll_30, 2),
            "avg_forecast":    round(avg_forecast, 2),
            "trend_pct":       round(trend_pct, 2),
            "market_outlook":  market_outlook,
        },
        "generated_at": datetime.now().isoformat(),
    }


# ── DEMAND FORECAST ───────────────────────────────────────────
@app.post("/api/v1/ai/demand-forecast", tags=["AI Models"])
async def demand_forecast(req: DemandForecastRequest):
    """
    📊 AI Demand Forecasting
    - Crop-এর আগামী N দিনের demand predict করো
    - LSTM Neural Network model
    """
    if req.crop_name not in CROP_DB:
        raise HTTPException(status_code=400,
                            detail=f"Crop '{req.crop_name}' not found.")
    if req.district not in DISTRICT_PROFILES:
        raise HTTPException(status_code=400,
                            detail=f"District '{req.district}' not found.")

    df = load_crop_data(req.crop_name, req.district)
    forecasts, mean_dem = simple_demand_forecast(df, req.days)

    avg_forecast = np.mean([f['predicted_demand'] for f in forecasts])
    change_pct = ((avg_forecast - mean_dem) / mean_dem) * 100

    if change_pct > 10:
        advisory = "✅ HIGH demand expected — Increase production!"
    elif change_pct < -10:
        advisory = "⚠️  LOW demand expected — Reduce production."
    else:
        advisory = "📊 STABLE demand — Maintain current production."

    return {
        "crop":             req.crop_name,
        "district":         req.district,
        "forecast_days":    req.days,
        "forecasts":        forecasts,
        "summary": {
            "historical_avg_demand": round(mean_dem, 0),
            "forecast_avg_demand":   round(avg_forecast, 0),
            "demand_change_pct":     round(change_pct, 2),
            "farmer_advisory":       advisory,
        },
        "generated_at": datetime.now().isoformat(),
    }


# ── CROP RECOMMENDATION ───────────────────────────────────────
@app.post("/api/v1/ai/crop-recommendation", tags=["AI Models"])
async def crop_recommendation(req: CropRecommendationRequest):
    """
    🌱 AI Crop Recommendation
    - Farmer-এর জন্য top 5 crop suggestions
    - Content-Based Filtering + Scoring Algorithm
    """
    # Validate
    valid_soils = ['Loam', 'Sandy Loam', 'Clay Loam', 'Clay']
    valid_exp = ['Beginner', 'Intermediate', 'Expert']

    if req.district not in DISTRICT_PROFILES:
        raise HTTPException(status_code=400,
                            detail=f"District not found. Available: {list(DISTRICT_PROFILES.keys())}")
    if req.soil_type not in valid_soils:
        raise HTTPException(status_code=400,
                            detail=f"Soil type must be one of: {valid_soils}")
    if req.experience not in valid_exp:
        raise HTTPException(status_code=400,
                            detail=f"Experience must be one of: {valid_exp}")

    farmer_profile = {
        'name':            req.farmer_name,
        'district':        req.district,
        'soil_type':       req.soil_type,
        'land_acres':      req.land_acres,
        'budget_bdt':      req.budget_bdt,
        'experience':      req.experience,
        'planting_month':  req.planting_month,
    }

    # Score all crops
    results = []
    for crop_name, crop_info in CROP_DB.items():
        score = score_crop_api(crop_name, crop_info, farmer_profile)
        results.append(score)

    results.sort(key=lambda x: x['score'], reverse=True)
    top5 = results[:5]

    # Add rank
    for i, r in enumerate(top5):
        r['rank'] = i + 1

    top = top5[0]
    season_names = {
        **{m: 'Winter' for m in [11, 12, 1, 2]},
        **{m: 'Summer' for m in [3, 4, 5]},
        **{m: 'Monsoon' for m in [6, 7, 8, 9]},
        **{m: 'Autumn' for m in [10]},
    }
    current_season = season_names.get(req.planting_month, 'Unknown')

    return {
        "farmer":          req.farmer_name,
        "district":        req.district,
        "soil_type":       req.soil_type,
        "land_acres":      req.land_acres,
        "budget_bdt":      req.budget_bdt,
        "experience":      req.experience,
        "current_season":  current_season,
        "recommendations": top5,
        "top_pick": {
            "crop":          top['crop'],
            "name_bn":       top['name_bn'],
            "score":         top['score'],
            "est_profit":    top['est_profit_bdt'],
            "grow_days":     top['grow_days'],
            "risk":          top['risk_level'],
            "advisory":      top['advisory'],
        },
        "generated_at": datetime.now().isoformat(),
    }


# ── FAIR PRICE CHECK ─────────────────────────────────────────
@app.get("/api/v1/ai/fair-price", tags=["AI Models"])
async def fair_price(crop_name: str, district: str):
    """
    💰 Fair Price Indicator
    - Listing-এ fair price range দেখাও
    """
    if crop_name not in CROP_DB:
        raise HTTPException(status_code=400, detail="Crop not found.")
    if district not in DISTRICT_PROFILES:
        raise HTTPException(status_code=400, detail="District not found.")

    df = load_crop_data(crop_name, district)

    recent = df.tail(30)
    avg_price = float(recent['avg_price'].mean())
    std_price = float(recent['avg_price'].std())
    min_fair = round(max(avg_price - std_price, recent['min_price'].min()), 2)
    max_fair = round(avg_price + std_price, 2)
    suggested = round(avg_price * 1.05, 2)

    return {
        "crop":             crop_name,
        "district":         district,
        "fair_price_min":   min_fair,
        "fair_price_max":   max_fair,
        "suggested_price":  suggested,
        "current_avg":      round(avg_price, 2),
        "verdict":          "✅ Fair range based on last 30 days market data",
        "generated_at":     datetime.now().isoformat(),
    }


# ── WEATHER ALERT ──────────────────────────────────────────────
@app.get("/api/v1/weather/alert", tags=["Weather"])
async def get_weather_alert(district: str):
    """
    🌤️ District-level current weather + a simple farmer advisory.
    `has_alert` is False (and alert_title/alert_message are None) when
    conditions are clear and no advisory is needed.
    """
    if not OPENWEATHER_API_KEY:
        raise HTTPException(
            status_code=503, detail="Weather service not configured (missing API key).")

    coords = DISTRICT_COORDS.get(district)
    if not coords:
        raise HTTPException(
            status_code=400,
            detail=f"District '{district}' not supported. Available: {list(DISTRICT_COORDS.keys())}"
        )

    try:
        resp = requests.get(
            "https://api.openweathermap.org/data/2.5/weather",
            params={
                "lat":   coords["lat"],
                "lon":   coords["lon"],
                "appid": OPENWEATHER_API_KEY,
                "units": "metric",
            },
            timeout=8,
        )
        resp.raise_for_status()
        data = resp.json()
    except requests.RequestException as exc:
        raise HTTPException(
            status_code=502, detail=f"Could not reach weather service: {exc}")

    weather_id = data.get("weather", [{}])[0].get("id", 800)
    description = data.get("weather", [{}])[0].get("description", "clear sky")
    temp = data.get("main", {}).get("temp")
    humidity = data.get("main", {}).get("humidity")
    wind_speed = data.get("wind", {}).get("speed", 0)

    title, advisory_text = _build_weather_advisory(
        weather_id, wind_speed, description)

    return {
        "district":      district,
        "temperature_c": temp,
        "humidity_pct":  humidity,
        "wind_speed_ms": wind_speed,
        "condition":     description,
        "has_alert":     advisory_text is not None,
        "alert_title":   title,
        "alert_message": advisory_text,
        "generated_at":  datetime.now().isoformat(),
    }


# ── SOWING CALENDAR ───────────────────────────────────────────
MONTH_NAMES = [
    "", "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
]


@app.get("/api/v1/crops/sowing-calendar", tags=["Reference"])
async def get_sowing_calendar(month: Optional[int] = None):
    """
    📅 Crops whose best planting months include the given month
    (defaults to the current month). Built from CROP_DB.best_months.
    """
    target_month = month or datetime.now().month
    if not (1 <= target_month <= 12):
        raise HTTPException(
            status_code=400, detail="month must be between 1 and 12.")

    matches = []
    for crop_name, info in CROP_DB.items():
        # এখানে চেক করা হচ্ছে বর্তমান মাসটি ফসলের best_months লিস্টে আছে কিনা
        if target_month in info.get('best_months', []):
            matches.append({
                "crop":           crop_name,
                "name_bn":        info.get('name_bn', ''),
                "category":       info.get('category', ''),
                "grow_days":      info.get('grow_days', 0),
                "difficulty":     info.get('difficulty', 'Medium'),
                "water_need":     info.get('water_need', 'Medium'),
                "soil_types":     info.get('soil_types', []),
                "market_demand":  info.get('market_demand', 'Medium'),
                "districts":      info.get('districts', []),
            })

    # Sort: highest demand surfaced first
    demand_rank = {"Very High": 0, "High": 1, "Medium": 2, "Low": 3}
    matches.sort(key=lambda c: demand_rank.get(c['market_demand'], 9))

    return {
        "month":      target_month,
        "month_name": MONTH_NAMES[target_month],
        "crops":      matches,
        "count":      len(matches),
        "generated_at": datetime.now().isoformat(),
    }



app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")
