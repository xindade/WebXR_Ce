# WebXR_Ce 项目指南

> 本文档是项目的完整技术白皮书，面向从零开始的 AI 开发者。阅读后可快速理解项目结构、功能实现和修改方式。

---

## 1. 项目概述

**WebXR_Ce** 是一款基于 Three.js + WebXR 的 VR 热气球射击游戏，目标平台为 **PICO 4 VR 头显**（浏览器 Chrome/105）。

玩家站在热气球托盘（气球船）上，使用 AK48 枪支射击从四周涌来的气球敌人，通过波次战斗、抽卡升级、如来神掌大招等机制推进游戏。

- **主文件**: `index.html`（入口）+ `js/core.js` + `js/game.js` + `js/vr.js` + `js/logger.js`（模块化架构，总计约 2400 行）
- **部署**: GitHub Pages（`https://github.com/xindade/WebXR_Ce.git`）
- **测试设备**: PICO 4 VR 头显
- **开发服务器**: Node.js HTTPS，端口 3443，IP `192.168.0.114`，自签名证书

---

## 2. 技术栈

| 层级 | 技术 | 版本/说明 |
|------|------|-----------|
| 3D 引擎 | Three.js | r168，`three.module.js` + `jsm/` addons |
| VR API | WebXR | `immersive-vr` 模式，`local-floor` 参考空间 |
| 模型加载 | GLTFLoader + DRACOLoader | Draco 解码器使用 gstatic CDN (1.5.6) |
| 压缩格式 | Draco | `.glb` 模型经过 Draco 压缩 |
| 音效 | Web Audio API | 纯代码生成，无外部音频文件 |
| 贴图 | CanvasTexture | 运行时生成（笑脸、太阳、月亮、星空、UI 面板） |
| 构建工具 | 无 | 纯前端模块化，无打包工具 |
| 模块加载 | ES Module | 禁用 `import * as` 语法（PICO 4 Chrome/105 兼容性 Bug） |

---

## 3. 文件结构

```
WebXR_Ce/
├── index.html                 # 入口（~388行）: HTML/CSS/VR会话/动画循环
│
├── js/                        # 模块化逻辑代码
│   ├── logger.js              # 独立日志系统（<script> 同步加载，ES Module 之前执行）
│   ├── core.js                # 常量/共享STATE/Three.js核心/灯光/天空/云朵（~548行）
│   ├── game.js                # 战斗系统（子弹/气球/波次/抽卡/神掌/特效，~981行）
│   └── vr.js                  # VR 系统（音效/模型加载/手柄/枪支/UI面板，~499行）
│
├── three.module.js            # Three.js 核心模块
├── jsm/loaders/               # Three.js addons（GLTFLoader、DRACOLoader 等）
├── Model/
│   ├── Ak48.glb               # 玩家手持枪支（Draco 压缩版）
│   ├── 气球船.glb             # 热气球托盘场景模型
│   ├── 骑士.glb               # 骑士气球敌人模型
│   ├── 如来神掌.glb           # 大招技能模型
│   ├── 火焰.glb               # 预留特效
│   └── 鲲鹏.glb               # 预留
├── image/
│   ├── smile.png              # 气球笑脸贴图
│   ├── sun.png                # 太阳精灵贴图（可选，404 则回退 Canvas 生成）
│   ├── moon.png               # 月亮精灵贴图（同上）
│   └── 卡通热气球托盘生成 (3).png  # 场景参考图片
├── draco/                     # Draco WASM 解压器（离线备用）
├── pico-vr-app/               # Capacitor 打包的 PICO Android 原生应用
├── github-pages/              # 独立 GitHub Pages 部署版（旧单文件版本）
├── docs/                      # 打包文档
│   └── 打包指南_Capacitor_Android.html
├── .workbuddy/
│   └── memory/                # AI 工作记忆
├── TECH_README.md             # 技术文档
├── PROJECT_GUIDE.md           # 本文档
└── PROJECT_README.md          # 快速项目概述
```

