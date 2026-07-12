# ============================================================
#   AgroMitra — AI Price Prediction Model
#   Prophet + XGBoost Hybrid Ensemble
#   Uttara University | CSE Department
# ============================================================
#
#   HOW TO RUN:
#   1. VS Code terminal খুলো
#   2. pip install prophet xgboost scikit-learn pandas numpy matplotlib seaborn
#   3. data/ ফোল্ডারে তোমার CSV file রাখো
#   4. python price_prediction.py
#
# ============================================================

import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
import seaborn as sns
import warnings
import os
import pickle
from datetime import datetime, timedelta

from prophet import Prophet
from xgboost import XGBRegressor
from sklearn.preprocessing import LabelEncoder
from sklearn.model_selection import TimeSeriesSplit
from sklearn.metrics import mean_absolute_percentage_error, mean_squared_error


warnings.filterwarnings('ignore')

# ── Plot style ───────────────────────────────────────────────
plt.style.use('seaborn-v0_8-whitegrid')
COLORS = {
    'green':  '#2E7D32',
    'blue':   '#1565C0',
    'orange': '#E65100',
    'red':    '#B71C1C',
    'gold':   '#F9A825',
    'gray':   '#546E7A',
}

# ============================================================
# STEP 1: LOAD & CLEAN DATA
# ============================================================


def load_data(file_path):
    """
    CSV file load করে clean করে return করে।
    """
    print("\n" + "="*60)
    print("  STEP 1: Data Loading & Cleaning")
    print("="*60)
    df = pd.read_csv(
        r"E:\Personal\UU INFO\UU_Project\Final_Project\AgroMitra\backend\ai_models\data\raw\crop_prices_v2_64districts.csv")
    print(f"  ✅ Data loaded: {len(df)} rows, {len(df.columns)} columns")
    print(f"  📋 Columns: {list(df.columns)}")

    # Date column datetime format-এ convert করো
    df['date'] = pd.to_datetime(df['date'])

    # Sort by date
    df = df.sort_values('date').reset_index(drop=True)

    # Missing values check করো
    missing = df.isnull().sum()
    if missing.any():
        print(f"\n  ⚠️  Missing values found:")
        print(missing[missing > 0])
        # avg_price missing হলে min+max average দিয়ে fill করো
        if 'avg_price' in df.columns:
            df['avg_price'] = df['avg_price'].fillna(
                (df['min_price'] + df['max_price']) / 2
            )
        df = df.ffill()
        print("  ✅ Missing values filled.")
    else:
        print("  ✅ No missing values found.")

    # Price outlier remove করো (IQR method)
    before = len(df)
    clean_dfs = []

    for crop, group in df.groupby('crop_name'):
        Q1 = group['avg_price'].quantile(0.05)  # কন্ডিশন একটু লুজ করা হলো
        Q3 = group['avg_price'].quantile(0.95)
        IQR = Q3 - Q1
        lower = Q1 - 3.0 * IQR  # ৩ গুণ পর্যন্ত বাফার দেওয়া হলো
        upper = Q3 + 3.0 * IQR

        filtered_group = group[(group['avg_price'] >= lower) & (
            group['avg_price'] <= upper)]
        clean_dfs.append(filtered_group)

    df = pd.concat(clean_dfs, ignore_index=True).sort_values(
        'date').reset_index(drop=True)

    print(f"  🧹 Removed {before - len(df)} extreme outlier rows globally.")
    removed = before - len(df)
    if removed > 0:
        print(f"  🧹 Removed {removed} outlier rows.")

    print(
        f"  📅 Date range: {df['date'].min().date()} → {df['date'].max().date()}")
    print(f"  📦 Crops found: {df['crop_name'].unique()}")
    print(f"  📍 Districts: {df['district'].unique()}")
    print(f"  ✅ Data ready: {len(df)} clean rows\n")

    return df


# ============================================================
# STEP 2: FEATURE ENGINEERING
# ============================================================

