@echo off
chcp 65001 >nul
echo ==========================================
echo   GitHub Pages 快速部署脚本
echo ==========================================
echo.
echo 请按以下步骤操作：
echo.
echo 1. 在 GitHub 创建新仓库: vr-balloon-shooter
echo 2. 复制仓库 URL (例如: https://github.com/你的用户名/vr-balloon-shooter.git)
echo.
set /p REPO_URL="请输入仓库 URL: "
echo.
echo 正在初始化 Git 仓库...
cd /d "%~dp0"
git init
git add .
git commit -m "Initial commit: VR Balloon Shooter"
git branch -M main
git remote add origin %REPO_URL%
git push -u origin main
echo.
echo ==========================================
echo   上传完成！
echo ==========================================
echo.
echo 下一步：
echo 1. 进入 GitHub 仓库 Settings ^> Pages
echo 2. Source 选择 GitHub Actions
echo 3. 等待部署完成
echo.
echo 访问地址: https://你的用户名.github.io/vr-balloon-shooter/
echo.
pause
