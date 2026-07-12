# ============================================================
#   AgroMitra — Demand Forecasting Model (Improved)
#   LSTM Neural Network — Version 2.0
#   Uttara University | CSE Department
# ============================================================
#
#   HOW TO RUN:
#   1. crop_prices_v2.csv → data/raw/ ফোল্ডারে রাখো
#   2. pip install tensorflow scikit-learn pandas numpy matplotlib
#   3. python demand_forecasting_v2.py
#
# ============================================================

import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
import warnings
import os
import pickle
from datetime import datetime, timedelta

import tensorflow as tf
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import LSTM, Dense, Dropout, BatchNormalization
from tensorflow.keras.callbacks import EarlyStopping, ReduceLROnPlateau, ModelCheckpoint
from tensorflow.keras.optimizers import Adam

from sklearn.preprocessing import MinMaxScaler
from sklearn.metrics import mean_absolute_percentage_error, mean_squared_error

warnings.filterwarnings('ignore')
tf.get_logger().setLevel('ERROR')

plt.style.use('seaborn-v0_8-whitegrid')
COLORS = {
    'green':  '#2E7D32',
    'blue':   '#1565C0',
    'orange': '#E65100',
    'red':    '#B71C1C',
    'gold':   '#F9A825',
    'teal':   '#00695C',
    'gray':   '#546E7A',
}

print("\n" + "🌾"*30)
print("  AgroMitra — Demand Forecasting v2.0 (LSTM)")
print("  Uttara University | CSE Department")
print("🌾"*30)

# ============================================================
# CONFIG
# ============================================================
DATA_FILE = r'E:\Personal\UU INFO\UU_Project\Final_Project\AgroMitra\backend\ai_models\data\raw\crop_prices_v2_64districts.csv'
CROP_NAME  = 'Tomato'
DISTRICT   = 'Bogura'
LOOK_BACK  = 60     # 60 দিনের pattern দেখে predict করবে
FORECAST   = 30     # আগামী 30 দিনের forecast
EPOCHS     = 150
BATCH_SIZE = 32

os.makedirs('output', exist_ok=True)
os.makedirs('models', exist_ok=True)


# ============================================================
# STEP 1: LOAD DATA
# ============================================================
print("\n" + "="*60)
print("  STEP 1: Loading Data")
print("="*60)

df = pd.read_csv(DATA_FILE)
df['date'] = pd.to_datetime(df['date'])
df = df.sort_values('date').reset_index(drop=True)

data = df[
    (df['crop_name'] == CROP_NAME) &
    (df['district']  == DISTRICT)
].copy().reset_index(drop=True)

print(f"  ✅ Loaded       : {len(df):,} total rows")
print(f"  ✅ Filtered     : {len(data):,} rows ({CROP_NAME}, {DISTRICT})")
print(f"  📅 Date range   : {data['date'].min().date()} → {data['date'].max().date()}")


# ============================================================
# STEP 2: FEATURE ENGINEERING
# ============================================================
print("\n" + "="*60)
print("  STEP 2: Feature Engineering")
print("="*60)

# Time features
data['day_of_week']  = data['date'].dt.dayofweek
data['day_of_year']  = data['date'].dt.dayofyear
data['month']        = data['date'].dt.month
data['week']         = data['date'].dt.isocalendar().week.astype(int)
data['quarter']      = data['date'].dt.quarter
data['year']         = data['date'].dt.year

# Season dummies
data['is_winter']    = data['month'].isin([11,12,1,2]).astype(float)
data['is_summer']    = data['month'].isin([3,4,5]).astype(float)
data['is_monsoon']   = data['month'].isin([6,7,8,9]).astype(float)
data['is_eid']       = data['month'].isin([4,5]).astype(float)
data['is_harvest']   = data['month'].isin([11,12,1]).astype(float)
data['is_friday']    = (data['day_of_week'] == 4).astype(float)

