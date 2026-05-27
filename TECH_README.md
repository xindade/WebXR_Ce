# VR 热气球射击游戏 — 技术文档

> 最后更新: 2026-05-27 | 入口: `index.html` + `js/` 模块 | Three.js r168 ES Module + WebXR

---

## 1. 项目概述

**WebXR_Ce** 是一款基于 Three.js + WebXR 的 VR 热气球射击游戏，目标平台为 **PICO 4 VR 头显**。

玩家站在鲲鹏飞船上，使用 AK48 枪支射击周围气球敌人，通过波次战斗、稀有度抽卡升级、如来神掌清屏大招、云朵转场等机制推进游戏。

- **入口**: `index.html` + `js/core.js` / `js/game.js` / `js/vr.js` / `js/cards.js` / `js/buddha.js` / `js/laser-level.js`
- **部署**: GitHub Pages（`https://github.com/xindade/WebXR_Ce.git`）
- **测试设备**: PICO 4 VR 头显

---

## 2. 技术栈

| 层级 | 技术 | 版本/说明 |
|------|------|----------|
| 3D 引擎 | Three.js | r168 |
| VR API | WebXR | `immersive-vr`, `local-floor` |
| 模型加载 | GLTFLoader + DRACOLoader | Draco CDN 1.5.6 |
| 音效 | Web Audio API | 纯代码生成 |
| 贴图 | CanvasTexture | 运行时生成 |
| 模块加载 | ES Module | 禁用 `import * as`（PICO 4 Bug） |

---

## 3. 模块架构

### 3.1 模块分工

| 文件 | 职责 |
|:-----|:-----|
| `js/logger.js` | 独立日志系统 |
| `js/core.js` | 常量、STATE、Three.js 核心、灯光/天空/云/容器 |
| `js/game.js` | 子弹、气球、波次、碰撞、特效、云朵转场 |
| `js/cards.js` | **选项卡系统**: 稀有度/属性/生成/触碰交互 |
| `js/buddha.js` | **如来神掌**: 装备/释放/碰撞/清理 |
| `js/vr.js` | 音效、模型、手柄、枪支、输入、UI 面板 |
| `js/laser-level.js` | **激光关卡**: 动画序列、碰撞、死亡重置、通关 |
| `index.html` | 组装者: 注入依赖、驱动循环、选关、intro6 |

### 3.2 依赖图

```
core.js  ← 纯数据 + Three.js 核心
  ↑
cards.js / buddha.js  ← 依赖 core.js
  ↑      ↑
game.js  ← 依赖 core/cards/buddha，运行时注入 vr
  ↑
vr.js    ← 依赖 core/game
  ↑
laser-level.js ← 依赖 core，动态 import game.js
  ↑
index.html ← 组装所有模块
```

### 3.3 运行时注入

```javascript
// cards.js → game.js: 循环依赖打破
setBuddhaDeps(balloons, spawnDebris, spawnParticles, playPop);

// game.js → vr.js: 音频/VR 注入
game.setAudio(vr);
game.setVR(vr);
```

---

## 4. 场景层级树

```
Scene (world space)
├── AmbientLight / DirectionalLight / HemisphereLight
├── balloonGroup / bulletGroup / particleGroup / debrisGroup
├── cloud groups ×12
├── shipModel (鲲鹏.glb)
├── transitionCloudGroup
├── buddhaPalmActiveList[]
├── choiceCardGroup (Group)              ← 固定场景 (0,2,-2)，不在 dolly 下
│   ├── card0 (Mesh, offsetX=-0.6)
│   ├── card1 (Mesh, offsetX=0)
│   ├── card2 (Mesh, offsetX=+0.6)
│   └── refreshCard (Mesh, Y=-0.35)
│
└── dolly (Group)                        ← 玩家移动根节点
    ├── camera
    ├── skyDome / starLayers
    ├── sunSprite / moonSprite
    ├── leftController / leftGrip
    │   ├── 神掌模型 (解锁后)
    │   ├── leftRaySphere (触摸检测)
    │   └── leftDebugPanel
    └── rightController / rightGrip
        ├── AK48 模型
        └── debugPanel
```

---

## 5. 选关系统

### 5.1 波次-关卡映射

| 按钮 | `data-level` | wave | 类型 |
|:-----|:------------:|:----:|:----:|
| 🎈 正常开始 | — | 0 | 自然流程 |
| 📌 关卡 1 | 1 | 0 | normal |
| 📌 关卡 2 | 2 | 1 | normal |
| 📌 关卡 3（激光）| 3 | 2 | mech (激光) |
| 📌 关卡 4 | 4 | 3 | normal |
| 📌 关卡 5 | 5 | 4 | normal |
| 📌 关卡 6（Boss）| 6 | 5 | boss |

