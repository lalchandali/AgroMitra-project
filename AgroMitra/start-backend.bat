@echo off
echo ============================================
echo   AgroMitra Backend Starting...
echo ============================================

cd /d "E:\Personal\UU INFO\UU_Project\Final_Project\AgroMitra\backend"

call "E:\Personal\UU INFO\UU_Project\Final_Project\.venv\Scripts\activate.bat"

echo Virtual environment activated.
echo Starting server on http://localhost:8000 ...
echo.

uvicorn main:app --reload --port 8000

pause
