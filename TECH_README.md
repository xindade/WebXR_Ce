# VR 热气球射击游戏 — AI 开发技术文档

> 最后更新: 2026-05-07 | 入口文件: `index.html` + `js/` 模块 | Three.js ES Module + WebXR

---

## 1. 项目概览

模块化 WebXR VR 游戏。玩家站在热气球托盘（气球船）上，用 AK48 射击气球，清完每波出强化卡。第0波（初始波）中混入骑士，第0波清完解锁如来神掌大招。

- **架构**: 模块化拆分 (`index.html` + `js/core.js` + `js/game.js` + `js/vr.js` + `js/logger.js`)
- **框架**: Three.js r168 (ES Module `three.module.js`)
- **VR**: WebXR `immersive-vr` + `local-floor`
- **模型**: glTF Binary (`.glb`)，Draco 压缩，CDN 解压 (`gstatic.com/draco/1.5.6/`)
- **服务**: `npx serve -l 3000 -s .` (HTTP)，PICO 无需 HTTPS
- **目标平台**: PICO 4 VR 头显（浏览器 Chrome/105）
- **部署**: GitHub Pages (`https://github.com/xindade/WebXR_Ce.git`)
- **开发服务器**: Node.js HTTPS，端口 3443，IP `192.168.0.114`，自签名证书

---

## 2. 模块化架构

项目采用 **ES Module 模块化**架构，避免单文件堆积导致的维护困难。模块间使用命名导入（**禁用 `import * as` 语法**，PICO 4 Chrome/105 兼容性 Bug）。

```
index.html        ← 入口 + VR 初始化 + 动画循环
js/
├── logger.js     ← 独立日志系统（ES Module 之前加载）
├── core.js       ← 常量/STATE/Three.js 核心/灯光/天空/云朵/容器
├── game.js       ← 子弹/气球/碰撞/波次/抽卡/如来神掌/特效
└── vr.js         ← 音效/模型加载/手柄/枪支/输入/UI 面板
```

**跨模块依赖通过运行时注入解决**：`game.js` 通过 `setAudio(vr)` / `setVR(vr)` 获取音频和 VR 模块实例，避免循环依赖。

### 2.1 日志系统（`logger.js`）

在 ES Module 加载前以普通 `<script>` 标签执行，保证即使模块加载失败也能看到诊断信息。

- **`window.__log(msg, level)`**: 全局日志函数，级别: `s`(✅绿色) `i`(🔹蓝色) `w`(⚠️黄色) `e`(❌红色)
- **左侧日志面板**: 42vw × 100vh，z-index:50，最新 200 条，独立 `setInterval(200ms)` 刷新
- **右上角 JS 状态指示器**: `#js-status` 显示 JS 是否已执行
- **全局错误捕获**: `error` + `unhandledrejection` 事件监听
- **模块加载超时检测**: 3 秒后检查状态

---

## 3. 文件结构

```
WebXR_Ce/
├── index.html               # ★ 入口：HTML + CSS + 动画循环 + VR 会话（~388行）
│
├── js/                      # 模块化代码（主目录）
│   ├── logger.js            # 独立日志系统（<script> 同步加载）
│   ├── core.js              # 常量/STATE/Three.js 核心/天空/云朵（~548行）
│   ├── game.js              # 子弹/气球/波次/抽卡/神掌/特效（~981行）
│   └── vr.js                # 音效/模型加载/手柄/枪支/UI 面板（~499行）
│
├── three.module.js          # Three.js ES Module (~1.3MB)
├── jsm/loaders/             # Three.js addons
│   ├── GLTFLoader.js        # GLTF 加载器
│   └── DRACOLoader.js       # Draco 解压器
│
├── Model/                   # 3D 模型（全部 Draco 压缩）
│   ├── Ak48.glb             # 枪支 (456KB)
│   ├── 气球船.glb           # 玩家乘坐的船 (900KB)
│   ├── 骑士.glb             # 骑士气球 (845KB)
│   ├── 如来神掌.glb         # 大招模型 (430KB)
│   ├── 火焰.glb             # 特效预留 (471KB)
│   └── 鲲鹏.glb             # 预留模型
│
├── image/                   # 贴图
│   ├── sun.png              # 太阳 (PNG 透明, 177KB)
│   ├── moon.png             # 月牙 (PNG 透明, 90KB)
│   └── smile.png            # 气球笑脸 (PNG, 2.9MB)
│
├── draco/                   # Draco WASM（离线备用）
│   ├── draco_decoder.js
│   ├── draco_decoder.wasm
│   └── draco_wasm_wrapper.js
│
├── pico-vr-app/             # Capacitor 打包的 PICO Android 原生应用
│   ├── www/                 # Web 资源
│   └── android/             # Android 原生项目
│
├── github-pages/            # 独立 GitHub Pages 部署版（旧单文件版本）
│   └── index.html           # 独立可运行版本
│
├── docs/                    # 文档
│   └── 打包指南_Capacitor_Android.html
│
├── web/                     # Web 部署资源
│
├── generate-certs.js        # 生成自签名 HTTPS 证书
├── https_server_fixed.py    # Python HTTPS 服务器（修复版）
├── https_server_simple.js   # Node.js HTTPS 服务器
├── package.json             # 项目配置
│
├── TECH_README.md           # 本文档
├── PROJECT_GUIDE.md         # 完整项目白皮书
└── PROJECT_README.md        # 快速项目概述
```

