@echo off
cd /d "%~dp0"
echo Ne Pisirsem baslatiliyor...
node server.js
if errorlevel 1 (
 echo.
 echo Node.js bulunamadi veya hata olustu. https://nodejs.org adresinden Node.js kurun.
 pause
)