---

## 4. 核心模块详解

### 4.1 模块间依赖与注入

三个 JS 模块通过 `index.html` 协调：
1. `core.js` — 纯数据 + Three.js 核心（无依赖）
2. `game.js` — 依赖 `core.js`，运行时注入 `vr.js` 音频和 VR 方法
3. `vr.js` — 依赖 `core.js`，导入 `game.js` 的 `shootBullet`

```javascript
// index.html 中初始化：
import { GameAPI as game } from './js/game.js';
import { VrAPI as vr } from './js/vr.js';
game.setAudio(vr);  // 注入音频模块
game.setVR(vr);     // 注入 VR 模块
```

### 4.2 渲染器配置（性能优先）

```javascript
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.0));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;  // 关闭色调映射，减少 GPU 负载
renderer.xr.enabled = true;
```

**关键决策**：
- VR 模式下关闭阴影（`setShadow(false)`），移动端 GPU 瓶颈优化
- 桌面预览模式恢复阴影
- 降采样到 1.0，避免超高分辨率拖慢 PICO

### 4.3 场景层级结构

```
scene
├── dolly (Group)                    # 玩家移动根节点
│   ├── camera (PerspectiveCamera)   # 72° FOV，局部 y=6.6（VR 中由 XR 控制眼高）
│   ├── skyDome (Mesh)               # 纯色天空穹顶（半球，半径60）
│   ├── sunSprite (Sprite)           # 太阳精灵
│   ├── moonSprite (Sprite)          # 月牙精灵
│   ├── starLayers (Points x3)       # 三层星空粒子（80+130+180=390颗）
│   ├── choiceCardGroup (Group)      # 抽卡 UI（3属性卡+1刷新卡）
│   └── promptSprite (Sprite)        # 如来神掌提示文字
├── balloonGroup (Group)             # 气球敌人容器
├── bulletGroup (Group)              # 子弹容器
├── particleGroup (Group)            # 粒子效果容器
├── debrisGroup (Group)              # 碎片效果容器
├── sunLight (DirectionalLight)      # 方向光+阴影
├── ambientLight (AmbientLight)
├── hemiLight (HemisphereLight)
├── shipModel (气球船)               # 热气球场景模型
└── clouds (Group x12)               # 3D 装饰云朵（世界空间固定）
```

### 4.4 玩家与移动系统

- **dolly**: 玩家移动根节点，camera 是其子节点
- **移动方式**: 右摇杆（优先）或左摇杆（右摇杆无输入时回退）
- **移动范围**: `BOUND_X = 2`, `BOUND_Z = 4`，即 X 轴 ±2m，Z 轴 ±4m 的矩形区域
- **移动速度**: `MOVE_SPEED = 3.5` m/s
- **死区**: `DEADZONE = 0.2`
- **PICO 摇杆适配**: `sy = -sy`（前推为负值，需要取反）

### 4.5 射击系统

**子弹对象池**（避免 GC）：
- 池大小: `BULLET_POOL_SIZE = 20`
- 几何体: `SphereGeometry(0.02, 8, 8)` 共享
- 材质: `MeshStandardMaterial` 共享（橙黄发光）
- 速度: `BULLET_SPEED = 15` m/s
- 寿命: `BULLET_LIFE = 2` 秒
- 冷却: `SHOOT_COOLDOWN = 150` ms（受 `fireRate` 修正：`cooldown / max(0.1, fireRate)`）

**发射口位置**: 相对于右手控制器本地坐标 `(0, 0, -0.2)`，即枪口前方 20cm。

**俯仰偏移**: 子弹有固定 `-30°` 下倾（在控制器本地空间计算，避免水平转动串扰）。

**多重射击**: 抽卡获得 `multiShotChance` 后，概率性发射额外子弹（`>=100%` 则必发 1 颗 + 余数再判定）。