---

## 4. 启动方式

### 4.1 HTTP（PICO 推荐）

```bash
cd /path/to/WebXR_Ce
npx serve -l 3000 -s .
# PICO 浏览器访问: http://<电脑IP>:3000
```

### 4.2 HTTPS（本地 Chrome 测试）

```bash
# 生成自签名证书
node generate-certs.js

# Node.js 服务器
node https_server_simple.js

# 或 Python 服务器
python https_server_fixed.py

# 浏览器访问: https://192.168.0.114:3443/
```

### 4.3 Draco 解压器

默认从 CDN 加载: `https://www.gstatic.com/draco/versioned/decoders/1.5.6/`
离线时改为本地: `dracoLoader.setDecoderPath('./draco/')`（修改 `js/vr.js`）

---

## 5. 场景层级树

```
Scene (world space)
├── AmbientLight (ambientLight)         ← 动态天色
├── DirectionalLight (sunLight)         ← 太阳光，阴影 2048x2048
├── HemisphereLight (hemiLight)         ← 半球环境光
├── balloonGroup                        ← 气球 + 骑士
├── bulletGroup                         ← 子弹对象池 (20个)
├── particleGroup                       ← 粒子对象池 (50个)
├── debrisGroup                         ← 碎片对象池 (30个)
├── cloud groups × 12                   ← 3D 装饰云，世界空间固定
├── shipModel (气球船)                  ← 玩家乘坐的船
├── buddhaPalmSkills[]                  ← 飞行中的神掌（释放态）
│
└── dolly (玩家移动根节点)
    ├── camera (PerspectiveCamera)      ← 72° FOV，局部 y=6.6 (VR中由XR控制眼高≈1.6m)
    ├── skyDome (半径60半球)            ← 纯色天空穹顶，静态 Mesh
    ├── starLayers[3]                   ← 星空粒子 (390颗)
    ├── sunSprite                       ← 太阳精灵 (NormalBlending)
    ├── moonSprite                      ← 月牙精灵 (AdditiveBlending)
    ├── choiceCardGroup                 ← 强化选择卡 + 刷新卡
    ├── promptSprite                    ← 如来神掌提示文字
    ├── leftController / leftGrip       ← XR 左手
    │   ├── (左手神掌模型)              ← 解锁后装备 (scale=0.2)
    │   └── leftDebugPanel              ← 左手腕 UI (船血/金币/神掌状态/倒计时)
    └── rightController / rightGrip     ← XR 右手
        ├── AK48 模型                   ← 枪支 (scale=0.6)
        └── debugPanel                  ← 右手腕 UI (攻击/射速/多重/范围/得分)
```

**重要**: dolly 是玩家逻辑组，真实移动（不是假滚动）。移动钳制在 X:±2 Z:±4 (4×8 米)。camera 在 dolly 局部坐标为 `(0, 6.6, 0)`，VR 中 XR 运行时控制真实眼高。

---

## 6. 日夜黄昏天空系统

### 6.1 预设表（`core.js` 中 `skyPresets`）