def add_features(df):
    """
    ML model-এর জন্য extra features তৈরি করো।
    """
    print("="*60)
    print("  STEP 2: Feature Engineering")
    print("="*60)

    df = df.copy()

    # Time-based features
    df['year'] = df['date'].dt.year
    df['month'] = df['date'].dt.month
    df['day'] = df['date'].dt.day
    df['day_of_week'] = df['date'].dt.dayofweek      # 0=Monday
    df['day_of_year'] = df['date'].dt.dayofyear
    df['week_of_year'] = df['date'].dt.isocalendar().week.astype(int)
    df['quarter'] = df['date'].dt.quarter

    # Season feature (Bangladesh অনুযায়ী)
    def get_season(month):
        if month in [11, 12, 1, 2]:
            return 'Winter'    # শীত
        elif month in [3, 4, 5]:
            return 'Summer'    # গ্রীষ্ম
        elif month in [6, 7, 8, 9]:
            return 'Monsoon'   # বর্ষা
        else:
            return 'Autumn'    # শরৎ
    df['season_calc'] = df['month'].apply(get_season)

    # Bangladesh festival/holiday features
    def is_eid_season(month):
        return 1 if month in [3, 4, 5] else 0  # approximate

    def is_harvest_season(month):
        return 1 if month in [11, 12, 1] else 0

    df['is_eid_season'] = df['month'].apply(is_eid_season)
    df['is_harvest_season'] = df['month'].apply(is_harvest_season)
    df['is_winter'] = (df['month'].isin([11, 12, 1, 2])).astype(int)
    df['is_monsoon'] = (df['month'].isin([6, 7, 8, 9])).astype(int)

    # Lag features (previous prices)
    df = df.sort_values(['crop_name', 'district', 'date'])
    group = df.groupby(['crop_name', 'district'])

    df['price_lag_1'] = group['avg_price'].shift(1)   # ১ দিন আগের দাম
    df['price_lag_7'] = group['avg_price'].shift(7)   # ৭ দিন আগের দাম
    df['price_lag_14'] = group['avg_price'].shift(14)  # ১৪ দিন আগের দাম
    df['price_lag_30'] = group['avg_price'].shift(30)  # ৩০ দিন আগের দাম

    # Rolling average features
    df['rolling_mean_7'] = group['avg_price'].transform(
        lambda x: x.rolling(7,  min_periods=1).mean())
    df['rolling_mean_14'] = group['avg_price'].transform(
        lambda x: x.rolling(14, min_periods=1).mean())
    df['rolling_mean_30'] = group['avg_price'].transform(
        lambda x: x.rolling(30, min_periods=1).mean())
    df['rolling_std_7'] = group['avg_price'].transform(
        lambda x: x.rolling(7,  min_periods=1).std().fillna(0))

    # Price change features
    df['price_change_1d'] = group['avg_price'].pct_change(1).fillna(0)
    df['price_change_7d'] = group['avg_price'].pct_change(7).fillna(0)

    # Categorical encoding
    le_crop = LabelEncoder()
    le_district = LabelEncoder()
    le_season = LabelEncoder()
    le_weather = LabelEncoder()

    df['crop_encoded'] = le_crop.fit_transform(df['crop_name'])
    df['district_encoded'] = le_district.fit_transform(df['district'])
    df['season_encoded'] = le_season.fit_transform(df['season_calc'])

    if 'weather_condition' in df.columns:
        df['weather_encoded'] = le_weather.fit_transform(
            df['weather_condition'].fillna('Unknown'))
    else:
        df['weather_encoded'] = 0

    # Remove NaN from lag features
    df = df.dropna(subset=['price_lag_7']).reset_index(drop=True)

    encoders = {
        'crop': le_crop,
        'district': le_district,
        'season': le_season,
        'weather': le_weather
    }

    print(f"  ✅ Features added: {len(df.columns)} total columns")
    print(f"  ✅ Clean rows after feature engineering: {len(df)}\n")

    return df, encoders


# ============================================================
# STEP 3: PROPHET MODEL
# ============================================================

