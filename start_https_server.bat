@echo off
cd /d "%~dp0"
echo 启动 HTTPS 服务器 (端口 3443)...
npx serve -l 3443 -s . --ssl-cert cert.pem --ssl-key key.pem
pause