| 预设 | 天空色 | 雾色 | 太阳仰角 | 月亮仰角 | 环境光强 | 太阳光强 | 星光 |
|:----:|--------|------|:--------:|:--------:|:--------:|:--------:|:----:|
| day | `#87CEEB` | `#87CEEB` | 50° | -30° | 1.2 | 2.5 | 0 |
| dusk | `#E85D26` | `#E87544` | 5° | 5° | 0.7 | 1.8 | 0.25 |
| night | `#0A0A28` | `#0C0C2A` | -25° | 50° | 0.35 | 0.5 | 1.0 |

### 6.2 过渡机制
- `applySkyTarget(name)` 仅设置 `STATE.skyTarget`
- `updateSkyTransition(dt)` 每帧 lerp 13+ 属性向目标值
- 指数缓动 `ease = 1 - exp(-0.12 * dt)`，约 30 秒完成 95%
- 星空 3 层叠加 (80+130+180=390 颗)，AdditiveBlending，幂分布头顶最密
- 星空闪烁：`0.85 + 0.15 * sin(time * 1.7 + layer * 2.1)`

### 6.3 太阳/月亮
- 使用独立仰角 (`sunElev`, `moonElev`) 和方位角 (`moonAz`)
- Canvas 备用纹理 + `image/sun.png` `image/moon.png` 自动加载替换
- 太阳 NormalBlending（防过曝），月亮 AdditiveBlending
- 月牙用矢量路径绘制（外弧+反向内弧）
- 透明度随仰角渐变：`max(0, min(1, (elev + 3) / 8))`

### 6.4 切换方式
- HTML 按钮: ☀️白天 / 🌅黄昏 / 🌙夜晚
- VR: 左手 X/Y 键循环切换
- 键盘快捷键已移除

---

## 7. 核心常量速查

所有常量定义在 `js/core.js` 中（已导出为命名常量）：

### 7.1 移动与操作

```javascript
MOVE_SPEED    = 3.5    // 摇杆移动速度 (m/s)
DEADZONE      = 0.2    // 摇杆死区
BOUND_X       = 2      // X 轴移动边界 ±2m
BOUND_Z       = 4      // Z 轴移动边界 ±4m
SHOOT_COOLDOWN = 150   // 射击冷却 (ms)
```

### 7.2 子弹

```javascript
BULLET_SPEED    = 15   // 子弹速度 (m/s)
BULLET_LIFE     = 2    // 子弹存活时间 (s)
BULLET_POOL_SIZE = 20  // 子弹对象池大小
bulletPitch     = -30° // 固定下倾角（弧度计算）
muzzleLocal     = (0, 0, -0.2)  // 发射口相对手柄
```

### 7.3 普通气球

```javascript
BALLOON_HP      = 100   // 生命值
BALLOON_SPEED   = 0.5   // 移速 (m/s)
BALLOON_RADIUS  = 0.5   // 碰撞半径
BALLOON_SCORE   = 10    // 得分
BALLOON_DAMAGE  = 5     // 撞船伤害
BALLOON_COLORS  = [7种颜色]  // 随机染色
```

### 7.4 骑士气球

```javascript
KNIGHT_HP      = 500    // 生命值
KNIGHT_SCORE   = 30     // 得分
KNIGHT_SCALE   = 3      // 模型缩放
KNIGHT_RADIUS  = 0.5 * 3 = 1.5  // 碰撞半径（自动计算）
```

### 7.5 波次生成

```javascript
WAVE_BASE_SPAWN_COUNT = 30   // 每波基础生成数量（每波 + waveNumber*5）
SPAWN_BATCH_INTERVAL  = 1.0  // 每1秒生成一批
SPAWN_BATCH_SIZE      = 3    // 每批3个
SPAWN_MAX_ACTIVE      = 10   // 场景内同时存在不超过10个
SPAWN_DISTANCE        = 15   // 生成距离（米）
SPAWN_SPREAD          = 8    // 散布范围（米）
```

### 7.6 气球船

```javascript
SHIP_MAX_HP            = 100    // 最大生命值
SHIP_COLLISION_RADIUS  = 2.5    // 船碰撞半径
SHIP_REPEL_FORCE       = 2.0    // 船对气球排斥力
BALLOON_REPEL_FORCE    = 3.0    // 气球间排斥力
SHIP_SCALE             = 7.0    // 模型缩放
SHIP_POS               = [1, 1, 0.05]  // 世界坐标
SHIP_ROT               = [0, 1.57, 0]  // 弧度（Y轴90°）
```

