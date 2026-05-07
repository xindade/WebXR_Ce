# WebXR_Ce 项目指南

> 本文档是项目的完整技术白皮书，面向从零开始的 AI 开发者。阅读后可快速理解项目结构、功能实现和修改方式。

---

## 1. 项目概述

**WebXR_Ce** 是一款基于 Three.js + WebXR 的 VR 热气球射击游戏，目标平台为 **PICO 4 VR 头显**（浏览器 Chrome/105）。

玩家站在热气球托盘（气球船）上，使用 AK48 枪支射击从四周涌来的气球敌人，通过波次战斗、抽卡升级、如来神掌大招等机制推进游戏。

- **主文件**: `index.html`（单文件架构，约 2674 行）
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
| 构建工具 | 无 | 纯前端单文件，无打包工具 |

---

## 3. 文件结构

```
WebXR_Ce/
├── index.html              # 主游戏文件（唯一源代码文件）
├── three.module.js         # Three.js 核心模块
├── jsm/                    # Three.js addons（GLTFLoader、DRACOLoader 等）
├── Model/
│   ├── Ak48.glb            # 玩家手持枪支（Draco 压缩版）
│   ├── 气球船.glb          # 热气球托盘场景模型
│   ├── 骑士.glb            # 骑士气球敌人模型
│   └── 如来神掌.glb        # 大招技能模型
├── image/
│   ├── smile.png           # 气球笑脸贴图
│   ├── sun.png             # 太阳精灵贴图（可选，404 则回退 Canvas 生成）
│   ├── moon.png            # 月亮精灵贴图（同上）
│   └── 卡通热气球托盘生成 (3).png  # 场景相关
├── pico-vr-app/            # Capacitor 打包的 PICO Android 原生应用
│   ├── www/                # Web 资源
│   └── android/            # Android 原生项目
└── .workbuddy/
    └── memory/             # AI 工作记忆
```

---

## 4. 核心模块详解

### 4.1 渲染器配置（性能优先）

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

### 4.2 场景层级结构

```
scene
├── dolly (Group)                    # 玩家移动根节点
│   ├── camera (PerspectiveCamera)   # 眼高 6.6（世界坐标），VR 中 1.6（dolly 局部）
│   ├── skyDome (Mesh)               # 纯色天空穹顶
│   ├── sunSprite (Sprite)           # 太阳/月亮精灵
│   ├── moonSprite (Sprite)
│   ├── starLayers (Points x3)       # 三层星空粒子
│   ├── choiceCardGroup (Group)      # 抽卡 UI（跟随玩家）
│   └── promptSprite (Sprite)        # 如来神掌提示文字
├── balloonGroup (Group)             # 气球敌人容器
├── bulletGroup (Group)              # 子弹容器
├── particleGroup (Group)            # 粒子效果容器
├── debrisGroup (Group)              # 碎片效果容器
├── sunLight (DirectionalLight)      # 方向光+阴影
├── ambientLight (AmbientLight)
├── hemiLight (HemisphereLight)
└── clouds (Group x12)               # 装饰云朵
```

### 4.3 玩家与移动系统

- **dolly**: 玩家移动根节点，camera 是其子节点，camera 本地位置 `(0, 6.6, 0)`
- **移动方式**: 右摇杆（优先）或左摇杆（右摇杆无输入时回退）
- **移动范围**: `BOUND_X = 2`, `BOUND_Z = 4`，即 X 轴 ±2m，Z 轴 ±4m 的矩形区域
- **移动速度**: `MOVE_SPEED = 3.5` m/s
- **死区**: `DEADZONE = 0.2`
- **PICO 摇杆适配**: `sy = -sy`（前推为负值，需要取反）

### 4.4 射击系统

**子弹对象池**（避免 GC）：
- 池大小: `BULLET_POOL_SIZE = 20`
- 几何体: `SphereGeometry(0.02, 8, 8)` 共享
- 材质: `MeshStandardMaterial` 共享（橙黄发光）
- 速度: `BULLET_SPEED = 15` m/s
- 寿命: `BULLET_LIFE = 2` 秒
- 冷却: `SHOOT_COOLDOWN = 150` ms