# Cyclical encoding (sin/cos) — better than raw numbers
data['month_sin']    = np.sin(2 * np.pi * data['month'] / 12)
data['month_cos']    = np.cos(2 * np.pi * data['month'] / 12)
data['dow_sin']      = np.sin(2 * np.pi * data['day_of_week'] / 7)
data['dow_cos']      = np.cos(2 * np.pi * data['day_of_week'] / 7)
data['doy_sin']      = np.sin(2 * np.pi * data['day_of_year'] / 365)
data['doy_cos']      = np.cos(2 * np.pi * data['day_of_year'] / 365)

# Lag features (demand)
for lag in [1, 7, 14, 21, 30]:
    data[f'demand_lag_{lag}'] = data['quantity_available'].shift(lag)

# Rolling statistics
for window in [7, 14, 30]:
    data[f'demand_roll_mean_{window}'] = data['quantity_available'].rolling(window, min_periods=1).mean()
    data[f'demand_roll_std_{window}']  = data['quantity_available'].rolling(window, min_periods=1).std().fillna(0)

# Price features
data['price_roll_7']  = data['avg_price'].rolling(7,  min_periods=1).mean()
data['price_roll_14'] = data['avg_price'].rolling(14, min_periods=1).mean()
data['price_lag_7']   = data['avg_price'].shift(7)

# Remove NaN rows from lag features
data = data.dropna().reset_index(drop=True)

# All feature columns
FEATURE_COLS = [
    'quantity_available',           # TARGET (must be first)
    'avg_price', 'price_roll_7', 'price_roll_14', 'price_lag_7',
    'demand_lag_1', 'demand_lag_7', 'demand_lag_14', 'demand_lag_21', 'demand_lag_30',
    'demand_roll_mean_7', 'demand_roll_mean_14', 'demand_roll_mean_30',
    'demand_roll_std_7',  'demand_roll_std_14',  'demand_roll_std_30',
    'month_sin', 'month_cos', 'dow_sin', 'dow_cos', 'doy_sin', 'doy_cos',
    'is_winter', 'is_summer', 'is_monsoon', 'is_eid', 'is_harvest', 'is_friday',
]

feature_data = data[FEATURE_COLS].values
dates_arr    = data['date'].values

print(f"  ✅ Features created : {len(FEATURE_COLS)}")
print(f"  ✅ Clean rows       : {len(feature_data):,}")


# ============================================================
# STEP 3: SCALE & SPLIT
# ============================================================
print("\n" + "="*60)
print("  STEP 3: Scaling & Splitting Data")
print("="*60)

scaler = MinMaxScaler(feature_range=(0, 1))
scaled = scaler.fit_transform(feature_data)

# Save scaler
scaler_path = f'models/demand_scaler_v2_{CROP_NAME}_{DISTRICT}.pkl'
with open(scaler_path, 'wb') as f:
    pickle.dump(scaler, f)

# Create sequences
def make_sequences(data, look_back):
    X, y = [], []
    for i in range(look_back, len(data)):
        X.append(data[i-look_back:i, :])
        y.append(data[i, 0])           # quantity_available
    return np.array(X), np.array(y)

X, y = make_sequences(scaled, LOOK_BACK)

# 70 / 15 / 15 split
n          = len(X)
train_end  = int(n * 0.70)
val_end    = int(n * 0.85)

X_train, y_train = X[:train_end],        y[:train_end]
X_val,   y_val   = X[train_end:val_end], y[train_end:val_end]
X_test,  y_test  = X[val_end:],          y[val_end:]

print(f"  ✅ Look-back    : {LOOK_BACK} days")
print(f"  ✅ Train        : {len(X_train):,} samples")
print(f"  ✅ Validation   : {len(X_val):,} samples")
print(f"  ✅ Test         : {len(X_test):,} samples")
print(f"  ✅ Input shape  : {X_train.shape}")


# ============================================================
# STEP 4: BUILD LSTM MODEL
# ============================================================
print("\n" + "="*60)
print("  STEP 4: Building LSTM Model")
print("="*60)

n_features = X_train.shape[2]

model = Sequential([
    # Layer 1
    LSTM(256, return_sequences=True, input_shape=(LOOK_BACK, n_features)),
    BatchNormalization(),
    Dropout(0.25),

    # Layer 2
    LSTM(128, return_sequences=True),
    BatchNormalization(),
    Dropout(0.20),

    # Layer 3
    LSTM(64, return_sequences=False),
    BatchNormalization(),
    Dropout(0.15),

    # Dense layers
    Dense(64, activation='relu'),
    Dropout(0.10),
    Dense(32, activation='relu'),
    Dense(1),
])