### 5.2 选关流程

```
点击关卡按钮 → selectedLevel = N
              → gold=1000, atk=100

点击"正常开始游戏" → enterVR()
sessionstart → 500ms 延迟:
  ├─ level 3 → gameMode='laser' → startLaserLevel()
  ├─ level 6 → gameMode='shooting', wave=5 → createKnightBalloon×2
  └─ 其他    → gameMode='shooting', wave=selectedLevel-1, spawnBalloons()
  
选关时自动: buddhaPalmUnlocked=true（模型加载后自动装备）
```

### 5.3 自然波次

```
wave 0/1 normal → wave 2 laser → wave 3/4 normal → wave 5 Boss
→ wave 6-10 normal → wave 11 Boss → ... → wave 18 通关
```

### 5.4 getLevelType()

```javascript
waveNumber === 2  → 'mech'    // 激光关
waveNumber === 5  → 'boss'    // 第一个 Boss
waveNumber === 11 → 'boss'    // 第二个 Boss
waveNumber === 18 → 'final'   // 通关
否则             → 'normal'
```

---

## 6. 选项卡系统

### 6.1 位置

固定世界坐标 `(0, 2, -2)`，正面朝 +Z。`choiceCardGroup` 挂载在 `scene` 下（非 `dolly`）。

### 6.2 属性类型（5种）

| ID | 图标 | 效果 | 传说(100) |
|:---|:----:|:-----|:--------:|
| `atk` | ⚔️ | `playerStats.atk += v` | +100 |
| `hp` | ❤️ | `shipHp = min(100, hp+v)` | +100 |
| `fireRate` | 🎯 | `fireRate += v/100` | +1.0x |
| `multiShot` | 🔫 | `multiShotChance += v` | +100% |
| `blast` | 💥 | `explosionRadius += v/100` | +1.0m |

### 6.3 稀有度

| 稀有度 | 色 | 数值 | 权重 | Boss关 |
|:-------|:--:|:----:|:----:|:------:|
| 普通 | #fff | 10 | 40 | ✅ |
| 稀有 | #4da6ff | 20 | 30 | ✅ |
| 史诗 | #b388ff | 50 | 20 | ✅ |
| 传说 | #ffd700 | 100 | 10 | ✅ |
| 红色 | #f22 | 200 | 5 | Boss |

### 6.4 交互方式

**手柄触碰选择**:
- 左手柄球与卡片世界距离 < 0.2m → 高亮放大 1.2x
- 左手扳机上升沿 → 确认选择

**刷新**:
- 费用: `10 × 2^次数` 金币
- 2秒冷却

**超时**: 60秒（调试中，正式 15 秒）

### 6.5 触发链

```
checkAllBalloonsDestroyed() → spawnChoiceCards()
  → 选卡/超时 → clearChoiceCards() → nextWaveTimer=1s
    → updateCooldowns() → waveNumber++ → Boss/Normal 分支
```

---

## 7. 爆炸系统

### 7.1 触发

`explosionRadius > 0` 时，子弹命中后检测周围气球。

### 7.2 数值

| 稀有度 | 值 | 半径 |
|:-------|:--:|:----:|
| 普通 | 10 | 0.1m |
| 稀有 | 20 | 0.2m |
| 史诗 | 50 | 0.5m |
| 传说 | 100 | 1.0m |
| 红色 | 200 | 2.0m |

累积制。神掌半径 = `BUDDHA_KILL_RADIUS + explosionRadius`。

---

## 8. 如来神掌

`js/buddha.js` | 独立模块，通过 `setBuddhaDeps()` 注入 game.js 依赖

### 8.1 解锁

| 方式 | 触发 |
|:-----|:-----|
| 正常游戏 | `nextWaveTimer→0, waveNumber>=1` → `attachBuddhaPalmToLeft()` |
| 选关 | `buddhaPalmUnlocked=true` → 模型加载后自动装备 |
| 每帧重试 | `updateCooldowns` 检查 `model已加载+wave>=1+!ready` |

### 8.2 状态机

```
IDLE → (左手握柄上升沿) → 直接释放 → IDLE(冷却8s)
```

### 8.3 关键参数