### 7.7 如来神掌

```javascript
BUDDHA_COOLDOWN  = 8    // 冷却 (秒)
AIM_TIMEOUT      = 5    // 瞄准超时 (秒)
```

### 7.8 AK48 枪支

```javascript
AK48_SCALE = 0.6          // 整体缩放
// 右手位置 (相对右手柄)
position.set(0, -0.1, 0.01)
rotation.x = -20          // 弧度 ≈ -1146°（实际代码中的值，如需角度制请用 Math.PI/180）
rotation.y = Math.PI / 2   // 90°
// 左手位置 (镜像翻转)
scale.x = -AK48_SCALE     // X 轴镜像
```

### 7.9 特效

```javascript
DEBRIS_COUNT  = 30    // 碎片池大小
DEBRIS_LIFE   = 0.8   // 碎片存活 (秒)
PARTICLE_COUNT = 50   // 粒子池大小
PARTICLE_LIFE = 1.0   // 粒子存活 (秒)
```

---

## 8. 移动系统

真实移动 dolly（不是云海滚动）。摇杆控制，钳制在 4×8 米范围。

```javascript
// 右摇杆优先，右摇杆无输入时回退到左摇杆
// PICO 摇杆前推为负值，代码中 sy = -sy 取反
// 移动方向基于 camera 朝向（forward + right），确保相对于玩家视野
```

---

## 9. 波次分阶段生成系统

每波不再一次性生成，而是**分阶段、分方向**持续生成：

| 时间点 | 阶段 | 生成方向 | 说明 |
|:------:|:----:|----------|------|
| 0s | Phase 1 | 仅**前方** | 玩家面朝方向 +15 米 |
| 15s | Phase 2 | 前方 + **左右** | 左/右侧各 +15 米 |
| 30s | Phase 3 | 前方 + 左右 + **后方** | 背向 +15 米 |

**生成逻辑**:
- `updateWaveSpawning(dt)` 每帧调用，每秒一批 (`SPAWN_BATCH_INTERVAL=1.0s`)
- 每批生成 `SPAWN_BATCH_SIZE=3` 个
- 如果活跃气球已达 `SPAWN_MAX_ACTIVE=10` 个，暂停生成
- 每波总数: `WAVE_BASE_SPAWN_COUNT(30) + waveNumber * 5`

**波次结束条件**: `waveSpawnRemaining <= 0`（全部生成完毕）且所有活跃气球被击破 → 触发抽卡。

**骑士概率**: 第0波起约 8%~35%，随波次递增：`Math.min(0.35, 0.08 + waveNumber * 0.025)`

---

## 10. 碰撞与排斥系统

### 10.1 气球-气球排斥
- O(n²) 双重循环，距离平方比较
- 排斥力: `BALLOON_REPEL_FORCE = 3.0`
- Y 轴排斥衰减：`0.3` 倍

### 10.2 气球-船碰撞
- 船碰撞中心: `shipModel.position + (0, 1.0, 0)`
- 船碰撞半径: `SHIP_COLLISION_RADIUS = 2.5`
- 排斥力: `SHIP_REPEL_FORCE = 2.0`
- 仅推水平方向（X/Z）

### 10.3 气球撞船伤害
- 触发: 气球进入 `|x| <= 2, |z| <= 4` 区域
- 伤害: `BALLOON_DAMAGE = 5` 每气球
- 效果: 气球消失 + 碎片+粒子 + 音效 + 船闪烁 (`shipHitFlash`)
- 船血 <= 0 触发 `gameOver()`

---

## 11. 抽卡系统（稀有度版）

### 11.1 触发条件
清空当前波次所有气球后自动生成。

### 11.2 属性类型

| 属性 | 图标 | 效果 |
|------|:----:|------|
| 攻击力 (atk) | ⚔️ | 加固定数值 |
| 生命值 (hp) | ❤️ | 加固定数值 |
| 射速 (fireRate) | 🎯 | 加成百分比 `+value/100` |
| 多重射击 (multiShot) | 🔫 | 概率百分比额外子弹 |

