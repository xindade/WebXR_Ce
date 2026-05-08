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
- `959545e` fix: 修复移除如来神掌后 setVR 未导出导致的全局错误
- `9ddb657` refactor: 合并去重三份技术文档为两份
- `a51abd0` docs: 全面更新技术文档
- `3685257` feat: 模块化拆分 + PICO 4 兼容修复
- `9f8dba3` feat: 气球碰撞系统 - 气球互斥防止重叠+船表面滑动碰撞

## 待办/问题记录
- 模块化后 PICO 4 测试：黑屏 + 退出失效（尚未修复）
  - 已添加左侧全屏日志面板诊断，见 `2026-05-07.md`
  - 排查方向：animate 循环是否运行、renderer.render 是否执行

## 模块化架构（2026-05-06）
- `index.html` — 入口 + VR 初始化 + 动画循环
- `js/core.js` — 常量/STATE/Three.js 核心/灯光/天空/云朵/Group 容器
- `js/game.js` — 子弹/气球/碰撞/波次/抽卡/如来神掌/特效
- `js/vr.js` — 音效/模型加载/手柄/枪支/输入/UI 面板
- 模块间全部使用命名导入，**禁用 `import * as` 语法**（PICO 4 兼容性问题）
- 跨模块依赖通过运行时注入（`setAudio()` / `setVR()`）解决，避免循环依赖

## 代码变更检查规则
- **跨文件改完后必须 grep 验证 import**：新增/修改常量、函数后，`rg "<标识符>" js/` 确认每个使用处都有对应 import
- **ES Module 严格模式**：未声明变量直接 ReferenceError（不会静默失败），日志系统可即时捕获
- **典型踩坑**：`vr.js` 调试面板用了 `BUDDHA_AIM_TIMEOUT` 但 import 只加了 `BUDDHA_COOLDOWN`（2026-05-08）

## 日志系统（2026-05-07）
- 全局 `window.__log(msg, level)` 使用内存缓冲区，`index.html` 中用独立 `setInterval(200ms)` 刷新
- 日志级别：`s`(✅绿色) `i`(🔹蓝色) `w`(⚠️黄色) `e`(❌红色)
- 涵盖：模块加载、Three.js 初始化、模型加载、VR 会话、animate 心跳、错误捕获
- 左侧 42vw × 100vh 面板，z-index:50，最新 200 条

---
_最后更新: 2026-05-08_