**发射口位置**: 相对于右手控制器本地坐标 `(0, 0, -0.2)`，即枪口前方 20cm。

**俯仰偏移**: 子弹有固定 `-30°` 下倾（在控制器本地空间计算，避免水平转动串扰）。

**双发子弹**: 抽卡获得 `extraBulletEnabled = true` 后，每次射击间隔 50ms 发射第二颗。

**左右手射击**: 
- 右手（默认）：`rightController` + `rightTrigger`
- 左手（左手持枪模式）：`leftController` + `leftTrigger`
- 独立冷却计时器 `lastRightShootTime` / `lastLeftShootTime`

### 4.5 气球敌人系统

#### 4.5.1 普通气球

- 几何体: `SphereGeometry(0.5, 16, 16)`
- 生命值: `BALLOON_HP = 100`
- 速度: `BALLOON_SPEED = 0.5` m/s
- 得分: `BALLOON_SCORE = 10`
- 颜色: 从 7 种颜色随机选择，带笑脸贴图
- 行为: 向玩家移动 + 漂浮动画（正弦波）+ 面朝玩家旋转

#### 4.5.2 骑士气球

- 模型: `Model/骑士.glb` 克隆
- 生命值: `KNIGHT_HP = 500`
- 缩放: `KNIGHT_SCALE = 3`
- 得分: `KNIGHT_SCORE = 30`
- 碰撞半径: `KNIGHT_RADIUS = 0.5 * 3 = 1.5`
- 出现条件: 第 1 波起，概率 `min(0.35, 0.08 + waveNumber * 0.025)`

#### 4.5.3 波次生成机制（多阶段）

```
每波生成总数 = WAVE_BASE_SPAWN_COUNT(30) + waveNumber * 5
批次间隔    = 1.0 秒
每批数量    = 3 个
场景上限    = 10 个同时存在
生成距离    = 15 米（玩家前方）
散布范围    = 8 米
```

**阶段递进**（按 wavePhaseTimer）：
- 阶段 1（0~15 秒）：仅前方生成
- 阶段 2（15~30 秒）：前方 + 左右生成
- 阶段 3（30 秒+）：全方向生成（+后方）

### 4.6 碰撞系统

#### 4.6.1 气球-气球排斥（防止重叠）

- 算法: O(n²) 双重循环，距离平方比较
- 排斥力: `BALLOON_REPEL_FORCE = 3.0`
- Y 轴排斥较弱（`0.3` 倍），避免气球飘得太高

#### 4.6.2 气球-船碰撞（防止穿模）

- 船碰撞中心: `shipModel.position + (0, 1.0, 0)`
- 船碰撞半径: `SHIP_COLLISION_RADIUS = 2.5`
- 排斥力: `SHIP_REPEL_FORCE = 2.0`
- 仅推水平方向（X/Z），保留 Y 轴移动

#### 4.6.3 子弹-气球碰撞

- 检测半径: `balloon.radius + 0.05`
- 伤害: `playerStats.atk`（默认 30，抽卡可升级）
- 击中闪烁: `emissiveIntensity` 临时提升到 0.5

#### 4.6.4 气球撞船伤害

- 触发条件: 气球进入 `|x| <= 2, |z| <= 4` 的活动区域
- 伤害: `BALLOON_DAMAGE = 5` 每气球
- 效果: 气球爆炸 + 船闪烁 + 音效 + 碎片/粒子
- 船血 <= 0 触发 `gameOver()`

### 4.7 抽卡系统（选择卡）

**触发**: 清空当前波次所有气球后自动生成。

**三张卡选项**（固定）：
1. 生命值+100（红色）
2. 攻击力+20（橙色）
3. 多一发子弹（蓝色）

**交互方式**: 左手柄靠近选择卡（距离 < 0.4m）自动选中。

**位置**: 玩家前方 1.5m，眼高略偏下，横向排列间距 0.55m。

**超时保护**: 10 秒未选择自动跳过。

**坐标系**: 挂在 `dolly` 下，使用 dolly 局部坐标计算，保证 VR 中始终面朝玩家。

