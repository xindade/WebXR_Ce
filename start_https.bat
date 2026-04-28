@echo off
cd /d "%~dp0"
echo 启动 HTTPS 服务器...
npx http-server -p 3443 -S -C cert.pem -K key.pem
pause