**左右手射击**: 
- 右手为默认：`rightController` + `rightTrigger`
- 左手模式：`leftController` + `leftTrigger`（由 `enterVR(true)` 启用）
- 独立冷却计时器 `lastRightShootTime` / `lastLeftShootTime`

### 4.6 气球敌人系统

#### 4.6.1 普通气球

- 几何体: `SphereGeometry(0.5, 16, 16)`
- 生命值: `BALLOON_HP = 100`
- 速度: `BALLOON_SPEED = 0.5` m/s
- 得分: `BALLOON_SCORE = 10`
- 颜色: 从 7 种颜色随机选择，带笑脸贴图
- 行为: 向玩家移动 + 漂浮动画（正弦波）+ 面朝玩家旋转

#### 4.6.2 骑士气球

- 模型: `Model/骑士.glb` 克隆
- 生命值: `KNIGHT_HP = 500`
- 缩放: `KNIGHT_SCALE = 3`
- 得分: `KNIGHT_SCORE = 30`
- 碰撞半径: `KNIGHT_RADIUS = 0.5 * 3 = 1.5`
- 血条: PlaneGeometry 子元素，动态缩放/变色（绿→黄→红）
- 出现条件: 第 0 波起，概率 `min(0.35, 0.08 + waveNumber * 0.025)`

#### 4.6.3 波次生成机制（多阶段）

```
每波生成总数 = WAVE_BASE_SPAWN_COUNT(30) + waveNumber * 5
批次间隔     = 1.0 秒
每批数量     = 3 个
场景上限     = 10 个同时存在
生成距离     = 15 米（玩家前方）
散布范围     = 8 米
```

**阶段递进**（按 wavePhaseTimer）：
- 阶段 1（0~15 秒）：仅前方生成
- 阶段 2（15~30 秒）：前方 + 左右生成
- 阶段 3（30 秒+）：全方向生成（+后方）

### 4.7 碰撞系统

#### 4.7.1 气球-气球排斥（防止重叠）

- 算法: O(n²) 双重循环，距离平方比较
- 排斥力: `BALLOON_REPEL_FORCE = 3.0`
- Y 轴排斥较弱（`0.3` 倍），避免气球飘得太高

#### 4.7.2 气球-船碰撞（防止穿模）

- 船碰撞中心: `shipModel.position + (0, 1.0, 0)`
- 船碰撞半径: `SHIP_COLLISION_RADIUS = 2.5`
- 排斥力: `SHIP_REPEL_FORCE = 2.0`
- 仅推水平方向（X/Z），保留 Y 轴移动

#### 4.7.3 子弹-气球碰撞

- 检测半径: `balloon.radius + 0.05`
- 伤害: `STATE.playerStats.atk`（默认 30，抽卡可升级）
- 击中闪烁: 普通气球 `emissiveIntensity` 临时提升到 0.5

#### 4.7.4 气球撞船伤害

- 触发条件: 气球进入 `|x| <= 2, |z| <= 4` 的活动区域
- 伤害: `BALLOON_DAMAGE = 5` 每气球
- 效果: 气球爆炸 + 船闪烁 + 音效 + 碎片/粒子
- 船血 <= 0 触发 `gameOver()`

### 4.8 抽卡系统（稀有度版）

**触发**: 清空当前波次所有气球后自动生成。

**属性类型**（4种）：
1. ⚔️ 攻击力 (atk) — 固定数值
2. ❤️ 生命值 (hp) — 固定数值
3. 🎯 射速 (fireRate) — 百分比加成
4. 🔫 多重射击 (multiShot) — 概率百分比

**稀有度**（4级，随机）：
| 稀有度 | 数值 | 颜色 |
|--------|:----:|------|
| 普通 | 10 | 白色 |
| 稀有 | 20 | 蓝色 |
| 史诗 | 50 | 紫色 |
| 传说 | 100 | 金色 |

**刷新机制**: 触碰下方绿色刷新卡，花费 `10 * 2^次数` 金币，有 2 秒冷却。

