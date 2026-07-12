"""
============================================================
  AgroMitra — 64-District Synthetic Price Data Generator
============================================================
Generates crop_prices_v2.csv rows for ALL 64 Bangladeshi
districts, but only for crops that realistically grow there
(based on commonly known agricultural zones — not official
government zoning data).

Run this ONCE on your machine, from the folder that contains
your existing crop_prices_v2.csv:

    cd backend/ai_models/data/raw/
    python generate_64_district_data.py

It will:
  1. Read your existing crop_prices_v2.csv (for the 5 districts
     you already have, e.g. Bogura, Rajshahi, Cumilla, Dhaka,
     Chattogram) to learn each crop's baseline price/quantity
     pattern.
  2. Generate new rows for the remaining ~59 districts, for
     whichever crops are realistic for that district, with
     small random district-level variation.
  3. Write out a NEW file: crop_prices_v2_64districts.csv
     (it does NOT overwrite your original file, so you can
     review before replacing it).

After running, back up your original file, then replace it:
    backend/ai_models/data/raw/crop_prices_v2.csv
with the new 64-district file.
============================================================
"""

import pandas as pd
import numpy as np
import os

# ── CONFIG ───────────────────────────────────────────────────
INPUT_CSV = "crop_prices_v2.csv"                  # your existing file
# new file (safe, doesn't overwrite)
OUTPUT_CSV = "crop_prices_v2_64districts.csv"
RANDOM_SEED = 42

np.random.seed(RANDOM_SEED)

# ── ALL 64 DISTRICTS with approximate centroid coordinates ────
DISTRICTS_64 = {
    "Bagerhat": (22.6602, 89.7895), "Bandarban": (22.1953, 92.2184),
    "Barguna": (22.0953, 90.1121), "Barishal": (22.7010, 90.3535),
    "Bhola": (22.6859, 90.6482), "Bogura": (24.8465, 89.3773),
    "Brahmanbaria": (23.9571, 91.1115), "Chandpur": (23.2333, 90.6712),
    "Chapai Nawabganj": (24.5965, 88.2776), "Chattogram": (22.3569, 91.7832),
    "Chuadanga": (23.6402, 88.8410),
    "Cox's Bazar": (21.4272, 92.0058), "Dhaka": (23.8103, 90.4125),
    "Dinajpur": (25.6279, 88.6332), "Faridpur": (23.6070, 89.8429),
    "Feni": (23.0159, 91.3976), "Gaibandha": (25.3288, 89.5286),
    "Gazipur": (23.9999, 90.4203), "Gopalganj": (23.0050, 89.8266),
    "Habiganj": (24.3745, 91.4155), "Jamalpur": (24.9375, 89.9372),
    "Jashore": (23.1664, 89.2081), "Jhalokathi": (22.6406, 90.1987),
    "Jhenaidah": (23.5448, 89.1539), "Joypurhat": (25.0968, 89.0227),
    "Khagrachhari": (23.1193, 91.9847), "Khulna": (22.8456, 89.5403),
    "Kishoreganj": (24.4449, 90.7766), "Kurigram": (25.8054, 89.6361),
    "Kushtia": (23.9013, 89.1206), "Lakshmipur": (22.9447, 90.8282),
    "Lalmonirhat": (25.9923, 89.2847), "Madaripur": (23.1641, 90.1897),
    "Magura": (23.4855, 89.4197), "Manikganj": (23.8644, 90.0047),
    "Meherpur": (23.7622, 88.6318), "Moulvibazar": (24.4829, 91.7774),
    "Munshiganj": (23.5422, 90.5305), "Mymensingh": (24.7471, 90.4203),
    "Naogaon": (24.8062, 88.9318), "Narail": (23.1725, 89.5126),
    "Narayanganj": (23.6238, 90.5000), "Narsingdi": (23.9322, 90.7150),
    "Natore": (24.4206, 88.9956), "Netrokona": (24.8824, 90.7280),
    "Nilphamari": (25.9317, 88.8560), "Noakhali": (22.8696, 91.0995),
    "Pabna": (24.0064, 89.2372), "Panchagarh": (26.3411, 88.5541),
    "Patuakhali": (22.3596, 90.3296), "Pirojpur": (22.5841, 89.9720),
    "Rajbari": (23.7574, 89.6444), "Rajshahi": (24.3745, 88.6042),
    "Rangamati": (22.6533, 92.1796), "Rangpur": (25.7460, 89.2502),
    "Satkhira": (22.7185, 89.0705), "Shariatpur": (23.2423, 90.4348),
    "Sherpur": (25.0204, 90.0153), "Sirajganj": (24.4533, 89.7006),
    "Sunamganj": (25.0658, 91.3950), "Sylhet": (24.8949, 91.8687),
    "Tangail": (24.2513, 89.9167), "Thakurgaon": (26.0336, 88.4616),
}