### 4.8 如来神掌大招系统

**解锁条件**: 打完第 1 波（`waveNumber >= 1`）后解锁。

**状态机**: `IDLE → AIMING → SLAMMING → IDLE(冷却)`

**操作**: 左手握柄侧键（grip）两段式触发
- 第一段（IDLE → AIMING）：升空瞄准，锁定当前朝向，前方生成预览神掌
- 第二段（AIMING → SLAMMING）：释放神掌
- 超时：5 秒自动释放

**数值**:
- 预览大小: 2x
- 释放大小: 20x
- 下落时间: 0.5 秒
- 碰撞半径: 10 米
- 伤害: 1000
- 冷却: 8 秒

**左手 UI**: 翻腕显示倒计时大数字（金色 180px，无框），瞄准模式只显示倒计时。

### 4.9 死亡与重开机制

**死亡条件**: `shipHp <= 0`

**gameOver() 流程**:
1. 设置 `gameOverState = true`
2. 清除所有活跃气球
3. 1.5 秒后调用 `restartLevel()`

**restartLevel() 流程**:
1. 船血恢复满 `SHIP_MAX_HP = 100`
2. 清除所有气球（`disposeBalloon` 释放几何体/材质）
3. 重置波次生成状态（但 **保留 `waveNumber`**）
4. 0.5 秒后赠送一次抽卡机会

> 关键设计：**不清除波次**，玩家在当前波次重新挑战，但获得一次免费抽卡作为补偿。

### 4.10 特效系统

#### 4.10.1 碎片系统（对象池）

- 池大小: `DEBRIS_COUNT = 30`
- 几何体: `TetrahedronGeometry(0.04, 0)` 共享
- 生命周期: `DEBRIS_LIFE = 0.8` 秒
- 物理: 重力 `-4.0` m/s² + 空气阻力 `0.98`
- 旋转: 随机三轴角速度

#### 4.10.2 粒子系统（对象池）

- 池大小: `PARTICLE_COUNT = 50`
- 几何体: `SphereGeometry(0.01, 4, 4)` 各实例独立（可不同颜色）
- 生命周期: `PARTICLE_LIFE = 1.0` 秒
- 运动: 随机方向速度 + 阻尼 `0.98`

### 4.11 天空系统（日夜黄昏）

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

### 4.12 音效系统

全部使用 Web Audio API 代码生成，无外部音频文件。

**射击音效**: 白噪声 + 指数衰减 + 低通滤波（3000Hz）

**气球爆裂**: 方波上行滑音 200→800Hz，0.3s（吃豆人得分风格）

**背景音乐**: 预渲染的 4 秒循环缓冲（OfflineAudioContext）
- 16 分鼓点（lowpass 噪声）
- 木琴旋律（sine 波）
- 音量: 0.12

**AudioContext 初始化策略**: 首次射击时 `initAudio()` 懒加载，避免自动播放策略拦截。

### 4.13 UI 系统

#### 4.13.1 右手腕调试面板（翻腕可见）

- 触发: 右手 grip 键按住
- 显示内容:
  - 船血 `shipHp/SHIP_MAX_HP`
  - 得分 `playerStats.score`
  - 攻击 `playerStats.atk`
  - 气球数 `active/SPAWN_MAX_ACTIVE`，剩余 `waveSpawnRemaining`
  - 双弹状态
  - 波次与阶段
- 更新频率: 每 5 帧

#### 4.13.2 左手腕面板（翻腕可见）

- 触发: 左手 grip 键按住
- 正常模式: 如来神掌状态（解锁/冷却/可释放）
- 瞄准模式: 超大倒计时数字（180px 金色，黑色描边）

#### 4.13.3 2D 页面 UI

- `#loading`: 加载动画 + 模型进度百分比
- `#vr-entry`: 两个进入 VR 按钮（正常模式 / 左手持枪模式）
- `#time-switch`: 天空切换按钮（桌面）
- `#sky-hint`: 天空切换提示

---

## 5. 关键配置参数速查

### 5.1 移动与操作

