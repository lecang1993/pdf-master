@echo off
title PDF Master Pro - Tool xử lý PDF
echo ========================================
echo    PDF MASTER PRO - TOOL XU LY PDF
echo ========================================
echo.

echo [1/3] Dang kiem tra Node.js...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo Loi: Chua cai Node.js!
    echo Vui long tai Node.js tu: https://nodejs.org/
    pause
    exit /b
)
echo OK - Node.js da duoc cai dat

echo.
echo [2/3] Dang cai dat dependencies cho backend...
cd backend
call npm install
if %errorlevel% neq 0 (
    echo Loi: Khong the cai dat dependencies
    pause
    exit /b
)

echo.
echo [3/3] Dang khoi dong server...
start "PDF Master Backend" cmd /k "npm start"

timeout /t 3 /nobreak >nul

echo.
echo ========================================
echo    SERVER DA KHOI DONG!
echo ========================================
echo.
echo Mo trinh duyet va truy cap: 
echo file://%cd%\..\frontend\index.html
echo.
echo Nhan phim bat ky de mo frontend...
pause >nul

start "" "..\frontend\index.html"