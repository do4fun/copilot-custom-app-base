@echo off
title SkillsHub - Frontend
cd /d "%~dp0frontend"

if not exist "node_modules" (
    echo Installation des dependances npm...
    npm install
)

echo.
echo =============================================
echo  Frontend demarre sur http://localhost:5173
echo =============================================
echo.

npm run dev
