@echo off
title SkillsHub - Lanceur
echo.
echo  SkillsHub - Demarrage...
echo.

start "SkillsHub Backend" cmd /k "%~dp0start-backend.bat"
timeout /t 3 /nobreak >nul
start "SkillsHub Frontend" cmd /k "%~dp0start-frontend.bat"
timeout /t 4 /nobreak >nul

echo Ouverture du navigateur...
start http://localhost:5173

echo.
echo Les deux serveurs sont lances.
echo Ferme les fenetres de terminal pour arreter.
