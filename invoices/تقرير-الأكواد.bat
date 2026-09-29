@echo off
chcp 65001 >nul
REM تقرير الأكواد — ملخص + تفصيلي (محلي فقط — سري للغاية ولا يُرفع على git)
cd /d "%~dp0.."
node invoices\generate-codes-report.mjs %*
pause