def train_prophet(df, crop_name, district):
    """
    Facebook Prophet model train করো।
    Time-series forecasting এর জন্য।
    """
    print(f"\n  🔮 Training Prophet Model: {crop_name} | {district}")

    # Prophet-এর জন্য ds (date) আর y (value) column লাগে
    prophet_df = df[
        (df['crop_name'] == crop_name) &
        (df['district'] == district)
    ][['date', 'avg_price']].rename(columns={'date': 'ds', 'avg_price': 'y'})

    if len(prophet_df) < 30:
        print(
            f"  ⚠️  Not enough data ({len(prophet_df)} rows). Need at least 30.")
        return None, None

    # Train/test split (last 30 days = test)
    split_date = prophet_df['ds'].max() - timedelta(days=30)
    train_prophet = prophet_df[prophet_df['ds'] <= split_date]
    test_prophet = prophet_df[prophet_df['ds'] > split_date]

    # Prophet model configure করো
    model = Prophet(
        changepoint_prior_scale=0.05,    # trend পরিবর্তনের sensitivity
        seasonality_prior_scale=10,      # seasonality strength
        yearly_seasonality='auto',    # বার্ষিক pattern
        weekly_seasonality='auto',    # সাপ্তাহিক pattern
        daily_seasonality='auto',
        interval_width=0.95,    # 95% confidence interval
    )

    # Bangladesh-specific seasonalities add করো
    model.add_seasonality(name='monthly',  period=30.5,  fourier_order=5)
    model.add_seasonality(name='quarterly', period=91.25, fourier_order=3)

    # Model train করো
    model.fit(train_prophet)

    # 30 দিনের forecast বানাও
    future = model.make_future_dataframe(periods=30, freq='D')
    forecast = model.predict(future)

    # Accuracy calculate করো
    if len(test_prophet) > 0:
        merged = test_prophet.merge(
            forecast[['ds', 'yhat', 'yhat_lower', 'yhat_upper']],
            on='ds', how='inner'
        )
        if len(merged) > 0:
            mape = mean_absolute_percentage_error(
                merged['y'], merged['yhat']) * 100
            rmse = np.sqrt(mean_squared_error(merged['y'], merged['yhat']))
            print(f"  📊 Prophet MAPE: {mape:.2f}%")
            print(f"  📊 Prophet RMSE: ৳{rmse:.2f}/kg")

    return model, forecast


# ============================================================
# STEP 4: XGBOOST MODEL
# ============================================================

def train_xgboost(df, crop_name, district):
    """
    XGBoost model train করো।
    Multiple features ব্যবহার করে prediction করে।
    """
    print(f"\n  🤖 Training XGBoost Model: {crop_name} | {district}")

    # Filter engineered data for the requested crop and district
    filtered = df[
        (df['crop_name'] == crop_name) &
        (df['district'] == district)
    ].copy()

    if len(filtered) < 30:
        print(f"  ⚠️  Not enough data ({len(filtered)} rows).")
        return None, None, None

    # Feature columns
    feature_cols = [
        'year', 'month', 'day', 'day_of_week', 'day_of_year',
        'week_of_year', 'quarter',
        'is_eid_season', 'is_harvest_season', 'is_winter', 'is_monsoon',
        'price_lag_1', 'price_lag_7', 'price_lag_14', 'price_lag_30',
        'rolling_mean_7', 'rolling_mean_14', 'rolling_mean_30',
        'rolling_std_7', 'price_change_1d', 'price_change_7d',
        'season_encoded', 'weather_encoded'
    ]

    # শুধু available columns নাও
    feature_cols = [c for c in feature_cols if c in filtered.columns]

    X = filtered[feature_cols]
    y = filtered['avg_price']

    # Train/test split (last 30 days = test)
    split_idx = len(filtered) - 30
    X_train, X_test = X.iloc[:split_idx], X.iloc[split_idx:]
    y_train, y_test = y.iloc[:split_idx], y.iloc[split_idx:]

    # XGBoost model configure করো
    model = XGBRegressor(
        n_estimators=500,
        max_depth=6,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        min_child_weight=3,
        reg_alpha=0.1,
        reg_lambda=1.0,
        random_state=42,
        early_stopping_rounds=50,
        eval_metric='rmse',
        verbosity=0,
    )

    # Model train করো
    model.fit(
        X_train, y_train,
        eval_set=[(X_test, y_test)],
        verbose=False
    )

    # Accuracy calculate করো
    y_pred = model.predict(X_test)
    mape = mean_absolute_percentage_error(y_test, y_pred) * 100
    rmse = np.sqrt(mean_squared_error(y_test, y_pred))
    print(f"  📊 XGBoost MAPE: {mape:.2f}%")
    print(f"  📊 XGBoost RMSE: ৳{rmse:.2f}/kg")

    # Feature importance
    importance = pd.DataFrame({
        'feature': feature_cols,
        'importance': model.feature_importances_
    }).sort_values('importance', ascending=False)

    return model, feature_cols, importance


# ============================================================
# STEP 5: HYBRID ENSEMBLE PREDICTION
# ============================================================

