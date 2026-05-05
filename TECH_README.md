# VR 热气球射击游戏 — AI 开发技术文档

> 最后更新: 2026-05-05 | 入口文件: `index.html` (~2400 行单文件) | Three.js ES Module + WebXR

---

## 1. 项目概览

单文件 WebXR VR 游戏。玩家乘坐气球船，用右手 AK48 射击气球，清完每波出强化卡，第1波起混入骑士，第2波解锁如来神掌大招。

- **框架**: Three.js r168 (ES Module `three.module.js`)
- **VR**: WebXR `immersive-vr` + `local-floor`
- **模型**: glTF Binary (`.glb`)，Draco 压缩，CDN 解压
- **服务**: `npx serve -l 3000 -s .` (HTTP)，PICO 无需 HTTPS

---

## 2. 文件结构

```
WebXR_Ce/
├── index.html              # ★ 唯一入口，全部游戏逻辑
├── three.module.js         # Three.js ES Module (~1.3MB)
├── GLTFLoader.js           # 备用 GLTF 加载器
├── BufferGeometryUtils.js  # Three.js 工具
│
├── Model/                  # 3D 模型
│   ├── Ak48.glb            # 枪支 (Draco 压缩, 456KB)
│   ├── 气球船.glb          # 玩家乘坐的船 (900KB)
│   ├── 骑士.glb            # 骑士气球 (845KB)
│   ├── 如来神掌.glb        # 大招模型 (430KB)
│   └── 火焰.glb            # 特效预留 (471KB)
│
├── image/                  # 贴图
│   ├── sun.png             # 太阳 (PNG 透明, 177KB)
│   ├── moon.png            # 月牙 (PNG 透明, 90KB)
│   └── smile.png           # 气球笑脸 (PNG, 2.9MB)
│
├── jsm/loaders/
│   ├── GLTFLoader.js       # GLTF 加载器
│   └── DRACOLoader.js      # Draco 解压器
│
├── draco/                  # Draco WASM (离线备用)
│   ├── draco_decoder.js
│   ├── draco_decoder.wasm
│   └── draco_wasm_wrapper.js
│
├── start_server.bat        # 一键启动 HTTP
└── TECH_README.md          # 本文档
```

---

## 3. 启动方式

```bash
cd /path/to/WebXR_Ce
npx serve -l 3000 -s .
# PICO 浏览器访问: http://<电脑IP>:3000
```

Draco 解压器默认从 CDN 加载: `https://www.gstatic.com/draco/versioned/decoders/1.5.6/`
离线时改为本地: `dracoLoader.setDecoderPath('./draco/')`

---

## 4. 场景层级树

```
Scene (world space)
├── AmbientLight (ambientLight)     ← 动态天色
├── DirectionalLight (sunLight)     ← 太阳光，有阴影
├── HemisphereLight (hemiLight)     ← 半球环境光
├── balloonGroup                    ← 气球 + 骑士
├── bulletGroup                     ← 子弹对象池 (20个)
├── particleGroup                   ← 粒子对象池 (50个)
├── cloud meshes × 12              ← 3D 装饰云，世界空间固定
├── shipModel (气球船)             ← 玩家乘坐的船
├── buddhaPalmSkills[]             ← 飞行中的神掌
└── dolly (玩家跟随组)
    ├── camera (眼高 1.6m)          ← PerspectiveCamera 72° FOV
    ├── skyDome (半径60半球)        ← 动态变色天空穹顶
    ├── starLayers[3]               ← 星空粒子 (390颗)
    ├── sunSprite                   ← 太阳精灵 (NormalBlending)
    ├── moonSprite                  ← 月牙精灵 (AdditiveBlending)
    ├── choiceCardGroup             ← 强化选择卡
    ├── leftController / leftGrip   ← XR 左手
    │   └── (左手神掌模型)           ← 解锁后装备
    │   └── leftDebugPanel          ← 左手腕 UI (神掌状态/倒计时)
    └── rightController / rightGrip ← XR 右手
        ├── AK48 模型               ← 枪支
        └── debugPanel              ← 右手腕 UI (血量/得分/波次)
```

**重要**: dolly 是玩家逻辑组，真实移动（不是假滚动）。移动钳制在 X:±2 Z:±4 (4×8 米)。

---

## 5. 日夜黄昏天空系统

### 5.1 预设表 (搜索 `skyPresets`)

| 预设 | 天空色 | 雾色 | 太阳仰角 | 月亮仰角 | 环境光强 | 星光 |
|------|--------|------|:------:|:------:|:------:|:--:|
| day | `#87CEEB` | `#87CEEB` | 50° | -30° | 1.2 | 0 |
| dusk | `#E85D26` | `#E87544` | 5° | 5° | 0.7 | 0.25 |
| night | `#0A0A28` | `#0C0C2A` | -25° | 50° | 0.35 | 1.0 |