**交互方式**: 左手柄靠近选择卡（距离 < 0.4m）自动选中。

**位置**: 玩家前方 1.5m，眼高略偏下，横向排列间距 0.55m。

**超时保护**: 15 秒未选择自动跳过。

**坐标系**: 挂在 `dolly` 下，使用 dolly 局部坐标计算，保证 VR 中始终面朝玩家。

### 4.9 如来神掌大招系统

**解锁条件**: 打完第 0 波（`waveNumber >= 1`）后解锁。

**状态机**: `IDLE → AIMING → SLAMMING → IDLE(冷却)`

**操作**: 左手握柄侧键（grip）两段式触发
- 第一段（IDLE → AIMING）：锁定当前朝向，生成 2x 预览神掌在 `(0, 0.5, -4)`
- 第二段（AIMING → SLAMMING）：释放 20x 神掌
- 超时：5 秒自动释放

**数值**:
- 预览大小: 2x
- 释放大小: 20x
- 下落时间: 0.5 秒
- 碰撞半径: 10 米
- 伤害: 1000
- 冷却: 8 秒

**左手 UI**: 翻腕显示战斗面板（船血/金币/冷却%），瞄准模式只显示大倒计时数字（金色 180px，黑描边）。

### 4.10 死亡与重开机制

**死亡条件**: `shipHp <= 0`

**gameOver() 流程**:
1. 设置 `gameOverState = true`
2. 清除所有活跃气球（置为 inactive）
3. 1.5 秒后调用 `restartLevel()`

**restartLevel() 流程**:
1. 船血恢复满 `SHIP_MAX_HP = 100`
2. 清除所有气球（`disposeBalloon` 释放几何体/材质）
3. 重置波次生成状态（但 **保留 waveNumber**）
4. 0.5 秒后赠送一次抽卡机会

> 关键设计：**不清除波次**，玩家在当前波次重新挑战，但获得一次免费抽卡作为补偿。

### 4.11 特效系统

#### 4.11.1 碎片系统（对象池）

- 池大小: `DEBRIS_COUNT = 30`
- 几何体: `TetrahedronGeometry(0.04, 0)` 共享
- 生命周期: `DEBRIS_LIFE = 0.8` 秒
- 物理: 重力 `-4.0` m/s² + 空气阻力 `0.98`
- 旋转: 随机三轴角速度

#### 4.11.2 粒子系统（对象池）

- 池大小: `PARTICLE_COUNT = 50`
- 几何体: `SphereGeometry(0.01, 4, 4)` 各实例独立（可不同颜色）
- 生命周期: `PARTICLE_LIFE = 1.0` 秒
- 运动: 随机方向速度 + 阻尼 `0.98`

### 4.12 天空系统（日夜黄昏）

**三种预设**: day / dusk / night

**过渡方式**: 指数缓动 `ease = 1 - exp(-0.12 * dt)`，约 30 秒完成 95% 过渡。

**可切换属性**:
- 背景色 / 雾色 / 雾距
- 天空穹顶色
- 环境光色与强度
- 太阳光色、强度、位置
- 半球光色与强度
- 星空透明度
- 太阳/月亮仰角与方位角

**太阳/月亮**: Canvas 纹理精灵，支持外部 `image/sun.png` / `image/moon.png` 覆盖。

**星空**: 三层 Points（80 + 130 + 180 = 390 颗），AdditiveBlending，幂函数分布（头顶密、地平线疏），闪烁 + 缓慢旋转。白天关闭（`visible = false`）节省性能。

**切换方式**:
- 桌面: 顶部按钮
- VR: 左手 X/Y 键循环切换

### 4.13 音效系统

全部使用 Web Audio API 代码生成，无外部音频文件。

**射击音效**: 白噪声 + 指数衰减 + 低通滤波（3000Hz）

**气球爆裂**: 方波上行滑音 200→800Hz，0.3s（吃豆人得分风格）