def hybrid_predict(prophet_forecast, xgb_model, future_features,
                   prophet_weight=0.45, xgb_weight=0.55):
    """
    Prophet + XGBoost combine করে final prediction বানাও।
    """
    print(f"\n  🔗 Creating Hybrid Ensemble Prediction...")
    print(f"     Prophet weight: {prophet_weight*100:.0f}%")
    print(f"     XGBoost weight: {xgb_weight*100:.0f}%")

    # Prophet predictions
    prophet_preds = prophet_forecast[[
        'ds', 'yhat', 'yhat_lower', 'yhat_upper']].copy()
    prophet_preds.columns = ['date', 'prophet_pred', 'lower_ci', 'upper_ci']

    # XGBoost predictions
    if xgb_model is not None and future_features is not None:
        xgb_preds = xgb_model.predict(future_features)
    else:
        xgb_preds = prophet_preds['prophet_pred'].values

    # Ensure same length
    min_len = min(len(prophet_preds), len(xgb_preds))
    prophet_preds = prophet_preds.iloc[:min_len]
    xgb_preds = xgb_preds[:min_len]

    # Weighted ensemble
    prophet_preds['xgb_pred'] = xgb_preds
    prophet_preds['hybrid_pred'] = (
        prophet_weight * prophet_preds['prophet_pred'] +
        xgb_weight * xgb_preds
    ).clip(lower=0)  # দাম negative হতে পারে না

    print(f"  ✅ Hybrid predictions ready: {len(prophet_preds)} days\n")
    return prophet_preds


# ============================================================
# STEP 6: VISUALIZATION
# ============================================================