### 5.2 过渡机制
- `applySkyTarget(name)` 仅设置 `skyTarget`
- `updateSkyTransition(dt)` 每帧 lerp 13+ 属性向目标值
- 指数缓动 `ease = 1 - exp(-0.12*dt)`，约 30 秒完成 95%
- 星空 3 层叠加 (80+130+180=390 颗)，AdditiveBlending，幂分布头顶最密

### 5.3 太阳/月亮
- 使用独立仰角 (`sunElev`, `moonElev`) 和方位角 (`moonAz`)
- Canvas 备用纹理 + `image/sun.png` `image/moon.png` 自动加载替换
- 太阳 NormlBlending（防过曝），月亮 AdditiveBlending
- 月牙用矢量路径绘制（外弧+反向内弧）

### 5.4 切换方式
- HTML 按钮: ☀️白天 / 🌅黄昏 / 🌙夜晚
- VR: 左手 X/Y 键循环
- 键盘快捷键已移除

---

## 6. 移动系统

真实移动 dolly（不是云海滚动）。摇杆控制，钳制在 4×8 米。

```javascript
// 搜索 "移动范围限制"
BOUND_X = 2   // ±2m 半宽
BOUND_Z = 4   // ±4m 半深
MOVE_SPEED = 3.5

// PICO 摇杆前推为负值，代码中 sy = -sy 取反
```

旧云海滚动系统已废弃 (`updateCloudLayers` 空函数，`cloudScroll` 已删除)。

---

## 7. 气球战斗系统

### 7.1 配置 (搜索 "气球参数速查表")

```javascript
BALLOON_HP    = 100      // 生命值
BALLOON_SPEED = 0.5      // 移速 (m/s)
BALLOON_RADIUS = 0.5     // 碰撞半径
BALLOON_SCORE = 10       // 得分
BULLET_DAMAGE = 30       // 子弹伤害
SHOOT_COOLDOWN = 150     // 射击冷却 (ms)
```

### 7.2 笑脸贴图
- `image/smile.png` 加载到 `balloonTex`
- `createBalloon` 使用 `map: balloonTex` + 随机 `color` 染色 + 弱 `emissive`
- 每帧 `b.lookAt(playerPos) + rotateY(-PI/2)` 让贴图正面朝向玩家

### 7.3 骑士气球 (搜索 "骑士气球配置")

```javascript
KNIGHT_HP    = 500       // 生命值
KNIGHT_SCORE = 30        // 得分
KNIGHT_SCALE = 3         // 模型缩放
KNIGHT_RADIUS = 0.5 * KNIGHT_SCALE  // 碰撞自动跟随缩放
```

### 7.4 波次分阶段生成系统 (搜索 "波次分阶段生成配置")

每波不再一次性生成，而是**分阶段、分方向**持续生成：

| 时间点 | 阶段 | 生成方向 | 说明 |
|:------:|:----:|----------|------|
| 0s  | Phase 1 | 仅**前方** | 玩家面朝方向 +15 米 |
| 15s | Phase 2 | 前方 + **左右** | 左/右侧各 +15 米 |
| 30s | Phase 3 | 前方 + 左右 + **后方** | 背向 +15 米 |

```javascript
WAVE_BASE_SPAWN_COUNT = 30   // 每波基础生成数量
SPAWN_BATCH_INTERVAL = 1.0   // 每1秒生成一批
SPAWN_BATCH_SIZE = 3         // 每批3个
SPAWN_MAX_ACTIVE = 10        // 场景内同时存在不超过10个
SPAWN_DISTANCE = 15          // 生成距离玩家（米）
SPAWN_SPREAD = 8             // 散布范围（米）
```

**生成逻辑**: `updateWaveSpawning(dt)` 每帧调用，每秒一批。如果活跃气球已达 10 个，暂停生成；有空间时补满到 10 个（但不会超过）。

**波次结束条件**: `waveSpawnRemaining <= 0`（全部生成完毕）且所有活跃气球被击破。

**骑士概率**: 第1波起约 8%~35%，随波次递增：`Math.min(0.35, 0.08 + waveNumber * 0.025)`

### 7.5 强化选择卡
清完一波弹出 3 张卡（dolly 空间，面向玩家）: ❤️生命+100 / ⚔️攻击+20 / 🔫双弹。左手触碰选择。10 秒超时自动跳过。

---

## 8. 如来神掌系统 (搜索 "如来神掌配置区")

### 8.1 解锁
打完第 2 波 (`waveNumber >= 2`) 自动调用 `attachBuddhaPalmToLeft()`。

### 8.2 状态机
```
IDLE → (按握柄①) → AIMING → (按握柄② 或 5秒超时) → SLAMMING → IDLE
```