### 11.3 稀有度

| 稀有度 | 颜色 | 数值 | 概率 |
|--------|------|:----:|:----:|
| 普通 | `#ffffff` | 10 | 随机 |
| 稀有 | `#4da6ff` | 20 | 随机 |
| 史诗 | `#b388ff` | 50 | 随机 |
| 传说 | `#ffd700` | 100 | 随机 |

### 11.4 刷新卡
- 触碰下方绿色刷新卡可花费金币重新随机
- 费用: `10 * 2^刷新次数` 金币
- 有 2 秒冷却时间
- 金币通过击杀气球获得（每个 10/30 分）

### 11.5 交互方式
- 左手柄靠近选择卡（距离 < 0.4m）自动选中
- 卡组在 dolly 空间，面朝玩家，间距 0.55m
- 15 秒超时自动跳过

### 11.6 波次推进
卡片选择/超时后，`choiceCardsActive` 重置，1 秒后:
- `waveNumber++`
- 如果 `waveNumber >= 1` 且未解锁神掌 → 解锁如来神掌
- 调用 `spawnBalloons()` 开始下一波

---

## 12. 如来神掌系统

### 12.1 解锁
打完第0波（首次清空）后 `waveNumber >= 1` 自动解锁，`attachBuddhaPalmToLeft()` 装备到左手。

### 12.2 状态机
```
IDLE → (按握柄① 上升沿) → AIMING → (按握柄② 或 5秒超时) → SLAMMING → IDLE(冷却)
```

### 12.3 参数及实际数值

| 阶段 | 参数 | 值 | 说明 |
|------|------|:---:|------|
| 左手装备 | `palm.scale` | 0.2 | 大小（挂在 leftGrip） |
| | `palm.position` | (0, -0.08, 0.03) | 相对左手柄 |
| | `palm.rotation` | (-90°, 0, 0) | 弧度制 |
| 瞄准 | `preview.scale` | 2.0 | 预览大小 |
| | `preview.position` | (0, 0.5, -4) | 前方4米，高0.5米（dolly局部） |
| 释放 | `palm.scale` | 20.0 | 20倍大小 |
| | `palm.position` | camPos + aimDir*3 + y+20 | 锁定方向前方3米，头顶20米 |
| | `fallDuration` | 0.5 | 下落时间（秒） |
| 碰撞 | `killRadius` | 10 | 碰撞半径（米） |
| | `damage` | 1000 | 伤害 |
| | `particleCount` | 80 | 落地粒子数 |
| 清理 | `cleanupDelay` | 0.3 | 落地后消失（秒） |

### 12.4 核心逻辑
1. **第一次按握柄** (上升沿): 从 IDLE → AIMING
   - 锁定 `aimDirection`（当前相机朝向，去 Y）
   - 生成 2x 预览神掌在 `(0, 0.5, -4)`（dolly局部）
   - 显示提示文字 Sprite
2. **第二次按握柄 或 5秒超时**: 从 AIMING → SLAMMING
   - 预览消失
   - 20x 神掌从 `camPos + aimDir*3` 上方 20m 处 0.5 秒落地
   - 落地: 半径 10m 内所有气球扣 1000 HP，≤0 即死
   - 80 个金色粒子爆炸
   - 0.3 秒后消失，回到 IDLE，8 秒冷却
3. **冷却中**: grip 按了无响应，`cooldown > 0`

---

## 13. 左手腕 UI（神掌状态面板）

左手腕 Canvas 面板 (512×256px, 0.18×0.09m)，显示内容：

| 模式 | 显示内容 |
|:----:|----------|
| 默认 | 🚢 船血 X/100 | 💰 金币 X | 🖐 如来神掌 | ⏳ 冷却 X% |
| AIMING | **超大金色倒计时数字** (180px, 黑色粗描边，占面板70%，无框无文字) |
| 抽卡中 | 🎴 选择增益 | 👇 触碰卡片选择 | 🔄 触碰下方刷新 [冷却Xs] |
| 特殊 | 冷却百分比显示 + 冷却减免信息 |

右手腕面板 (debugPanel): ⚔️ 攻击 / 🎯 射速 / 🔫 多重 / 💥 范围 / 🏆 得分