# ── CROP → realistic districts where it's commonly grown ─────
# Based on widely known Bangladeshi agro-zones (Bogura/Rangpur
# belt for potato, Pabna/Rajshahi/Faridpur for onion & garlic,
# Mymensingh/greater Bogura/Comilla for vegetables, etc.)
# This is general agronomic knowledge, NOT official BARC zoning data.
CROP_DISTRICTS = {
    "Tomato": [
        "Bogura", "Rajshahi", "Cumilla", "Dhaka", "Chattogram",
        "Jashore", "Pabna", "Natore", "Tangail", "Mymensingh", "Narsingdi",
        "Jhenaidah", "Kushtia", "Faridpur", "Rangpur", "Dinajpur", "Gazipur",
        "Munshiganj", "Manikganj", "Narayanganj", "Gopalganj", "Madaripur",
        "Rajbari", "Shariatpur"
    ],
    "Onion": [
        "Rajshahi", "Pabna", "Bogura", "Faridpur", "Natore", "Kushtia",
        "Meherpur", "Chuadanga", "Magura", "Rajbari", "Manikganj",
        "Shariatpur", "Madaripur", "Jashore", "Jhenaidah", "Narail",
        "Sirajganj", "Naogaon", "Chapai Nawabganj"
    ],
    "Potato": [
        "Bogura", "Rangpur", "Munshiganj", "Cumilla", "Dinajpur",
        "Joypurhat", "Naogaon", "Rajshahi", "Pabna", "Thakurgaon",
        "Panchagarh", "Nilphamari", "Gaibandha", "Tangail", "Jashore",
        "Feni", "Lakshmipur", "Kurigram", "Lalmonirhat", "Sherpur"
    ],
    "Brinjal": [
        "Bogura", "Cumilla", "Dhaka", "Rajshahi", "Chattogram",
        "Jashore", "Pabna", "Narsingdi", "Tangail", "Faridpur", "Gazipur",
        "Mymensingh", "Noakhali", "Feni", "Khulna", "Bagerhat", "Satkhira",
        "Jhenaidah", "Magura", "Narail", "Kushtia", "Chuadanga", "Meherpur"
    ],
    "Cabbage": [
        "Bogura", "Rajshahi", "Cumilla", "Dhaka", "Jashore",
        "Dinajpur", "Rangpur", "Mymensingh", "Tangail", "Narsingdi",
        "Munshiganj", "Pabna", "Sylhet", "Moulvibazar", "Habiganj",
        "Sunamganj", "Barishal", "Patuakhali", "Bhola", "Pirojpur"
    ],
    "Garlic": [
        "Rajshahi", "Faridpur", "Bogura", "Pabna", "Natore", "Meherpur",
        "Chuadanga", "Magura", "Manikganj", "Rajbari", "Kushtia",
        "Noakhali", "Feni", "Lakshmipur", "Chandpur", "Brahmanbaria"
    ],
    "Rice": [
        # Rice is grown nearly everywhere in Bangladesh
        "Bogura", "Rajshahi", "Cumilla", "Dhaka", "Chattogram",
        "Mymensingh", "Sylhet", "Sunamganj", "Habiganj", "Moulvibazar",
        "Barishal", "Bhola", "Patuakhali", "Pirojpur", "Bagerhat",
        "Khulna", "Satkhira", "Jashore", "Kushtia", "Pabna", "Natore",
        "Sirajganj", "Tangail", "Gazipur", "Narsingdi", "Kishoreganj",
        "Netrokona", "Jamalpur", "Sherpur", "Dinajpur", "Rangpur",
        "Gaibandha", "Kurigram", "Lalmonirhat", "Nilphamari", "Thakurgaon",
        "Panchagarh", "Joypurhat", "Naogaon", "Chapai Nawabganj",
        "Noakhali", "Lakshmipur", "Feni", "Chandpur", "Brahmanbaria",
        "Faridpur", "Gopalganj", "Madaripur", "Shariatpur", "Rajbari",
        "Manikganj", "Munshiganj", "Narayanganj", "Magura", "Jhenaidah",
        "Chuadanga", "Meherpur", "Narail", "Jhalokathi", "Barguna",
        "Cox's Bazar", "Bandarban", "Rangamati", "Khagrachhari",
    ],
    "Ginger": [
        "Rajshahi", "Rangpur", "Sylhet", "Moulvibazar", "Habiganj",
        "Bandarban", "Khagrachhari", "Rangamati", "Mymensingh", "Sherpur",
        "Tangail", "Nilphamari", "Thakurgaon", "Panchagarh", "Nilphamari"
    ],
    "Carrot": [
        "Bogura", "Rajshahi", "Jashore", "Cumilla", "Dhaka",
        "Pabna", "Narsingdi", "Mymensingh", "Tangail", "Munshiganj",
        "Faridpur", "Natore", "Gazipur", "Manikganj", "Narayanganj"
    ],
    "Cauliflower": [
        "Bogura", "Rajshahi", "Cumilla", "Dhaka", "Jashore", "Dinajpur",
        "Rangpur", "Mymensingh", "Tangail", "Narsingdi", "Munshiganj",
        "Pabna", "Jhenaidah", "Chuadanga", "Meherpur", "Kushtia"
    ],
    "Maize": [
        "Dinajpur", "Chuadanga", "Rangpur", "Manikganj", "Thakurgaon",
        "Panchagarh", "Lalmonirhat", "Kurigram", "Gaibandha", "Nilphamari",
        "Bogura", "Rajshahi", "Pabna", "Kushtia", "Natore", "Naogaon"
    ],
    "Jute": [
        "Faridpur", "Madaripur", "Sirajganj", "Mymensingh", "Rajbari",
        "Gopalganj", "Shariatpur", "Magura", "Jhenaidah", "Kushtia",
        "Pabna", "Jamalpur", "Sherpur", "Tangail", "Manikganj", "Dhaka"
    ],
    "Chili": [
        "Bogura", "Patuakhali", "Bhola", "Jamalpur", "Noakhali", "Feni",
        "Lakshmipur", "Chandpur", "Barishal", "Barguna", "Pirojpur",
        "Jhalokathi", "Sirajganj", "Pabna", "Chattogram", "Cox's Bazar"
    ],
    "Watermelon": [
        "Patuakhali", "Bhola", "Barguna", "Khulna", "Barishal", "Pirojpur",
        "Jhalokathi", "Satkhira", "Bagerhat", "Noakhali", "Feni",
        "Lakshmipur", "Chattogram", "Cox's Bazar", "Brahmanbaria"
    ],
    "Mustard": [
        "Tangail", "Sirajganj", "Manikganj", "Pabna", "Dhaka", "Gazipur",
        "Narsingdi", "Narayanganj", "Munshiganj", "Faridpur", "Rajbari",
        "Madaripur", "Shariatpur", "Gopalganj", "Natore", "Naogaon"
    ],
    "Wheat": [
        "Dinajpur", "Thakurgaon", "Panchagarh", "Rajshahi", "Pabna",
        "Naogaon", "Natore", "Chapai Nawabganj", "Kushtia", "Chuadanga",
        "Meherpur", "Faridpur", "Rajbari", "Sirajganj", "Bogura"
    ],
    "Cucumber": [
        "Barishal", "Pirojpur", "Jhalokathi", "Barguna", "Patuakhali",
        "Bhola", "Khulna", "Bagerhat", "Satkhira", "Jashore", "Dhaka",
        "Gazipur", "Narsingdi", "Narayanganj", "Cumilla", "Bogura"
    ]
}