### 8.3 参数速查

```javascript
// 搜索 "如来神掌配置区" 看完整注释块
BUDDHA_COOLDOWN = 8      // 冷却 (秒)
AIM_TIMEOUT = 5           // 瞄准超时 (秒)

// 左手装备 (attachBuddhaPalmToLeft)
palm.scale = 0.5                              // 大小
palm.position = (0, -0.08, 0.05)              // X左右 Y上下 Z前后
palm.rotation = (0, 0, 0)                     // X俯仰 Y偏航 Z翻滚 (弧度)

// 预览神掌 (enterAimingMode)
previewPalm.scale = 2.0                        // 大小
previewPalm.position = front * 4 + y=0.5      // 前方4米

// 释放神掌 (releaseBuddhaPalm)
palm.scale = 20.0                              // 20倍大小
palm.position = camPos + aimDir*5 + y+15      // 前方5米, 头顶15米
fallDuration = 1.0                              // 下落时间 (秒)
cleanupDelay = 0.5                              // 落地后消失 (秒)
killRadius = 10                                 // 碰撞半径 (米)
damage = 1000                                   // 伤害
```

### 8.4 核心逻辑
- 第一次按握柄: 锁定 `aimDirection` (当前朝向)，生成 2x 预览神掌
- 第二次按/超时: 预览转化为 20x 神掌，从锁定方向头顶 15m 落下 1 秒
- 落地: 半径 10m 内所有气球扣 1000 HP，≤0 即死，80 粒子爆炸
- 0.5 秒后消失，状态回 IDLE，8 秒冷却
- 左手腕 UI 实时显示神掌状态

---

## 9. 左手腕 UI (神掌状态面板)

左手腕 Canvas 面板 (512×256px, 0.18×0.09m)，显示如来神掌状态：

| 状态 | 显示 |
|------|------|
| 未解锁 | `🔒 未解锁` |
| 就绪 | `✅ 已解锁` / `🟢 握柄释放` |
| **瞄准中** | **超大金色倒计时数字** (180px, 黑描边，占面板70%) |
| 释放中 | `🖐 神掌释放中!` |
| 冷却中 | `⏳ 冷却 N.N秒` |

**AIMING 倒计时**: 纯数字，无其他文字。数字约 6-7cm（半个手掌大小），黑色粗描边 + 金色填充，任何天空背景下清晰可见。

右手腕面板 (debugPanel): 血量/得分/攻击/气球数(活跃/上限/剩余)/双弹/波次阶段。

---

## 10. 输入映射

| 按键 | 功能 |
|------|------|
| 右手扳机 | 射击 |
| 左/右摇杆 | 移动 |
| 右手 A/B | 退出 VR |
| 左手 X | 下一天空 (白天→黄昏→夜晚) |
| 左手 Y | 上一天空 |
| 左手握柄 | 如来神掌 (①瞄准 ②释放) |
| 左手扳机 | 左手模式射击 |

底部 VR 提示已隐藏，信息在左手腕 UI。

---

## 11. 音效系统 (Web Audio API)

### 11.1 初始化
- `initAudio()`: 首次射击时创建 AudioContext，异步预渲染背景音乐缓冲
- 预渲染完成后自动开始循环播放

### 11.2 背景音乐 — 丛林鼓点
使用 `OfflineAudioContext` 预渲染 4 秒循环缓冲：

| 元素 | 参数 |
|------|------|
| 鼓点 | 16 拍，lowpass 800Hz 噪声，每拍 0.25s |
| 旋律 | 8 个木琴短音 (523→1047Hz, sine 波) |
| 播放 | `AudioBufferSourceNode` loop=true，增益 0.12 |
| 优势 | 零实时合成开销，PICO 更流畅 |

### 11.3 射击音效
噪声衰减模拟枪声：`lowpass` 3000Hz，增益 0.4，衰减 0.1s。

### 11.4 气球爆炸音效 — 大气球爆裂
双层叠加模拟大气球爆炸：

| 层 | 参数 |
|----|------|
| **主爆裂** | 噪声 0.25s，`lowpass` 400Hz，Q 0.5，增益 1.4，衰减 0.15s |
| **低频冲击** | 扫频 70→14Hz，`sine` 波 0.15s，`lowpass` 120Hz，增益 0.6 |

效果: 厚重"嘭"感 + 低频胸腔震感。

---

## 12. 关键变量索引