---

## 14. 音效系统（Web Audio API）

### 14.1 初始化
- `initAudio()`: 首次射击时创建 AudioContext（懒加载，避免自动播放策略拦截）
- 预渲染 BGM 缓冲后自动循环播放

### 14.2 背景音乐 — 丛林鼓点
使用 `OfflineAudioContext` 预渲染 4 秒循环缓冲：

| 元素 | 参数 |
|------|------|
| 鼓点 | 16 拍，lowpass 800Hz 噪声，每拍 0.25s |
| 旋律 | 8 个木琴短音 (523→1047Hz, sine 波) |
| 播放 | `AudioBufferSourceNode` loop=true，增益 0.12 |

### 14.3 射击音效
噪声衰减模拟枪声: lowpass 3000Hz，增益 0.4，衰减 0.1s。

### 14.4 气球爆炸音效
方波上行滑音 200→800Hz，0.3s，增益 0.6（吃豆人风格）。

---

## 15. 特效系统

### 15.1 碎片系统（`debrisPool`, 30个）
- 几何体: `TetrahedronGeometry(0.04, 0)` 共享
- 生命周期: `DEBRIS_LIFE = 0.8` 秒
- 物理: 重力 `-4.0` m/s² + 空气阻力 `0.98`
- 旋转: 随机三轴角速度
- 自动回收: `life <= 0` 或 `y < -2`

### 15.2 粒子系统（`particlePool`, 50个）
- 几何体: `SphereGeometry(0.01, 4, 4)` 各实例独立（可不同颜色）
- 生命周期: `PARTICLE_LIFE = 1.0` 秒
- 运动: 随机方向速度 + 阻尼 `0.98`
- 透明度: 线性衰减 `life / PARTICLE_LIFE`

---

## 16. 输入映射

### 右手
| 输入 | 功能 |
|------|------|
| Trigger (buttons[0]) | 射击 |
| Grip (buttons[1]) | 按住显示右手腕调试面板 |
| Stick (axes[2]/[3]) | 移动（优先） |
| Button A (buttons[4]) | 退出 VR |
| Button B (buttons[5]) | 退出 VR |

### 左手
| 输入 | 功能 |
|------|------|
| Trigger (buttons[0]) | 左手射击（左手持枪模式） |
| Grip (buttons[1]) | 两段式：第一段瞄准/第二段释放神掌；按住显示左手腕面板 |
| Stick (axes[2]/[3]) | 移动（右摇杆无输入时回退） |
| Button X (buttons[4]) | 天空循环切换 (+1) |
| Button Y (buttons[5]) | 天空循环切换 (-1) |

**Gamepad 轴索引**: PICO 4 使用 `axes[2]` / `axes[3]` 作为右摇杆（部分设备回退到 `axes[0]` / `axes[1]`）。

---

## 17. 游戏状态机

```
[桌面预览] --点击"正常开始游戏"--> [VR 会话初始化]
                                        |
                                        v
[sessionstart 事件] ← 进入 VR 模式
    | 加载模型 → 100ms 挂载 AK48 → 500ms 开始游戏
    v
[波次 0] --spawnBalloons()--> [战斗中]
    |                              |
    | (清空气球 + waveRemain=0)    | (气球撞船 → 扣血)
    v                              v
[抽卡 (15秒超时)]              [shipHp <= 0 → gameOver]
    |                              |
    | 1秒后 waveNumber++           | 1.5秒后 restartLevel
    v                              v
[解锁如来神掌 (wave>=1)]      [保留 waveNumber, 重置气球]
    |  ← 解锁后 →                    | 0.5秒后赠送抽卡
    |  attachBuddhaPalmToLeft()      |
    v                              v
[波次+N] ← 循环 → [战斗中] ← --- 清空气球回归
```

**关键状态变量** (`STATE` 对象):

| 变量 | 类型 | 说明 |
|------|:----:|------|
| `gameStarted` | bool | 是否已开始战斗 |
| `gameOverState` | bool | 是否处于死亡处理中 |
| `waveNumber` | int | 当前波次（0-based） |
| `shipHp` | int | 船当前血量（0=死亡） |
| `choiceCardsActive` | bool | 是否正在显示选择卡 |
| `buddhaPalmReady` | bool | 神掌是否已解锁 |
| `buddhaPalmState` | str | IDLE / AIMING / SLAMMING |
| `playerStats` | obj | {hp, score, atk, gold} |
| `fireRate` | float | 射速倍率（默认1.0） |
| `multiShotChance` | int | 多重射击概率% |

