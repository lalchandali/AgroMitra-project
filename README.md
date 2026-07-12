<div align="center">

# 🌾 AgroMitra

**A Farmer-to-Buyer Agricultural Marketplace with AI-Powered Insights**

Final Year Project — Department of CSE, Uttara University
Batch 60-C (Evening) · Supervisor: Md. Ashraful Kabir

[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/Frontend-React-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Python](https://img.shields.io/badge/Python-3.11-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![License](https://img.shields.io/badge/License-Academic-lightgrey)]()

</div>

---

## 📖 About

AgroMitra ("farmer's friend") is a bilingual (Bengali/English) web platform that connects **farmers directly with buyers** across Bangladesh, cutting out middlemen and giving farmers fair, data-informed prices. It combines a full e-commerce marketplace with **machine learning models** trained on agricultural data covering all 64 districts of Bangladesh.

## ✨ Key Features

### 👨‍🌾 For Farmers

- List products with photos, pricing, and stock — with an **AI-powered price suggestion** tool pulling live market forecasts before you set a price
- Manage multi-item orders, track escrow-based payments, and view per-crop earnings breakdowns
- District-specific weather alerts and a crop sowing calendar

### 🛒 For Buyers

- Browse and filter products by district, category, and price
- Cart supports multiple farmers at once — checkout automatically groups items **by farmer into separate orders**
- AI fair-price checker so buyers know they're paying a reasonable rate
- Wishlist, order tracking, and escrow-protected payments

### 🛠️ For Admins

- Manage users, verify farmer accounts, and moderate product listings
- **Configurable platform fee** — set the marketplace commission percentage directly from the admin panel, no code changes needed
- Full visibility into all orders and platform-wide statistics

### 🤖 AI / ML Models

| Model                   | Purpose                                                        |
| ----------------------- | -------------------------------------------------------------- |
| **Price Prediction**    | 7-day price forecast per crop per district (Prophet + XGBoost) |
| **Demand Forecast**     | Predicts upcoming demand trends for a crop                     |
| **Crop Recommendation** | Suggests the best crop for a farmer's land, budget, and season |
| **Fair Price Checker**  | Flags listings priced significantly above/below the market     |
| **Disease Detection**   | Image-based crop disease identification (Keras/CNN)            |

### 🌐 Platform-wide

- Full **Bengali / English** language toggle
- Role-based dashboards (Farmer / Buyer / Admin) with a collapsible sidebar
- JWT authentication with refresh-token auto-renewal
- Escrow-style payment flow: funds held until delivery is confirmed

---

## 🏗️ Tech Stack

**Frontend:** React 18 · Vite · React Router · Axios · Recharts · Tailwind CSS
**Backend:** FastAPI · SQLAlchemy · Pydantic · Uvicorn
**Database:** PostgreSQL
**AI/ML:** Prophet · XGBoost · scikit-learn · Keras/TensorFlow
**Auth:** JWT (access + refresh tokens) · bcrypt password hashing

---

## 📂 Project Structure

```
AgroMitra/
├── backend/
│   ├── main.py                  # FastAPI entrypoint — AI endpoints + wires in DB routes
│   ├── ai_models/                # Price prediction, demand forecast, crop recommendation
│   ├── models/                   # Trained model files (.keras, .json)
│   ├── database/
│   │   ├── database.py           # SQLAlchemy engine / session setup
│   │   ├── models/                # ORM models: User, Product, Order, OrderItem, PlatformSettings
│   │   ├── schemas/               # Pydantic request/response schemas
│   │   ├── routes/                # auth, product, order, weather, admin settings routes
│   │   └── scripts/               # DB setup/health-check utilities
│   └── uploads/                  # User-uploaded product & profile photos
│
├── frontend/
│   ├── src/
│   │   ├── pages/                 # Home, AuthPage, FarmerDashboard, BuyerMarketplace, AdminPanel
│   │   ├── components/            # Navbar, Sidebar, SettingsTab
│   │   ├── api/agromitra.js       # Centralized API client (axios + auto refresh-token)
│   │   ├── hooks/useLanguage.js   # EN/BN language toggle
│   │   └── translations.js        # Bilingual text strings
│   └── public/
│
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites

- Python 3.11+
- Node.js 18+
- PostgreSQL 14+

### 1. Clone the repository

```bash
git clone https://github.com/<your-username>/agromitra.git
cd agromitra
```

### 2. Backend setup

```bash
cd backend
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # macOS/Linux

pip install -r ai_models/requirements.txt
pip install fastapi uvicorn sqlalchemy psycopg2-binary python-jose bcrypt python-multipart python-dotenv
```

Create a `.env` file inside `backend/`:

```env
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/agromitra_db
JWT_SECRET_KEY=your-random-secret-key-here
OPENWEATHER_API_KEY=your-openweather-api-key
```

Create the database, then run:

```bash
python database/scripts/create_db.py
uvicorn main:app --reload --port 8000
```

API docs available at `http://localhost:8000/docs`

### 3. Frontend setup

```bash
cd frontend
npm install
```

Create a `.env` file inside `frontend/`:

```env
VITE_API_URL=http://localhost:8000
```

```bash
npm run dev
```

App available at `http://localhost:5177`

---

## 👥 User Roles

| Role       | Access                                                     |
| ---------- | ---------------------------------------------------------- |
| **Farmer** | List/manage products, fulfill orders, view earnings        |
| **Buyer**  | Browse marketplace, place orders, track deliveries         |
| **Admin**  | Manage users/products, moderate listings, set platform fee |

---

## 🎓 Academic Context

This project was developed as a final year requirement for the B.Sc. in Computer Science & Engineering program at **Uttara University**, Dhaka, under the supervision of **Md. Ashraful Kabir**.

**Team:** Batch 60-C (Evening), 5-member team
**Primary developer:** MD LAL CHAND ALI

---

## 📄 License

This project is developed for academic purposes as part of a university final year project.