model.compile(
    optimizer=Adam(learning_rate=0.0005),
    loss='huber',
    metrics=['mae']
)

print("  ✅ Model built successfully!")
print(f"  ✅ Total parameters: {model.count_params():,}")


# ============================================================
# STEP 5: TRAIN MODEL
# ============================================================
print("\n" + "="*60)
print("  STEP 5: Training LSTM Model")
print("="*60)
print(f"  ⏳ Training started... (max {EPOCHS} epochs)\n")

callbacks = [
    EarlyStopping(
        monitor='val_loss',
        patience=20,
        restore_best_weights=True,
        verbose=1
    ),
    ReduceLROnPlateau(
        monitor='val_loss',
        factor=0.4,
        patience=8,
        min_lr=0.00001,
        verbose=1
    ),
    ModelCheckpoint(
        filepath=f'models/lstm_demand_v2_{CROP_NAME}_{DISTRICT}.keras',
        monitor='val_loss',
        save_best_only=True,
        verbose=0
    )
]

history = model.fit(
    X_train, y_train,
    validation_data=(X_val, y_val),
    epochs=EPOCHS,
    batch_size=BATCH_SIZE,
    callbacks=callbacks,
    verbose=1
)

best_epoch = np.argmin(history.history['val_loss']) + 1
print(f"\n  ✅ Training complete!")
print(f"  ✅ Best epoch    : {best_epoch}/{len(history.history['loss'])}")
print(f"  ✅ Best val_loss : {min(history.history['val_loss']):.5f}")


# ============================================================
# STEP 6: EVALUATE
# ============================================================
print("\n" + "="*60)
print("  STEP 6: Model Evaluation")
print("="*60)

y_pred_scaled = model.predict(X_test, verbose=0).flatten()

# Inverse transform
def inv_transform(values, scaler, n_feat):
    dummy = np.zeros((len(values), n_feat))
    dummy[:, 0] = values
    return np.clip(scaler.inverse_transform(dummy)[:, 0], 0, None)

y_test_real = inv_transform(y_test,        scaler, n_features)
y_pred_real = inv_transform(y_pred_scaled, scaler, n_features)

mape = mean_absolute_percentage_error(y_test_real, y_pred_real) * 100
rmse = np.sqrt(mean_squared_error(y_test_real, y_pred_real))
mae  = np.mean(np.abs(y_test_real - y_pred_real))
r2   = 1 - np.sum((y_test_real - y_pred_real)**2) / np.sum((y_test_real - y_test_real.mean())**2)

print(f"\n  📊 Performance Metrics:")
print(f"     MAPE  : {mape:.2f}%  {'✅ Excellent!' if mape<=15 else '⚡ Good' if mape<=25 else '⚠️ Needs improvement'}")
print(f"     RMSE  : {rmse:.1f} kg")
print(f"     MAE   : {mae:.1f} kg")
print(f"     R²    : {r2:.4f}  {'✅' if r2 >= 0.7 else '⚡'}")


# ============================================================
# STEP 7: FUTURE FORECAST
# ============================================================
print("\n" + "="*60)
print("  STEP 7: Generating Future Forecast")
print("="*60)

last_seq = scaled[-LOOK_BACK:].copy()
forecast_vals = []

for step in range(FORECAST):
    inp  = last_seq.reshape(1, LOOK_BACK, n_features)
    pred = model.predict(inp, verbose=0)[0, 0]
    forecast_vals.append(pred)
    new_row      = last_seq[-1].copy()
    new_row[0]   = pred
    last_seq     = np.vstack([last_seq[1:], new_row])

future_demand = inv_transform(np.array(forecast_vals), scaler, n_features)

last_date    = data['date'].max()
future_dates = pd.date_range(last_date + timedelta(days=1), periods=FORECAST, freq='D')

forecast_df = pd.DataFrame({
    'date':             future_dates,
    'predicted_demand': future_demand.round(0).astype(int),
    'lower_bound':      (future_demand * 0.82).round(0).astype(int),
    'upper_bound':      (future_demand * 1.18).round(0).astype(int),
})