def plot_results(df, crop_name, district, hybrid_df, importance_df=None):
    """
    সুন্দর charts তৈরি করো।
    """
    print("="*60)
    print("  STEP 6: Generating Visualizations")
    print("="*60)

    # Filter actual data
    actual = df[
        (df['crop_name'] == crop_name) &
        (df['district'] == district)
    ][['date', 'avg_price', 'min_price', 'max_price']].copy()

    fig, axes = plt.subplots(2, 2, figsize=(18, 12))
    fig.suptitle(
        f'AgroMitra — Price Prediction: {crop_name} | {district}',
        fontsize=16, fontweight='bold', color=COLORS['green'], y=1.02
    )

    # ── Plot 1: Historical Prices ─────────────────────────────
    ax1 = axes[0, 0]
    ax1.plot(actual['date'], actual['avg_price'],
             color=COLORS['green'], linewidth=2, label='Actual Avg Price')
    ax1.fill_between(actual['date'], actual['min_price'], actual['max_price'],
                     alpha=0.2, color=COLORS['green'], label='Min-Max Range')
    ax1.set_title('Historical Price Data', fontweight='bold', fontsize=12)
    ax1.set_xlabel('Date')
    ax1.set_ylabel('Price (৳/kg)')
    ax1.legend()
    ax1.xaxis.set_major_formatter(mdates.DateFormatter('%b %Y'))
    ax1.xaxis.set_major_locator(mdates.MonthLocator())
    plt.setp(ax1.xaxis.get_majorticklabels(), rotation=45)

    # ── Plot 2: Forecast ──────────────────────────────────────
    ax2 = axes[0, 1]
    # Historical actual
    ax2.plot(actual['date'], actual['avg_price'],
             color=COLORS['gray'], linewidth=1.5, alpha=0.7, label='Historical')

    # Future forecast only (last 30 days)
    future_mask = hybrid_df['date'] > actual['date'].max()
    future = hybrid_df[future_mask]
    historical_hybrid = hybrid_df[~future_mask]

    ax2.plot(historical_hybrid['date'], historical_hybrid['hybrid_pred'],
             color=COLORS['blue'], linewidth=2, linestyle='--', label='Model Fit')
    ax2.plot(future['date'], future['hybrid_pred'],
             color=COLORS['orange'], linewidth=2.5, label='7-Day Forecast')
    ax2.fill_between(future['date'], future['lower_ci'], future['upper_ci'],
                     alpha=0.2, color=COLORS['orange'], label='95% Confidence')

    ax2.axvline(x=actual['date'].max(), color=COLORS['red'],
                linestyle=':', linewidth=2, label='Forecast Start')
    ax2.set_title('Price Forecast (Next 30 Days)',
                  fontweight='bold', fontsize=12)
    ax2.set_xlabel('Date')
    ax2.set_ylabel('Price (৳/kg)')
    ax2.legend(fontsize=9)
    ax2.xaxis.set_major_formatter(mdates.DateFormatter('%b %d'))
    plt.setp(ax2.xaxis.get_majorticklabels(), rotation=45)

    # ── Plot 3: Monthly Average ───────────────────────────────
    ax3 = axes[1, 0]
    monthly = actual.copy()
    monthly['month_year'] = monthly['date'].dt.to_period('M')
    monthly_avg = monthly.groupby('month_year')[
        'avg_price'].mean().reset_index()
    monthly_avg['month_str'] = monthly_avg['month_year'].astype(str)

    bars = ax3.bar(range(len(monthly_avg)), monthly_avg['avg_price'],
                   color=[COLORS['green'] if v <= monthly_avg['avg_price'].median()
                          else COLORS['orange'] for v in monthly_avg['avg_price']],
                   edgecolor='white', linewidth=0.5)
    ax3.set_xticks(range(len(monthly_avg)))
    ax3.set_xticklabels(monthly_avg['month_str'],
                        rotation=45, ha='right', fontsize=8)
    ax3.set_title('Monthly Average Price Trend',
                  fontweight='bold', fontsize=12)
    ax3.set_xlabel('Month')
    ax3.set_ylabel('Avg Price (৳/kg)')
    ax3.axhline(y=monthly_avg['avg_price'].mean(),
                color=COLORS['red'], linestyle='--', label=f"Mean: ৳{monthly_avg['avg_price'].mean():.1f}")
    ax3.legend()

    # ── Plot 4: Feature Importance ────────────────────────────
    ax4 = axes[1, 1]
    if importance_df is not None and len(importance_df) > 0:
        top_features = importance_df.head(12)
        colors_imp = [COLORS['green'] if i < 3 else COLORS['blue'] if i < 7
                      else COLORS['gray'] for i in range(len(top_features))]
        ax4.barh(range(len(top_features)), top_features['importance'],
                 color=colors_imp, edgecolor='white')
        ax4.set_yticks(range(len(top_features)))
        ax4.set_yticklabels(top_features['feature'], fontsize=9)
        ax4.set_title('XGBoost Feature Importance (Top 12)',
                      fontweight='bold', fontsize=12)
        ax4.set_xlabel('Importance Score')
        ax4.invert_yaxis()
    else:
        # Model comparison bar chart
        models = ['Prophet', 'XGBoost', 'Hybrid Ensemble']
        mape_scores = [15, 13, 10]  # example values
        ax4.bar(models, mape_scores,
                color=[COLORS['blue'], COLORS['orange'], COLORS['green']],
                edgecolor='white', linewidth=0.5)
        ax4.set_title('Model MAPE Comparison (Lower = Better)',
                      fontweight='bold', fontsize=12)
        ax4.set_ylabel('MAPE (%)')
        for i, v in enumerate(mape_scores):
            ax4.text(i, v + 0.2, f'{v}%', ha='center', fontweight='bold')

    plt.tight_layout()

    # Save chart
    os.makedirs('output', exist_ok=True)
    save_path = f'output/{crop_name}_{district}_prediction.png'
    plt.savefig(save_path, dpi=150, bbox_inches='tight',
                facecolor='white', edgecolor='none')
    print(f"  ✅ Chart saved: {save_path}")
    plt.show()


# ============================================================
# STEP 7: PRINT FORECAST REPORT
# ============================================================

