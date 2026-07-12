# simple runner to import main_with_db and trigger table creation
import sys
from pathlib import Path
# ensure parent folder is on sys.path so we can import main_with_db
sys.path.append(str(Path(__file__).resolve().parents[1]))
import backend.database.main_with_db as main_with_db
import backend.main as main
print('imported main_with_db — table creation attempted')