| 参数 | 值 | 说明 |
|:-----|:--:|:-----|
| `BUDDHA_COOLDOWN` | 8s | 冷却 |
| `BUDDHA_KILL_RADIUS` | 50m | 基础半径 |
| `BUDDHA_DAMAGE` | 1000 | 伤害 |
| `BUDDHA_HAND_SCALE` | 0.2 | 手柄缩放 |
| `BUDDHA_FALL_DURATION` | 0.5s | 下落时长 |

---

## 9. 激光关卡

`js/laser-level.js` | wave=2, level=3

### 9.1 动画序列

```
INTRO(9.3s)  → 施法动画驱动魔术师+魔术棒
DRIVE(6s)    → 气球 Z:-4→2
ANIM_1A(1s)  → ③-⑧ Z:2→0
ANIM_1B(0.5s) → ③④ rotation→0
ANIM_2(~3s)  → 多组独立动画
ANIM_3(持续) → 振荡飞行
WINNING      → 走到底线通关
```

### 9.2 施法动画

`Model/magician_spell_091026.json`（430KB, 716帧, 9.2秒）

- `magician` track: position/rotation/scale
- `wand` track: position/rotation/scale/emissive/opacity
- INTRO 阶段二分插值驱动

### 9.3 死亡

碰激光 → 黑屏1s → 3次机会 → 超过则失败无奖励

---

## 10. 核心常量

### 移动与操作

| 常量 | 值 | 说明 |
|:-----|:--:|:-----|
| `MOVE_SPEED` | 3.5 | m/s |
| `BOUND_X` | 2 | ±2m |
| `BOUND_Z` | 4 | ±4m |

### 子弹/气球/骑士

| 常量 | 值 | 说明 |
|:-----|:--:|:-----|
| `BULLET_SPEED` | 15 | m/s |
| `BULLET_LIFE` | 2 | s |
| `BALLOON_HP` | 100 | — |
| `KNIGHT_HP` | 500 | — |
| `KNIGHT_SCORE` | 30 | — |

### 波次

| 常量 | 值 |
|:-----|:--:|
| `WAVE_BASE_SPAWN_COUNT` | 30 |
| `SPAWN_BATCH_INTERVAL` | 1.0s |
| `SPAWN_BATCH_SIZE` | 3 |
| `SPAWN_MAX_ACTIVE` | 10 |

### 鲲鹏

| 参数 | 值 |
|:-----|:--:|
| `SHIP_MAX_HP` | 100 |
| `SHIP_SCALE` | 7.0 |
| `SHIP_POS` | [1, 1, 0.05] |

---

## 11. 输入映射（PICO 4）

### 右手

| 输入 | 功能 |
|:-----|:-----|
| Trigger | 射击 |
| Grip | 右手腕面板 |
| Stick | 移动（优先） |
| A/B | 退出 VR |

### 左手

| 输入 | 功能 |
|:-----|:-----|
| Trigger | 选卡确认 |
| Grip | 神掌释放 / 左手腕面板 |
| Stick | 移动（回退） |
| X/Y | 天空切换 |

---

## 12. 代码定位速查

| 功能 | 文件 | 关键词 |
|:-----|:-----|:-------|
| 选项卡系统 | `cards.js` | `spawnChoiceCards`, `TOUCH_DISTANCE` |
| 爆炸系统 | `game.js`, `cards.js` | `explosionRadius`, `blast` |
| 如来神掌 | `buddha.js` | `updateBuddhaPalm`, `setBuddhaDeps` |
| 选关 | `index.html` | `selectedLevel`, `data-level` |
| 波次推进 | `game.js` | `nextWaveTimer`, `waveNumber++` |
| 关卡类型 | `cards.js` | `getLevelType` |
| 神掌解锁 | `game.js` | `buddhaPalmUnlocked`, `attachBuddhaPalmToLeft` |
| 激光关卡 | `laser-level.js` | `startLaserLevel`, `updateLaserLevel` |
| 施法动画 | `laser-level.js` | `_lerpTrack`, `_interpEmissive` |
| intro6 红蓝 | `index.html` | `startIntro6`, `updateIntro6` |
| 碰撞检测 | `game.js` | `checkBulletBalloonCollisions` |
| 天空系统 | `core.js` | `skyPresets`, `updateSkyTransition` |
| 音效 | `vr.js` | `initAudio`, `playShootSound` |

---

## 13. Git 工作流

```bash
# 功能分支开发
git checkout -b feat/xxx
# 开发...
git push origin feat/xxx
# 测试 OK → 合并到 master
git checkout master
git merge feat/xxx
git push origin master
```

---

*文档更新时间: 2026-05-27 | cards.js + buddha.js 拆分 | 触碰选卡 | Boss wave 5/11*