def print_forecast_report(hybrid_df, crop_name, district):
    """
    7-day এবং 30-day forecast report print করো।
    """
    print("\n" + "="*60)
    print(f"  📊 PRICE FORECAST REPORT")
    print(f"  Crop: {crop_name} | District: {district}")
    print("="*60)

    # Future only
    today = hybrid_df['date'].max() - timedelta(days=30)
    future = hybrid_df[hybrid_df['date'] > today].head(30)

    if len(future) == 0:
        print("  ⚠️  No future predictions available.")
        return

    print(f"\n  📅 7-Day Forecast:")
    print(f"  {'Date':<15} {'Predicted Price':<20} {'Range':<25} {'Trend'}")
    print(f"  {'-'*70}")

    prev_price = None
    for _, row in future.head(7).iterrows():
        trend = ""
        if prev_price is not None:
            diff = row['hybrid_pred'] - prev_price
            trend = f"↑ +৳{diff:.1f}" if diff > 0 else f"↓ ৳{diff:.1f}"
        print(
            f"  {str(row['date'].date()):<15} "
            f"৳{row['hybrid_pred']:.2f}/kg{'':<10} "
            f"৳{row['lower_ci']:.1f} – ৳{row['upper_ci']:.1f}{'':<5} "
            f"{trend}"
        )
        prev_price = row['hybrid_pred']

    # Summary stats
    avg_7d = future.head(7)['hybrid_pred'].mean()
    avg_30d = future['hybrid_pred'].mean()
    min_30d = future['hybrid_pred'].min()
    max_30d = future['hybrid_pred'].max()

    print(f"\n  📈 Summary:")
    print(f"     7-Day Average Price  : ৳{avg_7d:.2f}/kg")
    print(f"     30-Day Average Price : ৳{avg_30d:.2f}/kg")
    print(f"     30-Day Minimum       : ৳{min_30d:.2f}/kg")
    print(f"     30-Day Maximum       : ৳{max_30d:.2f}/kg")
    print(f"     Price Volatility     : ৳{future['hybrid_pred'].std():.2f}")

    # Recommendation
    print(f"\n  💡 AgroMitra Advisory:")
    if avg_7d > avg_30d:
        print(f"     ✅ Prices trending UP — Good time to sell in the next 7 days!")
    elif avg_7d < avg_30d * 0.95:
        print(f"     ⚠️  Prices trending DOWN — Consider waiting or storing produce.")
    else:
        print(f"     📊 Prices are STABLE — Normal selling conditions.")
    print("="*60)


# ============================================================
# STEP 8: SAVE MODEL
# ============================================================

def save_model(prophet_model, xgb_model, encoders, crop_name, district):
    """
    Trained model save করো যাতে পরে আবার use করা যায়।
    """
    os.makedirs('models', exist_ok=True)
    safe_name = f"{crop_name}_{district}".replace(" ", "_")

    # XGBoost model save
    if xgb_model:
        xgb_path = f'models/xgb_{safe_name}.pkl'
        with open(xgb_path, 'wb') as f:
            pickle.dump(xgb_model, f)
        print(f"  ✅ XGBoost model saved: {xgb_path}")

    # Prophet model save
    if prophet_model:
        prophet_path = f'models/prophet_{safe_name}.pkl'
        with open(prophet_path, 'wb') as f:
            pickle.dump(prophet_model, f)
        print(f"  ✅ Prophet model saved: {prophet_path}")

    # Encoders save
    enc_path = f'models/encoders_{safe_name}.pkl'
    with open(enc_path, 'wb') as f:
        pickle.dump(encoders, f)
    print(f"  ✅ Encoders saved: {enc_path}")


# ============================================================
# MAIN — এখান থেকে সব শুরু হয়
# ============================================================

