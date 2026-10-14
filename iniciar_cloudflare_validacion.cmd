@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0infra\iniciar-cloudflare-validacion.ps1"
set taskExit=%errorlevel%
echo.
pause
exit /b %taskExit%