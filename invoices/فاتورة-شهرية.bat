@echo off
chcp 65001 >nul
REM ايقونة الفاتورة الشهرية — دبل كليك لتوليد فاتورة فترة حرة
REM (محلي فقط — الملف الناتج سري ولا يُرفع على git)
cd /d "%~dp0.."
node invoices\generate-invoice.mjs %*
pause
