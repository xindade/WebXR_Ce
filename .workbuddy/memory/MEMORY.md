# MEMORY.md - WebXR VR 项目

## 项目概况
- **主文件**: `index36.html` — Three.js WebXR VR 热气球托盘场景
- **部署**: GitHub Pages，HTTP 服务器端口 3000
- **测试设备**: PICO 4 VR 头显

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

## 待办/问题记录
- 无

---
_最后更新: 2026-04-28_
