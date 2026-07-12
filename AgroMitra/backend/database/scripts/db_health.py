import os
import sys
from pathlib import Path

# Make sure ai_models is on the import path when run from scripts/
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.database import engine
from sqlalchemy import inspect, text

if __name__ == '__main__':
    try:
        with engine.connect() as conn:
            result = conn.execute(text("SELECT version()"))
            server_version = result.scalar()
            inspector = inspect(engine)
            tables = inspector.get_table_names()
            print('PostgreSQL server version:', server_version)
            print('Connected tables:', tables)
    except Exception as exc:
        print('Connection failed:', type(exc).__name__, exc)
        raise