**背景音乐**: 预渲染的 4 秒循环缓冲（OfflineAudioContext）
- 16 分鼓点（lowpass 噪声）
- 木琴旋律（sine 波）
- 音量: 0.12

**AudioContext 初始化策略**: 首次射击时 `initAudio()` 懒加载，避免自动播放策略拦截。

### 4.14 UI 系统

#### 4.14.1 右手腕调试面板（翻腕可见）

- 显示内容:
  - ⚔️ 攻击 `playerStats.atk`
  - 🎯 射速 `fireRate.toFixed(1)x`
  - 🔫 多重 `multiShotChance%`
  - 💥 范围 `explosionRadius`
  - 🏆 得分 `playerStats.score`
- 更新频率: 每 5 帧

#### 4.14.2 左手腕面板（翻腕可见）

- 默认: 船血/金币/神掌状态/冷却百分比
- AIMING: 超大金色倒计时数字（180px，黑描边）
- 抽卡中: 选择提示 + 刷新状态

#### 4.14.3 2D 页面 UI

- `#loading`: 加载动画 + 模型进度百分比
- `#js-status`: 右上角 JS 执行状态指示器
- `#vr-entry`: 两个进入 VR 按钮（正常模式 / 左手持枪模式）
- `#time-switch`: 天空切换按钮（桌面）
- `#sky-hint`: 天空切换提示
- `#log-panel`: 左侧诊断日志面板（42vw × 100vh）

---

## 5. 关键配置参数速查

### 5.1 游戏逻辑

| 参数 | 值 | 说明 |
|------|:---:|------|
| `SHIP_MAX_HP` | 100 | 船最大生命 |
| `BALLOON_DAMAGE` | 5 | 气球撞船伤害 |
| `SHIP_COLLISION_RADIUS` | 2.5 | 船碰撞半径 |
| `SHIP_REPEL_FORCE` | 2.0 | 船排斥强度 |
| `BALLOON_REPEL_FORCE` | 3.0 | 气球互斥强度 |
| `WAVE_BASE_SPAWN_COUNT` | 30 | 每波基础生成总数 |
| `SPAWN_MAX_ACTIVE` | 10 | 同屏活跃上限 |
| `SPAWN_BATCH_SIZE` | 3 | 每批生成数量 |

### 5.2 战斗参数

| 参数 | 值 | 说明 |
|------|:---:|------|
| `BALLON_HP` | 100 | 普通气球生命 |
| `BALLOON_SPEED` | 0.5 | 移动速度 (m/s) |
| `KNIGHT_HP` | 500 | 骑士生命 |
| `KNIGHT_SCALE` | 3 | 模型缩放 |
| `BULLET_SPEED` | 15 | 子弹速度 (m/s) |
| `SHOOT_COOLDOWN` | 150 | 射击冷却 (ms) |
| `BALLOON_SCORE` | 10 | 气球得分 |
| `KNIGHT_SCORE` | 30 | 骑士得分 |

### 5.3 如来神掌

| 参数 | 值 | 说明 |
|------|:---:|------|
| `BUDDHA_COOLDOWN` | 8 | 冷却 (s) |
| `AIM_TIMEOUT` | 5 | 瞄准超时 (s) |
| `previewPalm scale` | 2.0 | 预览大小 |
| `release palm scale` | 20.0 | 释放大小 |
| `killRadius` | 10 | 碰撞半径 (m) |
| `damage` | 1000 | 伤害 |
| `fallDuration` | 0.5 | 下落时间 (s) |

### 5.4 AK48

| 参数 | 值 | 说明 |
|------|:---:|------|
| `AK48_SCALE` | 0.6 | 整体缩放 |
| 右手位置 | (0, -0.1, 0.01) | 相对右手柄 |
| 右手旋转 | x=-20, y=π/2 | 弧度 |
| 左手镜像 | scale.x = -AK48_SCALE | X 轴翻转 |

### 5.5 气球船