| 变量 | 位置说明 | 用途 |
|------|----------|------|
| `dolly` | 全局 Group | 玩家跟随组，包含相机/天空/控制器 |
| `camera` | dolly 子节点 | PerspectiveCamera, 眼高 1.6m |
| `skyPresets` | 全局对象 | 天空预设 day/dusk/night |
| `skyNow` | 全局对象 | 当前天空颜色/光强 (每帧 lerp) |
| `skyTarget` | 字符串 | 当前目标预设名 |
| `starLayers` | 数组 [3] | 星空 Points 对象 |
| `sunSprite/moonSprite` | dolly 子节点 | 太阳/月亮精灵 |
| `balloons` | 数组 | 气球+骑士对象列表 |
| `balloonGroup` | scene 子节点 | 气球父组 |
| `bullets` | 数组 | 活跃子弹列表 |
| `bulletPool` | 数组 [20] | 子弹对象池 |
| `playerStats` | 对象 | {hp, score, atk} |
| `waveNumber` | 整数 | 波次计数 |
| `waveSpawnRemaining` | 整数 | 本波剩余待生成气球数 |
| `wavePhase` | 整数 | 生成阶段 1=前 2=前+左右 3=全方向 |
| `wavePhaseTimer` | 浮点 | 阶段计时器 (秒) |
| `buddhaPalmState` | 字符串 | IDLE/AIMING/SLAMMING |
| `buddhaPalmReady` | 布尔 | 神掌是否解锁 |
| `buddhaPalmCooldown` | 浮点 | 冷却倒计时 |
| `aimDirection` | Vector3 | 第一次按握柄锁定的朝向 |
| `previewPalm` | Object3D | 瞄准时的预览神掌 |
| `BOUND_X/BOUND_Z` | 常量 | 移动范围 2/4 |
| `knightModel` | Object3D | 骑士模型原型 |
| `shipModel` | Object3D | 气球船模型 |
| `balloonTex` | Texture | 笑脸贴图 |
| `bgmBuffer` | AudioBuffer | 预渲染的丛林鼓点循环 |
| `bgmSource` | BufferSource | 当前播放的 BGM 节点 |

---

## 13. 给 AI 的提示词模板

```
这是一个 Three.js WebXR VR 射击游戏，入口文件 index.html (~2400行单文件)。
使用 ES Module 导入 three.module.js，GLB 模型用 Draco 压缩 (CDN: gstatic.com/draco/1.5.6/)。
HTTP 服务器: npx serve -l 3000 -s .
场景层级: Scene → dolly(玩家组) → camera + skyDome + stars + sprites + controllers.
移动: 真实移动 dolly，钳制 X:±2 Z:±4。
天空: day/dusk/night 三预设 30 秒渐变，搜索 skyPresets。
气球: 分阶段生成 (0秒前方→15秒左右→30秒后方)，每秒3个，同时存在不超过10个。
波次: 每波约30+气球，第1波起混入骑士，第2波解锁如来神掌。
如来神掌: 两段式 (握柄①瞄准 握柄②释放)，20倍从头顶15m落下。
音效: 丛林鼓点循环BGM，大气球爆炸音效。
请阅读 index.html 中标注了 "<--" 的参数注释来调整数值。
关键搜索词: "如来神掌配置区" "气球参数速查表" "骑士气球配置" "波次分阶段生成配置"
```

---

## 14. 代码定位速查

| 需要修改 | 搜索关键词 |
|----------|-----------|
| 天空预设 | `skyPresets` |
| 天空过渡速度 | `exp(-0.12` |
| 气球 HP/速度 | `BALLOON_HP` / `BALLOON_SPEED` |
| 骑士属性 | `KNIGHT_HP` |
| 神掌全部参数 | `如来神掌配置区` |
| 神掌下落时间 | `fallDuration` |
| 神掌伤害/半径 | `damage: 1000` |
| 神掌冷却 | `BUDDHA_COOLDOWN` |
| 瞄准超时 | `AIM_TIMEOUT` |
| 左手神掌位置 | `palm.position.set(0, -0.08` |
| 左手神掌旋转 | `palm.rotation.set(0, 0, 0)` |
| 气球船位置 | `SHIP_POS` |
| 玩家眼高 | `camera.position.set(0, 1.6` |
| 移动范围 | `BOUND_X` |
| 枪支参数 | `AK48 枪支配置区` |
| 子弹参数 | `子弹参数速查表` |
| 解锁神掌关卡 | `waveNumber >= 2` |
| 星空分布 | `Math.pow(Math.random(), 2.5)` |
| 左手 UI | `updateLeftDebugPanel` |
| 分阶段生成配置 | `波次分阶段生成配置` |
| 生成批次大小 | `SPAWN_BATCH_SIZE` |
| 活跃上限 | `SPAWN_MAX_ACTIVE` |
| 生成距离 | `SPAWN_DISTANCE` |
| BGM 音量 | `bgMusicGain.gain.setValueAtTime` |
| 爆炸音效增益 | `gainNode.gain.setValueAtTime(1.4` |
