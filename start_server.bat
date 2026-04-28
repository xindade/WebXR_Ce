@echo off
cd /d "%~dp0"
echo 启动 npx serve...
npx serve -l 3000 -s .
pause
