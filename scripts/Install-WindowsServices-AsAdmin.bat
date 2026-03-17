@echo off
:: ORCA Windows servislerini kurar. Sag tiklayip "Yonetici olarak calistir" secin.
cd /d "%~dp0.."
node scripts\install-windows-services.cjs
pause
