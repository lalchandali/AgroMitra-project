import pandas as pd
from pathlib import Path
csv = Path(__file__).resolve().parents[1] / \
    'data' / 'raw' / 'crop_prices_v2_64districts.csv'
if not csv.exists():
    print('MISSING')
else:
    df = pd.read_csv(csv)
    districts = sorted(df['district'].dropna().unique())
    print('\n'.join(districts))