| 参数 | 值 | 说明 |
|------|:---:|------|
| `SHIP_SCALE` | 7.0 | 模型缩放 |
| `SHIP_POS` | [1, 1, 0.05] | 世界坐标 |
| `SHIP_ROT` | [0, 1.57, 0] | 弧度（Y 轴 90°） |
| `SHIP_MAX_HP` | 100 | 最大生命 |

---

## 6. 3D 模型资源

| 模型 | 文件 | 用途 | 加载方式 |
|------|------|------|----------|
| AK48 枪支 | `Model/Ak48.glb` | 玩家主武器 | Draco GLTFLoader，挂载到右手柄/左手柄 |
| 气球船 | `Model/气球船.glb` | 玩家站立场景 | GLTFLoader，添加到 scene |
| 骑士 | `Model/骑士.glb` | 精英敌人 | GLTFLoader，克隆使用 |
| 如来神掌 | `Model/如来神掌.glb` | 大招技能 | GLTFLoader，克隆使用 |
| 火焰 | `Model/火焰.glb` | 预留特效 | 未加载 |
| 鲲鹏 | `Model/鲲鹏.glb` | 预留 | 未加载 |

**模型加载失败处理**: 所有非核心模型加载失败时静默跳过，不影响游戏进行。AK48 失败则显示加载错误提示。15 秒加载超时自动隐藏 loading 界面。

---

## 7. 游戏状态机

```
[桌面预览] --点击"正常开始游戏"--> [VR 会话初始化]
                                        |
                                        v
[sessionstart 事件]
    | initAudio() / attachAK48()
    | 500ms → spawnBalloons()
    v
[波次 0] ← 分阶段生成 ← [战斗中]
    |                           |
    | 清空气球 + 抽卡            | 气球撞船扣血
    v                           v
[抽卡: 3属性+1刷新]          [shipHp ≤ 0]
    | 触碰选择 / 15s超时          | gameOver()
    v                           v
[waveNumber++]               [1.5s → restartLevel]
    | 解锁神掌 (if wave>=1)      | 保留 waveNumber
    | 1s → spawnBalloons()       | 赠送抽卡
    v                           v
[波次+N] ←──────────────→ [重新挑战]
```

**关键状态变量**（`STATE` 对象）:
- `gameStarted`: 是否已开始战斗
- `gameOverState`: 是否处于死亡处理中
- `waveNumber`: 当前波次（0-based）
- `shipHp`: 船当前血量
- `choiceCardsActive`: 是否正在显示选择卡
- `buddhaPalmReady`: 大招是否已解锁
- `buddhaPalmState`: IDLE / AIMING / SLAMMING
- `playerStats`: {hp, score, atk, gold}
- `fireRate`: 射速倍率（默认1.0）
- `multiShotChance`: 多重射击概率%

---

## 8. 输入映射（PICO 4 手柄）

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
| Grip (buttons[1]) | 两段式：第一段瞄准/第二段释放神掌；按住显示手腕面板 |
| Stick (axes[2]/[3]) | 移动（右摇杆无输入时回退） |
| Button X (buttons[4]) | 天空循环切换 (+1) |
| Button Y (buttons[5]) | 天空循环切换 (-1) |

**Gamepad 轴索引**: PICO 4 使用 `axes[2]` / `axes[3]` 作为右摇杆（部分设备回退到 `axes[0]` / `axes[1]`）。

---

## 9. 平台适配与已知问题

### 9.1 PICO 4 浏览器兼容

| 问题 | 解决方案 |
|------|----------|
| `navigator.xr.requestSession` 参数不兼容 | 先用 `isSessionSupported()` 检测，失败则用无参回退 |
| ES Module `import *` 语法 Bug (Chrome/105) | **已规避**：所有模块使用命名导入，game.js/vr.js 使用聚合导出对象 |
| CanvasTexture dispose+recreate 黑屏崩溃 | **已规避**：天空穹顶使用纯色 `MeshBasicMaterial`，不使用动态 CanvasTexture 更新 |
| 大 GLB 加载超时 | Draco 压缩 + `isSessionSupported()` 回退检测延迟 |
| 自动播放策略 | AudioContext 懒加载（首次射击初始化） |