# ── District soil-type assignment (broad approximation) ───────
SANDY_LOAM_DISTRICTS = {
    "Rajshahi", "Pabna", "Natore", "Bogura", "Joypurhat", "Naogaon",
    "Chapai Nawabganj", "Dinajpur", "Thakurgaon", "Panchagarh", "Rangpur",
}
CLAY_LOAM_DISTRICTS = {
    "Cumilla", "Chattogram", "Noakhali", "Feni", "Lakshmipur",
    "Chandpur", "Brahmanbaria", "Sylhet", "Sunamganj", "Habiganj",
    "Moulvibazar", "Barishal", "Bhola", "Patuakhali", "Pirojpur",
    "Jhalokathi", "Barguna", "Khulna", "Bagerhat", "Satkhira",
}
CLAY_DISTRICTS = {
    "Mymensingh", "Netrokona", "Kishoreganj", "Sherpur", "Jamalpur",
    "Gaibandha", "Kurigram", "Lalmonirhat", "Nilphamari",
}


def get_soil_type(district):
    if district in SANDY_LOAM_DISTRICTS:
        return "Sandy Loam"
    if district in CLAY_LOAM_DISTRICTS:
        return "Clay Loam"
    if district in CLAY_DISTRICTS:
        return "Clay"
    return "Loam"