def main():
    print("\n" + "🌾"*30)
    print("  AgroMitra — AI Price Prediction Model")
    print("  Uttara University | CSE Department")
    print("🌾"*30)

    # ── Config — এখানে তোমার settings দাও ──────────────────
    DATA_FILE = 'data/raw/crop_prices.csv'   # তোমার CSV file path
    CROP_NAME = 'Tomato'                      # কোন crop predict করবে
    DISTRICT = 'Bogura'                      # কোন district

    # ── Check if data file exists ────────────────────────────
    if not os.path.exists(DATA_FILE):
        print(f"\n  ❌ Data file not found: {DATA_FILE}")
        print(f"  📝 Creating sample data for demonstration...")
        create_sample_data(DATA_FILE, CROP_NAME, DISTRICT)

    # ── Step 1: Load Data ────────────────────────────────────
    df = load_data(DATA_FILE)

    # ── Step 2: Feature Engineering ─────────────────────────
    df, encoders = add_features(df)

    # ── Step 3: Train Prophet ────────────────────────────────
    print("\n" + "="*60)
    print("  STEP 3: Prophet Model Training")
    print("="*60)
    prophet_model, prophet_forecast = train_prophet(df, CROP_NAME, DISTRICT)

    # ── Step 4: Train XGBoost ────────────────────────────────
    print("\n" + "="*60)
    print("  STEP 4: XGBoost Model Training")
    print("="*60)
    xgb_model, feature_cols, importance_df = train_xgboost(
        df, CROP_NAME, DISTRICT)

    # ── Step 5: Hybrid Prediction ────────────────────────────
    print("\n" + "="*60)
    print("  STEP 5: Hybrid Ensemble Prediction")
    print("="*60)

    if prophet_forecast is not None:
        # Future features for XGBoost
        future_features = None
        if xgb_model is not None and feature_cols is not None:
            last_row = df[
                (df['crop_name'] == CROP_NAME) &
                (df['district'] == DISTRICT)
            ].iloc[-1]
            future_dates = pd.date_range(
                start=df['date'].max() + timedelta(days=1),
                periods=30, freq='D'
            )
            future_df = pd.DataFrame({'date': future_dates})
            future_df['year'] = future_df['date'].dt.year
            future_df['month'] = future_df['date'].dt.month
            future_df['day'] = future_df['date'].dt.day
            future_df['day_of_week'] = future_df['date'].dt.dayofweek
            future_df['day_of_year'] = future_df['date'].dt.dayofyear
            future_df['week_of_year'] = future_df['date'].dt.isocalendar(
            ).week.astype(int)
            future_df['quarter'] = future_df['date'].dt.quarter
            future_df['is_eid_season'] = future_df['month'].apply(
                lambda m: 1 if m in [3, 4, 5] else 0)
            future_df['is_harvest_season'] = future_df['month'].apply(
                lambda m: 1 if m in [11, 12, 1] else 0)
            future_df['is_winter'] = future_df['month'].isin(
                [11, 12, 1, 2]).astype(int)
            future_df['is_monsoon'] = future_df['month'].isin(
                [6, 7, 8, 9]).astype(int)

            # Fill lag features with last known values
            for col in feature_cols:
                if col not in future_df.columns:
                    future_df[col] = last_row.get(col, 0)

            available = [c for c in feature_cols if c in future_df.columns]
            future_features = future_df[available]

        hybrid_df = hybrid_predict(
            prophet_forecast, xgb_model, future_features)

        # ── Step 6: Visualize ────────────────────────────────
        plot_results(df, CROP_NAME, DISTRICT, hybrid_df, importance_df)

        # ── Step 7: Print Report ─────────────────────────────
        print_forecast_report(hybrid_df, CROP_NAME, DISTRICT)

        # ── Step 8: Save Model ───────────────────────────────
        print("\n" + "="*60)
        print("  STEP 8: Saving Models")
        print("="*60)
        save_model(prophet_model, xgb_model, encoders, CROP_NAME, DISTRICT)

    print("\n" + "🌾"*30)
    print("  ✅ AgroMitra Price Prediction Complete!")
    print("  📁 Check 'output/' folder for charts")
    print("  📁 Check 'models/' folder for saved models")
    print("🌾"*30 + "\n")


# ============================================================
# SAMPLE DATA GENERATOR (যদি real data না থাকে)
# ============================================================

def create_sample_data(file_path, crop_name, district):
    """
    Real data না থাকলে sample data তৈরি করো practice-এর জন্য।
    """
    os.makedirs(os.path.dirname(file_path), exist_ok=True)

    np.random.seed(42)
    dates = pd.date_range(start='2022-01-01', end='2024-12-31', freq='D')
    n = len(dates)

    # Realistic Bangladeshi tomato price simulation
    base_price = 25
    trend = np.linspace(0, 5, n)
    seasonal = 10 * np.sin(2 * np.pi * np.arange(n) / 365)
    weekly = 2 * np.sin(2 * np.pi * np.arange(n) / 7)
    noise = np.random.normal(0, 3, n)
    price = base_price + trend + seasonal + weekly + noise
    price = np.clip(price, 5, 80)

    df = pd.DataFrame({
        'date':               dates,
        'crop_name':          crop_name,
        'district':           district,
        'market_name':        f'{district} Sadar Bazar',
        'min_price':          (price * 0.85).round(2),
        'max_price':          (price * 1.15).round(2),
        'avg_price':          price.round(2),
        'unit':               'kg',
        'quantity_available': np.random.randint(200, 1000, n),
        'weather_condition':  np.random.choice(['Sunny', 'Cloudy', 'Rainy'], n),
        'season':             pd.cut(
            pd.to_datetime(dates).month,
            bins=[0, 2, 5, 9, 12],
            labels=['Winter', 'Summer', 'Monsoon', 'Autumn']
        )
    })

    df.to_csv(file_path, index=False)
    print(f"  ✅ Sample data created: {file_path} ({len(df)} rows)")


# ============================================================
if __name__ == '__main__':
    main()
