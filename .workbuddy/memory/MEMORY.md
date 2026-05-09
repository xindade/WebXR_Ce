# MEMORY.md - WebXR VR 项目

## 项目概况
- **主文件**: `index.html` — Three.js WebXR VR 鲲鹏射击游戏
- **部署**: GitHub Pages (`https://github.com/xindade/WebXR_Ce.git`)
- **测试设备**: PICO 4 VR 头显
- **最后提交**: `8c71d43` feat: 如来神掌改版(无预览直放)+左手可见射线+关卡选择+鲲鹏模型替换

## 资源文件
- **飞船模型**: `鲲鹏.glb`（替换原气球船.glb）
- **枪支模型**: `Ak48.glb`
- **缩放配置**: `AK48_SCALE = 0.6;`、`SHIP_SCALE = 7.0`
- **飞船位置**: `SHIP_POS = [1, 1, 0.05]`、`SHIP_ROT = [0, 1.57, 0]`

## 场景内容
- 鲲鹏模型作为玩家乘坐的飞船
- 白云装饰（低多边形球体组合）
- AK48 枪支模型挂载在右手柄
- 调试面板（右手腕翻腕可见）
- 青色射线球 + 可见射线（左手柄，用于选择卡瞄准）
- 关卡选择按钮（开始界面右侧，3 个选关按钮）

## 技术要点
- 枪支缩放计算：根据原始包围盒尺寸动态调整
- PICO WebXR 兼容：使用 `navigator.xr.isSessionSupported()` 回退检测
- 子弹射击系统、摇杆移动、A/B 键退出
- 左手射线选择卡：Raycaster + 扳机上升沿检测，高亮卡片移近+缩放

## PICO VR 原生应用 (pico-vr-app/)
- 使用 Capacitor 将 WebXR 网页打包为 Android 原生应用
- `pico-vr-app/www/` — Web 资源（Three.js, GLTFLoader, Draco, 3D 模型）
- `pico-vr-app/android/` — Android 原生项目（Capacitor 生成）
- 排除规则：`node_modules/`, `.gradle/`, `app/build/`, `app/release/`

## Git 工具链
- **远程仓库**: `https://github.com/xindade/WebXR_Ce.git`
- **推送方式**: HTTPS（已配置 credential.helper 为 manager）

## 最新提交记录
- `8c71d43` feat: 如来神掌改版(无预览直放)+左手可见射线+关卡选择+鲲鹏模型替换
- `959545e` fix: 修复移除如来神掌后 setVR 未导出导致的全局错误
- `9ddb657` refactor: 合并去重三份技术文档为两份
- `a51abd0` docs: 全面更新技术文档
- `3685257` feat: 模块化拆分 + PICO 4 兼容修复
- `9f8dba3` feat: 气球碰撞系统 - 气球互斥防止重叠+船表面滑动碰撞

## 模块化架构
- `index.html` — 入口 + VR 初始化 + 动画循环 + 选关卡 UI
- `js/core.js` — 常量/STATE/Three.js 核心/灯光/天空/云朵/Group 容器
- `js/game.js` — 子弹/气球/碰撞/波次/抽卡/如来神掌/特效
- `js/vr.js` — 音效/模型加载/手柄/枪支/输入/UI 面板/左手射线球/可见射线
- 模块间全部使用命名导入，**禁用 `import * as` 语法**（PICO 4 兼容性问题）
- 跨模块依赖通过运行时注入（`setAudio()` / `setVR()`）解决，避免循环依赖

## 代码变更检查规则
- **跨文件改完后必须 grep 验证 import**：新增/修改常量、函数后，确认每个使用处都有对应 import
- **ES Module 严格模式**：未声明变量直接 ReferenceError（不会静默失败），日志系统可即时捕获
- **典型踩坑**：添加新常量到 core.js 后，容易漏掉某个引用文件的 import（如 `RAY_PITCH_ANGLE` 漏了 vr.js）

## 如来神掌（2026-05-08 重构版）
- **状态机**: IDLE → (握柄上升沿) → 直接释放 → IDLE(冷却8s)
- **无预览、无瞄准状态、无倒计时**
- `BUDDHA_KILL_RADIUS = 50`（范围拉满）
- `BUDDHA_HAND_ROT_X = -PI/2`（平放）
- **选关解锁**: `buddhaPalmUnlocked` 标记控制，模型加载后自动解锁

## 日志系统（2026-05-07）
- 全局 `window.__log(msg, level)` 使用内存缓冲区，`index.html` 中用独立 `setInterval(200ms)` 刷新
- 日志级别：`s`(✅绿色) `i`(🔹蓝色) `w`(⚠️黄色) `e`(❌红色)
- 涵盖：模块加载、Three.js 初始化、模型加载、VR 会话、animate 心跳、错误捕获
- 左侧 42vw × 100vh 面板，z-index:50，最新 200 条

---
_最后更新: 2026-05-08_
