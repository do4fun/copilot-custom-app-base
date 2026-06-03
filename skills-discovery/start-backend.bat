@echo off
title SkillsHub - Backend
cd /d "%~dp0backend"

if not exist ".venv" (
    echo Creation de l'environnement virtuel...
    py -3.12 -m venv .venv
)

call .venv\Scripts\activate

echo Installation des dependances...
pip install -r requirements.txt -q

echo.
echo =============================================
echo  Backend demarre sur http://localhost:8000
echo  API Docs : http://localhost:8000/docs
echo =============================================
echo.

python run.py