print(f"  ✅ {FORECAST}-day forecast ready!\n")


# ============================================================
# STEP 8: VISUALIZATIONS
# ============================================================
print("="*60)
print("  STEP 8: Generating Charts")
print("="*60)

fig, axes = plt.subplots(2, 2, figsize=(18, 12))
fig.suptitle(
    f'AgroMitra — Demand Forecasting (LSTM v2)\n{CROP_NAME} | {DISTRICT}',
    fontsize=15, fontweight='bold', color=COLORS['green'], y=1.01
)

# ── Chart 1: Training History ─────────────────────────────────
ax1 = axes[0, 0]
ax1.plot(history.history['loss'],     color=COLORS['blue'],   lw=2, label='Train Loss')
ax1.plot(history.history['val_loss'], color=COLORS['orange'], lw=2, label='Val Loss')
ax1.axvline(x=best_epoch-1, color=COLORS['red'], linestyle='--', lw=1.5, label=f'Best: Epoch {best_epoch}')
ax1.set_title('Training History', fontweight='bold', fontsize=12)
ax1.set_xlabel('Epoch')
ax1.set_ylabel('Loss')
ax1.legend()
ax1.text(0.98, 0.95, f'Val Loss: {min(history.history["val_loss"]):.5f}',
         transform=ax1.transAxes, ha='right', va='top',
         bbox=dict(boxstyle='round', facecolor='white', alpha=0.8))

# ── Chart 2: Actual vs Predicted ─────────────────────────────
ax2 = axes[0, 1]
n_show = min(120, len(y_test_real))
ax2.plot(range(n_show), y_test_real[:n_show],
         color=COLORS['gray'],  lw=1.5, label='Actual',    alpha=0.9)
ax2.plot(range(n_show), y_pred_real[:n_show],
         color=COLORS['teal'],  lw=2.0, label='Predicted', linestyle='--')
ax2.fill_between(range(n_show),
                 y_pred_real[:n_show]*0.85, y_pred_real[:n_show]*1.15,
                 alpha=0.15, color=COLORS['teal'])
ax2.set_title(f'Actual vs Predicted (Test Set — {n_show} days)', fontweight='bold', fontsize=12)
ax2.set_xlabel('Days')
ax2.set_ylabel('Demand (kg)')
ax2.legend()
ax2.text(0.02, 0.95,
         f'MAPE: {mape:.1f}%\nR²: {r2:.3f}',
         transform=ax2.transAxes, va='top',
         bbox=dict(boxstyle='round', facecolor=COLORS['teal'], alpha=0.12))

# ── Chart 3: Future Forecast ──────────────────────────────────
ax3 = axes[1, 0]
hist_last = data.tail(90)
ax3.plot(hist_last['date'], hist_last['quantity_available'],
         color=COLORS['gray'], lw=1.5, label='Historical', alpha=0.8)
ax3.plot(forecast_df['date'], forecast_df['predicted_demand'],
         color=COLORS['teal'], lw=2.5, label=f'{FORECAST}-Day Forecast')
ax3.fill_between(forecast_df['date'],
                 forecast_df['lower_bound'], forecast_df['upper_bound'],
                 alpha=0.2, color=COLORS['teal'], label='Confidence Band')
ax3.axvline(x=last_date, color=COLORS['red'], linestyle=':', lw=2, label='Today')
ax3.set_title(f'Next {FORECAST}-Day Demand Forecast', fontweight='bold', fontsize=12)
ax3.set_xlabel('Date')
ax3.set_ylabel('Demand (kg)')
ax3.legend(fontsize=9)
ax3.xaxis.set_major_formatter(mdates.DateFormatter('%b %d'))
plt.setp(ax3.xaxis.get_majorticklabels(), rotation=45)

# ── Chart 4: Monthly Demand Pattern ──────────────────────────
ax4 = axes[1, 1]
monthly = data.copy()
monthly['month_name'] = monthly['date'].dt.strftime('%b')
monthly['month_num']  = monthly['date'].dt.month
m_avg = monthly.groupby(['month_num','month_name'])['quantity_available'].mean().reset_index()
m_avg = m_avg.sort_values('month_num')

