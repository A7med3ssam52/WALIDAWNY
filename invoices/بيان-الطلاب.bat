@echo off
chcp 65001 >nul
REM بيان الطلاب الشامل — كل البيانات + آخر ظهور + النشاط (محلي فقط — سري ولا يُرفع على git)
cd /d "%~dp0.."
node invoices\generate-students-statement.mjs %*
pause
