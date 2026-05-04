# MEMORY.md - WebXR VR 项目

## 项目概况
- **主文件**: `index.html` — Three.js WebXR VR 热气球托盘场景
- **部署**: GitHub Pages (`https://github.com/xindade/WebXR_Ce.git`)
- **测试设备**: PICO 4 VR 头显
- **Git 状态**: ✅ 所有提交已推送到 origin/master

## 资源文件
- **枪支模型**: `Ak48.glb`（已压缩版本，替换原 Ak47.glb）
- **缩放配置**: `const AK47_SCALE = 0.6;`（当前使用值 0.6）

## 场景内容
- 热气球卡通地面（`image/卡通热气球托盘生成 (3).png`）
- 白云装饰（低多边形球体组合）
- AK48 枪支模型挂载在右手柄
- 调试面板（右手腕翻腕可见）

## 技术要点
- 枪支缩放计算：根据原始包围盒尺寸动态调整
- PICO WebXR 兼容：使用 `navigator.xr.isSessionSupported()` 回退检测
- 子弹射击系统、摇杆移动、A/B 键退出

## PICO VR 原生应用 (pico-vr-app/)
- 使用 Capacitor 将 WebXR 网页打包为 Android 原生应用
- `pico-vr-app/www/` — Web 资源（Three.js, GLTFLoader, Draco, 3D 模型）
- `pico-vr-app/android/` — Android 原生项目（Capacitor 生成）
- 排除规则：`node_modules/`, `.gradle/`, `app/build/`, `app/release/`

## Git 工具链
- **Git 路径**: `E:\01_AI\WebXR_Ce\PortableGit\cmd\git.exe`
- **运行方式**: 通过 `PortableGit\bin\bash.exe -c` 或 `Start-Process` 调用
- **远程仓库**: `https://github.com/xindade/WebXR_Ce.git`
- **推送方式**: HTTPS（已配置 credential.helper 为 manager）

## 最新提交记录
- `585d116` chore: update .gitignore
- `be0a0e6` feat: add pico-vr-app Android native code
- `5657ccd` feat: add pico-vr-app android build files
- `4c2e489` feat: add pico-vr-app (web assets + config files)

## 待办/问题记录
- 无

---
_最后更新: 2026-05-03_