| 参数 | 值 | 说明 |
|------|-----|------|
| `MOVE_SPEED` | 3.5 | 摇杆移动速度 (m/s) |
| `DEADZONE` | 0.2 | 摇杆死区 |
| `BOUND_X` | 2 | X 轴移动边界 ±2m |
| `BOUND_Z` | 4 | Z 轴移动边界 ±4m |
| `SHOOT_COOLDOWN` | 150 | 射击冷却 (ms) |

### 5.2 子弹

| 参数 | 值 | 说明 |
|------|-----|------|
| `BULLET_SPEED` | 15 | 子弹速度 (m/s) |
| `BULLET_LIFE` | 2 | 子弹存活时间 (s) |
| `BULLET_POOL_SIZE` | 20 | 子弹对象池大小 |
| `bulletPitch` | -30° | 固定下倾角 |

### 5.3 气球

| 参数 | 值 | 说明 |
|------|-----|------|
| `BALLOON_COUNT` | 10 | 初始场景上限 |
| `SPAWN_MAX_ACTIVE` | 10 | 同屏活跃上限 |
| `SPAWN_BATCH_SIZE` | 3 | 每批生成数量 |
| `SPAWN_BATCH_INTERVAL` | 1.0 | 批次间隔 (s) |
| `WAVE_BASE_SPAWN_COUNT` | 30 | 每波基础生成总数 |
| `BALLOON_HP` | 100 | 普通气球生命 |
| `BALLOON_SPEED` | 0.5 | 移动速度 (m/s) |
| `BALLOON_RADIUS` | 0.5 | 碰撞半径 (m) |
| `BALLOON_DAMAGE` | 5 | 撞船伤害 |
| `BULLET_DAMAGE` / `playerStats.atk` | 30 | 子弹伤害 |

### 5.4 骑士

| 参数 | 值 | 说明 |
|------|-----|------|
| `KNIGHT_HP` | 500 | 骑士生命 |
| `KNIGHT_SCALE` | 3 | 模型缩放 |
| `KNIGHT_SCORE` | 30 | 击杀得分 |

### 5.5 碰撞

| 参数 | 值 | 说明 |
|------|-----|------|
| `SHIP_COLLISION_RADIUS` | 2.5 | 船碰撞半径 |
| `BALLOON_REPEL_FORCE` | 3.0 | 气球互斥强度 |
| `SHIP_REPEL_FORCE` | 2.0 | 船排斥强度 |

### 5.6 如来神掌

| 参数 | 值 | 说明 |
|------|-----|------|
| `BUDDHA_COOLDOWN` | 8 | 冷却 (s) |
| `AIM_TIMEOUT` | 5 | 瞄准超时 (s) |
| `previewPalm scale` | 2.0 | 预览大小 |
| `release palm scale` | 20.0 | 释放大小 |
| `killRadius` | 10 | 碰撞半径 (m) |
| `damage` | 1000 | 伤害 |
| `fallDuration` | 0.5 | 下落时间 (s) |

### 5.7 AK48 枪支

| 参数 | 值 | 说明 |
|------|-----|------|
| `AK48_SCALE` | 0.6 | 整体缩放 |
| 右手位置 | (0, -0.1, 0.01) | 相对右手柄 |
| 右手旋转 | x=-20, y=π/2 | 弧度 |
| 左手位置 | (0, -0.1, 0.01) | 相对左手柄 |
| 左手旋转 | x=-20, y=-π/2 | 弧度 |
| 左手缩放 | (-0.6, 0.6, 0.6) | X 镜像翻转 |

### 5.8 气球船

| 参数 | 值 | 说明 |
|------|-----|------|
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

**模型加载失败处理**: 所有非核心模型（船、骑士、神掌）加载失败时静默跳过，不影响游戏进行。AK48 失败则显示加载错误提示。

---

## 7. 游戏状态机

```
[桌面预览] --点击"开始游戏"--> [VR 会话初始化]
                                    |
                                    v
[游戏开始] <--sessionstart-- [VR 模式]
    | gameStarted = true
    v
[波次 0] --spawnBalloons()--> [战斗中]
    | 气球撞船
    v
[gameOver] --1.5s--> [restartLevel]
    | 保留 waveNumber
    v
[赠送抽卡] --选择后--> [波次+1] --spawnBalloons()--> [战斗中]
    ^                                              |
    |__________清空气球 & waveSpawnRemaining=0_____|
```

