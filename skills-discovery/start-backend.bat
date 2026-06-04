@echo off
title SkillsHub - Backend
cd /d "%~dp0backend"

if not exist ".venv" (
    echo Creation de l'environnement virtuel Python 3.12...
    py -3.12 -m venv .venv
)

call .venv\Scripts\activate

echo Installation des dependances...
pip install -r requirements.txt -q

if not exist ".env" (
    echo.
    echo  ATTENTION : fichier .env manquant.
    echo  Copie .env.example en .env et remplis ANTHROPIC_API_KEY.
    echo  Sans cette cle, les agents fonctionnent en mode heuristique uniquement.
    echo.
)

echo.
echo =============================================
echo  Backend demarre sur http://localhost:8000
echo  API Docs : http://localhost:8000/docs
echo  Config   : skills-discovery\backend\.env
echo =============================================
echo.

python run.py