### 9.2 性能优化

| 措施 | 说明 |
|------|------|
| VR 关闭阴影 | `setShadow(false)`，关闭所有 `castShadow` |
| 关闭 toneMapping | `THREE.NoToneMapping`，ACES 最耗 GPU |
| 降采样 | `setPixelRatio(min(DPR, 1.0))` |
| 对象池 | 子弹(20)、碎片(30)、粒子(50) |
| MeshBasicMaterial | 云朵、星空使用无光照材质 |
| 星空白天关闭 | `visible = false`，不渲染不更新 |
| 调试面板降频 | 每 5 帧更新一次 CanvasTexture |

### 9.3 开发环境

- **本地服务器**: Node.js HTTPS（端口 3443）
- **PICO 访问**: `https://192.168.0.114:3443/`
- **自签名证书**: `node generate-certs.js` 生成
- **模型路径**: `Model/` 目录必须可通过 HTTP 访问

---

## 10. 修改指南

### 10.1 调整游戏难度

在 `js/core.js` 中修改：
```javascript
const WAVE_BASE_SPAWN_COUNT = 40;   // 增加每波数量
const SPAWN_BATCH_SIZE = 5;         // 每批更多
const SPAWN_MAX_ACTIVE = 15;        // 同屏更多
const BALLOON_SPEED = 0.8;          // 更快的敌人
const SHIP_MAX_HP = 80;             // 更少的玩家血量
```

### 10.2 新增抽卡属性

在 `js/game.js` 的 `ATTR_TYPES` 数组中添加新对象：
```javascript
{ id: 'newAttr', label: '新能力', icon: '⭐',
  apply: (v) => { STATE.newAttr += v; },
  formatValue: (v) => `+${v}` }
```

### 10.3 调整天空颜色

修改 `js/core.js` 中 `skyPresets` 对应预设的颜色值（Hex 整数）。

### 10.4 新增模型

1. 将 `.glb` 放入 `Model/` 目录
2. 在 `js/vr.js` 中添加 `gltfLoader.load()` 调用
3. 加载到场景或控制器

---

## 11. 日志系统（诊断用）

左侧绿色日志面板 `#log-panel` 提供完整的运行时诊断：

| 级别 | 颜色 | 用途 |
|:----:|:----:|------|
| s | ✅ 绿色 | 成功/就绪状态 |
| i | 🔹 蓝色 | 普通信息 |
| w | ⚠️ 黄色 | 警告（如加载超时） |
| e | ❌ 红色 | 错误（VR 失败、模型失败、animate 崩溃） |

**独立于 Three.js 的日志刷新**: `logger.js` 在 ES Module 之前加载，通过 `<script>` 标签同步执行，即使模块加载失败也能捕获全局错误并显示。

---

## 12. Git 工作流

```bash
# Git 路径
E:\01_AI\WebXR_Ce\PortableGit\cmd\git.exe

# 常用命令
git pull --rebase
git add .
git commit -m "feat: xxx"
git push

# 远程仓库
https://github.com/xindade/WebXR_Ce.git

# 注意：推送前需用户确认
```

---

## 13. 术语表

| 术语 | 含义 |
|------|------|
| dolly | Three.js 中承载 camera 的移动根 Group |
| grip | VR 手柄握柄侧键（buttons[1]） |
| Draco | Google 的 3D 几何压缩库 |
| 对象池 | 预创建对象、循环使用，避免 new/delete GC |
| 抽卡 | 波次奖励系统，4属性×4稀有度升级 |
| 如来神掌 | 解锁大招，巨大手掌从空中落下清屏 |
| 骑士 | 精英气球敌人，更大更硬带血条 |
| shipHp | 气球船的当前血量（撞船扣血规则） |

---

*文档生成时间: 2026-05-07*
*对应代码版本: js/ 模块化架构*