WEATHER_OPTIONS = ["Sunny", "Cloudy", "Foggy", "Rainy", "Windy"]
WEATHER_WEIGHTS = [0.35, 0.25, 0.15, 0.15, 0.10]
SEASON_BY_MONTH = {
    1: "Winter", 2: "Winter", 3: "Summer", 4: "Summer", 5: "Summer",
    6: "Monsoon", 7: "Monsoon", 8: "Monsoon", 9: "Monsoon",
    10: "Autumn", 11: "Winter", 12: "Winter",
}


def learn_baseline_stats(df: pd.DataFrame) -> dict:
    """
    For each crop, learn avg-price level/volatility, quantity level,
    and min/max spread — from whatever districts already exist in
    the source CSV — so generated data follows the same patterns.
    """
    stats = {}
    for crop, g in df.groupby("crop_name"):
        g = g.sort_values("date")
        avg_price_mean = g["avg_price"].mean()
        avg_price_std = g["avg_price"].std()
        if not avg_price_std or np.isnan(avg_price_std):
            avg_price_std = avg_price_mean * 0.05

        qty_mean = g["quantity_available"].mean()
        qty_std = g["quantity_available"].std()
        if not qty_std or np.isnan(qty_std):
            qty_std = qty_mean * 0.1

        spread_pct = ((g["max_price"] - g["min_price"]) /
                      g["avg_price"]).mean()
        if np.isnan(spread_pct):
            spread_pct = 0.25

        stats[crop] = {
            "avg_price_mean": avg_price_mean,
            "avg_price_std":  avg_price_std,
            "qty_mean":       qty_mean,
            "qty_std":        qty_std,
            "spread_pct":     spread_pct,
            "dates":          sorted(g["date"].unique()),
        }
    return stats