---

## 18. 死亡与重开

**`gameOver()` 流程**:
1. 设置 `STATE.gameOverState = true`
2. 所有气球标记为 inactive + invisible
3. 1.5 秒后调用 `restartLevel()`

**`restartLevel()` 流程**:
1. 船血恢复满 `SHIP_MAX_HP = 100`
2. 清除所有气球（`disposeBalloon` 释放几何体/材质）
3. 重置波次生成状态（`waveSpawnRemaining`, `wavePhaseTimer` 等归零）
4. **保留 `waveNumber`**（不清除波次）
5. 0.5 秒后赠送一次抽卡机会（死亡补偿）

---

## 19. 平台适配与已知问题

### 19.1 PICO 4 浏览器兼容

| 问题 | 解决方案 |
|------|----------|
| `navigator.xr.requestSession` 参数不兼容 | 先用 `isSessionSupported()` 检测，失败则用无参回退 |
| ES Module `import *` 语法 Bug (Chrome/105) | **已规避**: 所有模块使用命名导入，game.js/vr.js 使用聚合导出对象 (`GameAPI`, `VrAPI`) |
| CanvasTexture dispose+recreate 黑屏崩溃 | **已规避**: 天空穹顶使用纯色 `MeshBasicMaterial`，不使用动态 CanvasTexture 更新 |
| 大 GLB 加载超时 | Draco 压缩 + `isSessionSupported()` 回退检测延迟 |
| 自动播放策略 | AudioContext 懒加载（首次射击初始化） |

### 19.2 性能优化

| 措施 | 说明 |
|------|------|
| VR 关闭阴影 | `setShadow(false)`，关闭所有 `castShadow` |
| 关闭 toneMapping | `THREE.NoToneMapping`，ACES 最耗 GPU |
| 降采样 | `setPixelRatio(min(DPR, 1.0))` |
| 抗锯齿 | 关闭 WebGL 抗锯齿（VR 头显自带） |
| 对象池 | 子弹(20)、碎片(30)、粒子(50) |
| MeshBasicMaterial | 云朵、星空使用无光照材质 |
| 天空穹顶 | 半球几何体 + 单色材质（替代动态 CanvasTexture） |
| 星空白天关闭 | `visible = false`，不渲染不更新 |
| 调试面板降频 | 每 5 帧更新一次 CanvasTexture |

### 19.3 开发环境

- **本地服务器**: Node.js HTTPS（端口 3443）
- **PICO 访问**: `https://192.168.0.114:3443/`
- **自签名证书**: 浏览器/头显需要手动信任（`generate-certs.js` 生成）
- **模型路径**: `Model/` 目录必须可通过 HTTP 访问

---

## 20. 代码定位速查

