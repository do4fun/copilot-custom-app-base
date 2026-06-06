@echo off
title SkillsHub

echo =============================================
echo  SkillsHub — Demarrage complet
echo  API  : http://localhost:8000
echo  App  : http://localhost:5173
echo =============================================
echo.

start "SkillsHub API" cmd /k "cd /d ""%~dp0api"" && if not exist node_modules npm install && node src\server.js"
timeout /t 2 /nobreak >nul
start "SkillsHub Frontend" cmd /k "cd /d ""%~dp0frontend"" && if not exist node_modules npm install && npm run dev"
