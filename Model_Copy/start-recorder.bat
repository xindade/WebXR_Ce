@echo off
echo === VR 动画录制工具 ===
echo 启动本地服务器...
cd /d "%~dp0.."
start "" http://localhost:3000/Model_Copy/anim-recorder.html
node Model_Copy/server.js
pause