**关键状态变量**:
- `gameStarted`: 是否已开始战斗
- `gameOverState`: 是否处于死亡处理中
- `waveNumber`: 当前波次（0-based）
- `shipHp`: 船当前血量
- `choiceCardsActive`: 是否正在显示选择卡
- `buddhaPalmReady`: 大招是否已解锁
- `buddhaPalmState`: IDLE / AIMING / SLAMMING

---

## 8. 输入映射（PICO 4 手柄）

### 右手
| 输入 | 功能 |
|------|------|
| Trigger (buttons[0]) | 射击 |
| Grip (buttons[1]) | 按住显示手腕调试面板 |
| Stick | 移动（优先） |
| Button A (buttons[4]) | 退出 VR |
| Button B (buttons[5]) | 退出 VR |

### 左手
| 输入 | 功能 |
|------|------|
| Trigger (buttons[0]) | 左手射击（左手持枪模式） |
| Grip (buttons[1]) | 两段式：第一段瞄准/第二段释放神掌；按住显示手腕面板 |
| Stick | 移动（右摇杆无输入时回退） |
| Button X (buttons[4]) | 天空循环切换 (+1) |
| Button Y (buttons[5]) | 天空循环切换 (-1) |

**Gamepad 轴索引**: PICO 4 使用 `axes[2]` / `axes[3]` 作为右摇杆（部分设备回退到 `axes[0]` / `axes[1]`）。

---

## 9. 平台适配与已知问题

### 9.1 PICO 4 浏览器兼容

| 问题 | 解决方案 |
|------|----------|
| `navigator.xr.requestSession` 参数不兼容 | 先用 `isSessionSupported()` 检测，失败则用无参回退 |
| ES Module `import *` 语法 Bug (Chrome/105) | 代码中未使用命名空间导入冲突语法 |
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
- **自签名证书**: 浏览器/头显需要手动信任
- **模型路径**: `Model/` 目录必须可通过 HTTP 访问

---

## 10. 修改指南

### 10.1 调整游戏难度

```javascript
// 更难的波次
const WAVE_BASE_SPAWN_COUNT = 40;   // 增加每波数量
const SPAWN_BATCH_SIZE = 5;         // 每批更多
const SPAWN_MAX_ACTIVE = 15;        // 同屏更多

// 更快的敌人
const BALLOON_SPEED = 0.8;

// 更少的玩家血量
const SHIP_MAX_HP = 80;
```

### 10.2 新增抽卡选项

在 `choiceOptions` 数组中添加新对象：

```javascript
{
    label: '新能力',
    color: { r: 0, g: 255, b: 0 },
    effect: () => { /* 实现效果 */ }
}
```

### 10.3 调整天空颜色

修改 `skyPresets` 中对应预设的颜色值（Hex 整数）。

### 10.4 新增模型

1. 将 `.glb` 放入 `Model/` 目录
2. 使用 `gltfLoader.load()` 加载
3. 在 `onload` 回调中 `scene.add()` 或附加到控制器
4. 处理加载失败（静默跳过或降级）

### 10.5 修改子弹参数

搜索代码中的 `子弹参数速查表` 注释区块，所有可调参数集中在此附近。

---

## 11. Git 工作流

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
```

---

## 12. 术语表

| 术语 | 含义 |
|------|------|
| dolly | Three.js 中承载 camera 的移动根 Group |
| grip | VR 手柄握柄侧键（buttons[1]） |
| Draco | Google 的 3D 几何压缩库 |
| 对象池 | 预创建对象、循环使用，避免 new/delete GC |
| 抽卡 | 波次奖励系统，三选一升级 |
| 如来神掌 | 解锁大招，巨大手掌从空中落下清屏 |
| 骑士 | 精英气球敌人，更大更硬 |

---

*文档生成时间: 2026-05-06*
*对应代码版本: index.html 约 2674 行*