| 需要修改 | 搜索关键词 | 所在文件 |
|----------|-----------|---------|
| 天空预设 | `skyPresets` | core.js |
| 天空过渡速度 | `exp(-0.12` | core.js |
| 气球 HP/速度 | `BALLOON_HP` / `BALLOON_SPEED` | core.js |
| 骑士属性 | `KNIGHT_HP` | core.js |
| 神掌全部参数 | `releaseBuddhaPalm` / `enterAimingMode` | game.js |
| 神掌下落时间 | `fallDuration` | game.js |
| 神掌伤害/半径 | `killRadius` / `damage` | game.js |
| 神掌冷却 | `BUDDHA_COOLDOWN` | core.js |
| 瞄准超时 | `AIM_TIMEOUT` | core.js |
| 左手神掌位置 | `palm.position.set(0, -0.08` | game.js |
| 左手神掌旋转 | `palm.rotation.set(-90` | game.js |
| 手枪位置 | `gunInstance.position.set(0, -0.1` | vr.js |
| 枪支缩放 | `AK48_SCALE` | core.js |
| 气球船位置 | `SHIP_POS` | core.js |
| 玩家眼高 (桌面) | `camera.position.set(0, 6.6` | core.js |
| 移动范围 | `BOUND_X` | core.js |
| 解锁神掌关卡 | `buddhaPalmReady` / `waveNumber >= 1` | game.js |
| 星空分布 | `Math.pow(Math.random(), 2.5)` | core.js |
| 左手 UI (神掌) | `updateLeftDebugPanel` | vr.js |
| 右手 UI (战斗) | `updateDebugPanel` | vr.js |
| 分阶段生成配置 | `updateWaveSpawning` | game.js |
| 生成批次大小 | `SPAWN_BATCH_SIZE` | core.js |
| 活跃上限 | `SPAWN_MAX_ACTIVE` | core.js |
| 生成距离 | `SPAWN_DISTANCE` | core.js |
| BGM 音量 | `bgMusicGain.gain.setValueAtTime(0.12` | vr.js |
| 爆炸音效 | `playBalloonPopSound` | vr.js |
| 抽卡系统 | `spawnChoiceCards` / `RARITIES` | game.js |
| 刷新增益 | `generateRandomChoices` | game.js |
| 碎片系统 | `spawnDebris` | game.js |
| 粒子系统 | `spawnParticles` | game.js |
| 模块注入 | `setAudio` / `setVR` | game.js |
| 日志系统 | `__log` | logger.js + core.js |
| 模型加载 | `gltfLoader.load` | vr.js |
| VR 会话 | `enterVR` | index.html |

---

## 21. 给 AI 的提示词模板

```
这是一个 Three.js WebXR VR 射击游戏，模块化架构。
入口文件 index.html 导入 js/core.js, js/game.js, js/vr.js 三个模块。
使用 ES Module 导入 three.module.js，GLB 模型用 Draco 压缩 (CDN: gstatic.com/draco/1.5.6/)。
HTTP 服务器: npx serve -l 3000 -s .
场景层级: Scene → dolly(玩家组) → camera + skyDome + stars + sprites + controllers.
移动: 真实移动 dolly，钳制 X:±2 Z:±4。
天空: day/dusk/night 三预设 30 秒渐变。
气球: 分阶段生成 (0秒前方→15秒左右→30秒后方)，每秒3个，同时不超过10个。
抽卡: 稀有度系统 (普通/稀有/史诗/传说) + 4种属性 (攻击/生命/射速/多重射击)。
如来神掌: 两段式 (握柄①瞄准 握柄②释放)，20倍从头顶20m落下，第0波打完解锁。
音效: 丛林鼓点循环BGM，懒加载 AudioContext。
请阅读 js/core.js, js/game.js, js/vr.js 中的代码和注释来调整。
关键搜索词: "releaseBuddhaPalm" "BALLOON_HP" "SPAWN_BATCH_SIZE" "waveNumber >= 1" "RARITIES"
```

---

## 22. 模型资源

| 模型 | 文件 | 用途 | 加载方式 |
|------|------|------|----------|
| AK48 枪支 | `Model/Ak48.glb` | 玩家主武器 | Draco GLTFLoader，挂载到右手柄/左手柄 |
| 气球船 | `Model/气球船.glb` | 玩家站立场景 | GLTFLoader，添加到 scene |
| 骑士 | `Model/骑士.glb` | 精英敌人 | GLTFLoader，克隆使用 |
| 如来神掌 | `Model/如来神掌.glb` | 大招技能 | GLTFLoader，克隆使用 |
| 火焰 | `Model/火焰.glb` | 预留特效 | 未加载 |
| 鲲鹏 | `Model/鲲鹏.glb` | 预留 | 未加载 |

**模型加载失败处理**: 所有非核心模型（船、骑士、神掌）加载失败时静默跳过。AK48 失败则显示加载错误提示。15 秒加载超时自动隐藏 loading 界面。

---

## 23. GitHub Pages 部署

`github-pages/` 目录包含独立可运行的旧版单文件 `index.html`，用于：
- GitHub Pages 静态托管
- 独立部署，不依赖模块化目录结构
- 包含完整的游戏逻辑和资源路径映射

**部署方式**:
1. 将 `github-pages/` 的内容推送到 GitHub Pages 分支
2. 或复制到 Web 服务器根目录直接使用

---

*文档生成时间: 2026-05-07*
*对应代码版本: js/ 模块化架构 (~2400 行总计)*