def generate_district_series(crop, district, base_stats, district_factor, dates):
    """Generate one (crop, district) time series matching the source CSV's date range."""
    rows = []
    avg_price_mean = base_stats["avg_price_mean"] * district_factor
    avg_price_std = base_stats["avg_price_std"] * district_factor
    qty_mean = base_stats["qty_mean"] * np.random.uniform(0.7, 1.3)
    qty_std = base_stats["qty_std"] * np.random.uniform(0.7, 1.3)
    spread_pct = base_stats["spread_pct"]

    n = len(dates)
    if n == 0:
        return rows

    # Smooth random walk for price so it looks like a real time series,
    # not pure noise — small daily drift + seasonal wave, re-centered.
    drift = np.random.normal(0, avg_price_std * 0.15, n).cumsum()
    drift -= drift.mean()

    for i, d in enumerate(dates):
        date = pd.to_datetime(d)
        month = date.month
        seasonal_wave = np.sin(2 * np.pi * month / 12) * avg_price_std * 0.4

        price = max(1.0, avg_price_mean +
                    drift[i] + seasonal_wave + np.random.normal(0, avg_price_std * 0.3))
        half_spread = price * spread_pct / 2
        min_p = round(max(0.5, price - half_spread), 2)
        max_p = round(price + half_spread, 2)
        avg_p = round((min_p + max_p) / 2, 2)

        qty = max(10, int(qty_mean + np.random.normal(0, qty_std * 0.4)))

        rows.append({
            "date": date.strftime("%Y-%m-%d"),
            "crop_name": crop,
            "district": district,
            "market_name": f"{district} Main Bazar",
            "min_price": min_p,
            "max_price": max_p,
            "avg_price": avg_p,
            "unit": "kg",
            "quantity_available": qty,
            "weather_condition": np.random.choice(WEATHER_OPTIONS, p=WEATHER_WEIGHTS),
            "season": SEASON_BY_MONTH.get(month, "Summer"),
        })
    return rows


def main():
    if not os.path.exists(INPUT_CSV):
        print(f"ERROR: '{INPUT_CSV}' not found in the current folder.")
        print("Run this script from: backend/ai_models/data/raw/")
        return

    print(f"Reading {INPUT_CSV} ...")
    df = pd.read_csv(INPUT_CSV)
    df["date"] = pd.to_datetime(df["date"])

    # Normalize known spelling variants so they're treated as one district.
    # (Your source data has both "Comilla" and "Cumilla" for the same place —
    # we standardize on "Cumilla" everywhere.)
    DISTRICT_ALIASES = {"Comilla": "Cumilla"}
    df["district"] = df["district"].replace(DISTRICT_ALIASES)

    existing_districts = set(df["district"].unique())
    print(
        f"Existing districts in file ({len(existing_districts)}): {sorted(existing_districts)}")

    baseline = learn_baseline_stats(df)
    print(f"Learned baselines for crops: {list(baseline.keys())}")

    new_rows = []
    all_districts = set(DISTRICTS_64.keys())
    missing_districts = all_districts - existing_districts
    print(f"Generating data for {len(missing_districts)} new districts...")

    for crop, target_districts in CROP_DISTRICTS.items():
        if crop not in baseline:
            print(
                f"  Skipping '{crop}' — no baseline data found in source CSV.")
            continue
        dates = baseline[crop]["dates"]

        for district in target_districts:
            if district not in missing_districts:
                continue  # already have real data for this district
            # Random but stable per-district price factor — some districts
            # naturally run a bit higher/lower (distance from production
            # zones, transport cost, local demand, etc.)
            district_factor = np.random.uniform(0.85, 1.20)
            rows = generate_district_series(
                crop, district, baseline[crop], district_factor, dates)
            new_rows.extend(rows)

    new_df = pd.DataFrame(new_rows)
    combined = pd.concat([df, new_df], ignore_index=True)
    combined["date"] = pd.to_datetime(combined["date"]).dt.strftime("%Y-%m-%d")
    combined = combined.sort_values(
        ["crop_name", "district", "date"]).reset_index(drop=True)

    combined.to_csv(OUTPUT_CSV, index=False)

    print(
        f"\nDone. Wrote {len(combined):,} total rows ({len(new_rows):,} newly generated) to '{OUTPUT_CSV}'.")
    print(f"Districts now covered: {combined['district'].nunique()} / 64")
    print("\nNext step: review the file, then REPLACE your original:")
    print(f"  1. Rename current crop_prices_v2.csv -> crop_prices_v2_backup.csv (keep a backup!)")
    print(f"  2. Rename {OUTPUT_CSV} -> crop_prices_v2.csv")


if __name__ == "__main__":
    main()