bar_colors = [
    COLORS['blue']   if m in [11,12,1,2] else
    COLORS['gold']   if m in [3,4,5]     else
    COLORS['teal']   if m in [6,7,8,9]   else
    COLORS['orange']
    for m in m_avg['month_num']
]
ax4.bar(range(len(m_avg)), m_avg['quantity_available'],
        color=bar_colors, edgecolor='white', linewidth=0.5)
ax4.set_xticks(range(len(m_avg)))
ax4.set_xticklabels(m_avg['month_name'], rotation=45, ha='right')
ax4.set_title('Monthly Average Demand Pattern', fontweight='bold', fontsize=12)
ax4.set_xlabel('Month')
ax4.set_ylabel('Avg Demand (kg)')
ax4.axhline(y=m_avg['quantity_available'].mean(), color=COLORS['red'],
            linestyle='--', lw=1.5,
            label=f"Mean: {m_avg['quantity_available'].mean():.0f} kg")
ax4.legend()

from matplotlib.patches import Patch
ax4.legend(handles=[
    Patch(facecolor=COLORS['blue'],   label='Winter'),
    Patch(facecolor=COLORS['gold'],   label='Summer/Eid'),
    Patch(facecolor=COLORS['teal'],   label='Monsoon'),
    Patch(facecolor=COLORS['orange'], label='Autumn'),
], fontsize=8, loc='upper right')

plt.tight_layout()
chart_path = f'output/{CROP_NAME}_{DISTRICT}_demand_v2.png'
plt.savefig(chart_path, dpi=150, bbox_inches='tight', facecolor='white')
print(f"  ✅ Chart saved: {chart_path}")
plt.show()


# ============================================================
# STEP 9: FORECAST REPORT
# ============================================================
print("\n" + "="*60)
print(f"  📊 DEMAND FORECAST REPORT")
print(f"  Crop: {CROP_NAME} | District: {DISTRICT}")
print("="*60)

mean_hist = data['quantity_available'].mean()

print(f"\n  📅 Next 7-Day Forecast:")
print(f"  {'Date':<14} {'Demand':<14} {'Range':<28} {'Signal'}")
print(f"  {'-'*70}")

for _, row in forecast_df.head(7).iterrows():
    d = row['predicted_demand']
    signal = ("🔴 Low Supply"  if d < mean_hist*0.80 else
              "🟢 High Supply" if d > mean_hist*1.20 else
              "🟡 Stable")
    print(f"  {str(row['date'].date()):<14} "
          f"{d:>6,} kg{'':<6} "
          f"{row['lower_bound']:,}–{row['upper_bound']:,} kg{'':<8}"
          f"{signal}")

avg7  = forecast_df.head(7)['predicted_demand'].mean()
avg30 = forecast_df['predicted_demand'].mean()

print(f"\n  📈 Summary:")
print(f"     Historical Avg     : {mean_hist:,.0f} kg/day")
print(f"     7-Day Forecast Avg : {avg7:,.0f} kg/day")
print(f"     30-Day Forecast Avg: {avg30:,.0f} kg/day")
print(f"     Change vs History  : {((avg7/mean_hist)-1)*100:+.1f}%")

print(f"\n  💡 AgroMitra Advisory:")
if avg7 > mean_hist * 1.15:
    print(f"     ✅ HIGH demand expected — Harvest & sell more this week!")
elif avg7 < mean_hist * 0.85:
    print(f"     ⚠️  LOW demand expected — Consider storage or price reduction.")
else:
    print(f"     📊 STABLE demand — Normal production recommended.")

print("="*60)

# Save forecast CSV
csv_path = f'output/{CROP_NAME}_{DISTRICT}_demand_forecast_v2.csv'
forecast_df.to_csv(csv_path, index=False)

print(f"\n  ✅ Forecast CSV : {csv_path}")
print(f"  ✅ Model saved  : models/lstm_demand_v2_{CROP_NAME}_{DISTRICT}.keras")

print("\n" + "🌾"*30)
print("  ✅ AgroMitra Demand Forecasting v2 Complete!")
print("🌾"*30 + "\n")
