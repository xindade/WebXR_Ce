# VR 热气球射击游戏 — 技术文档

> 最后更新: 2026-05-12 | 入口: `index.html` + `js/` 模块 | Three.js r168 ES Module + WebXR

---

## 1. 项目概述

**WebXR_Ce** 是一款基于 Three.js + WebXR 的 VR 热气球射击游戏，目标平台为 **PICO 4 VR 头显**（浏览器 Chrome/105）。

玩家站在鲲鹏飞船上，使用 AK48 枪支射击从四周涌来的气球敌人，通过波次战斗、稀有度抽卡升级、如来神掌清屏大招、云朵转场等机制推进游戏。

- **入口**: `index.html`（~400行）+ `js/core.js` / `js/game.js` / `js/vr.js` / `js/logger.js`（总计约 2600 行）
- **部署**: GitHub Pages（`https://github.com/xindade/WebXR_Ce.git`）
- **测试设备**: PICO 4 VR 头显
- **开发服务器**: Node.js HTTPS 端口 3443 / HTTP 端口 3000

---

## 2. 技术栈

| 层级 | 技术 | 版本/说明 |
|------|------|----------|
| 3D 引擎 | Three.js | r168，`three.module.js` + `jsm/` addons |
| VR API | WebXR | `immersive-vr` 模式，`local-floor` 参考空间 |
| 模型加载 | GLTFLoader + DRACOLoader | Draco 解码器: gstatic CDN (1.5.6) |
| 压缩格式 | Draco | `.glb` 模型经 Draco 压缩 |
| 音效 | Web Audio API | 纯代码生成，无外部音频文件 |
| 贴图 | CanvasTexture | 运行时生成（笑脸、太阳、月亮、星空、UI 面板） |
| 构建工具 | 无 | 纯前端模块化，无打包工具 |
| 模块加载 | ES Module | 禁用 `import * as` 语法（PICO 4 Chrome/105 Bug） |

---

## 3. 模块架构

### 3.1 模块分工

| 文件 | 行数 | 职责 |
|:-----|:----:|:-----|
| `js/logger.js` | ~65 | 独立日志（`<script>` 同步加载，ES Module 前执行） |
| `js/core.js` | ~620 | 常量、共享状态 STATE、Three.js 核心（渲染器/场景/相机）、灯光、天空、云朵、容器、云转场配置 |
| `js/game.js` | ~1200 | 子弹、气球、波次、碰撞、抽卡、如来神掌、特效、云朵转场 |
| `js/vr.js` | ~540 | 音效、模型加载、手柄、枪支/后坐力、输入处理、UI 面板、左手射线球/射线 |
| `js/laser-level.js` | ~745 | **激光关卡（第三关）**: 8个双金字塔气球、坐标网格、多阶段动画序列、碰撞检测(支持任意方向)、死亡重置、通关庆祝 |

### 3.2 模块间依赖与注入

```
core.js  ← 纯数据 + Three.js 核心（无外部依赖）
  ↑
game.js  ← 依赖 core.js 常量/STATE，运行时注入 vr.js 的音频/VR 方法
  ↑  ↑
vr.js    ← 依赖 core.js 常量/STATE，直接导入 game.js 的 shootBullet()
  ↑
laser-level.js ← 依赖 core.js（场景/相机/云朵/日月），使用动态 import 调用 game.js 方法
  ↑
index.html ← 组装者：注入跨模块依赖，驱动动画循环，按 STATE.gameMode 分发
```

```javascript
// index.html 中关键初始化代码
import { GameAPI as game } from './js/game.js';
import { VrAPI as vr } from './js/vr.js';
game.setAudio(vr);   // 注入音频
game.setVR(vr);      // 注入 VR 方法（如 attachBuddhaPalmToLeft）
```

### 3.3 日志系统

在 ES Module 加载前以普通 `<script>` 标签执行，保证模块加载失败时也能诊断。

- **`window.__log(msg, level)`**: 全局日志函数，级别: `s`(✅绿色) `i`(🔹蓝色) `w`(⚠️黄色) `e`(❌红色)
- **左侧日志面板**: 42vw × 100vh，z-index:50，最新 200 条，独立 `setInterval(200ms)` 刷新
- **右上角 JS 状态指示器**: `#js-status` 显示 JS 是否执行
- **全局错误捕获**: `error` + `unhandledrejection` 事件监听
- **模块加载超时检测**: 3 秒后检查

---

## 4. 渲染器与核心配置

### 4.1 渲染器

```javascript
const renderer = new THREE.WebGLRenderer({ antialias: false });  // 关闭抗锯齿（VR头显自带）
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.0));  // 降采样防止 PICO 过载
renderer.shadowMap.enabled = true;       // 桌面端启用阴影
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;  // 关闭色调映射，减少 GPU 负载
// renderer.xr.enabled 在 enterVR() 中设置（PICO 4 兼容性）
```

**关键决策**:
- VR 模式下关闭阴影（`setShadow(false)`），移动端 GPU 瓶颈优化
- 桌面预览模式恢复阴影
- 降采样到 1.0，避免超高分辨率拖慢 PICO
- 关闭抗锯齿 — VR 头显本身具备光学抗锯齿

### 4.2 场景与相机

```javascript
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);   // 默认白天
scene.fog = new THREE.Fog(0x87CEEB, 30, 100);   // 雾化远处

const camera = new THREE.PerspectiveCamera(72, ratio, 0.1, 200);
camera.position.set(0, 6.6, 0);   // 桌面预览高度

const dolly = new THREE.Group();   // 玩家移动根节点
dolly.add(camera);
scene.add(dolly);
```

注: VR 中眼高由 XR 运行时控制（等效 ~1.6m），6.6 为桌面预览值。

### 4.3 灯光

```javascript
const sunLight = new THREE.DirectionalLight(0xffffff, 2.5);
sunLight.position.set(20, 40, 10);   // 默认白天位置
sunLight.castShadow = true;
sunLight.shadow.mapSize = 2048×2048;

const ambientLight = new THREE.AmbientLight(0xffeedd, 1.2);
const hemiLight = new THREE.HemisphereLight(0x87CEEB, 0x90EE90, 0.8);
```

所有灯光颜色/强度/位置由天空系统动态控制。

### 4.4 VR 阴影开关

```javascript
function setShadow(enabled) {
    renderer.shadowMap.enabled = enabled;
    sunLight.castShadow = enabled;
    if (!enabled) scene.traverse(obj => { if (obj.isMesh) obj.castShadow = false; });
}
```

---

## 5. 场景层级树

```
Scene (world space)
├── AmbientLight (ambientLight)         ← 动态天色（天空系统控制）
├── DirectionalLight (sunLight)         ← 太阳光，阴影 2048×2048
├── HemisphereLight (hemiLight)         ← 半球光
├── balloonGroup                        ← 气球 + 骑士容器
├── bulletGroup                         ← 子弹对象池 (20个)
├── particleGroup                       ← 粒子对象池 (50个)
├── debrisGroup                         ← 碎片对象池 (30个)
├── cloud groups × 12                   ← 白色球体组，世界空间固定
├── shipModel (鲲鹏.glb)                ← 玩家乘坐的鲲鹏模型
├── transitionCloudGroup (Group)        ← 5朵转场云（4个角+正前方15m）
├── buddhaPalmActiveList[]              ← 飞行/下落中的神掌
│
└── dolly (Group)                       ← 玩家移动根节点
    ├── camera (PerspectiveCamera)      ← 72° FOV, 局部 y=6.6
    ├── skyDome (Mesh)                  ← 半球(半径60), 纯色 MeshBasicMaterial
    ├── starLayers (Points ×3)          ← 三层星空 (80+130+180=390颗)
    ├── sunSprite (Sprite)              ← 太阳 (NormalBlending, 8m)
    ├── moonSprite (Sprite)             ← 月牙 (AdditiveBlending, 5m)
    ├── choiceCardGroup (Group)         ← 3属性卡 + 1刷新卡
    ├── leftController / leftGrip       ← XR 左手
    │   ├── 神掌模型 (scale=0.2, 平放)  ← 解锁后挂载
    │   ├── leftRaySphere (r=0.05)      ← 青色射线球
    │   └── rayLine (3m 青色半透明)     ← 可见射线线条
    │   └── leftDebugPanel              ← 左手腕 UI (512×256px, 0.18×0.09m)
    └── rightController / rightGrip     ← XR 右手
        ├── AK48 模型 (scale=0.6)       ← 枪支
        └── debugPanel                  ← 右手腕 UI (512×256px)
```

---

## 6. 核心常量速查

所有常量定义并导出自 `js/core.js`。可直接 import 后修改。

### 6.1 移动与操作

| 常量 | 值 | 说明 |
|:-----|:---:|:-----|
| `MOVE_SPEED` | 3.5 | 摇杆移动速度 (m/s) |
| `DEADZONE` | 0.2 | 摇杆死区 |
| `BOUND_X` | 2 | X 轴移动边界 ±2m |
| `BOUND_Z` | 4 | Z 轴移动边界 ±4m |
| `SHOOT_COOLDOWN` | 150 | 射击冷却 (ms)，受 fireRate 修正 |

### 6.2 子弹

| 常量 | 值 | 说明 |
|:-----|:---:|:-----|
| `BULLET_SPEED` | 15 | 子弹速度 (m/s) |
| `BULLET_LIFE` | 2 | 存活时间 (s) |
| `BULLET_POOL_SIZE` | 20 | 对象池大小 |
| 发射口 | (0,0,-0.2) | 相对手柄本地坐标 |
| 下倾角 | -30° | 固定弧度 |

### 6.3 普通气球

| 常量 | 值 | 说明 |
|:-----|:---:|:-----|
| `BALLOON_HP` | 100 | 生命值 |
| `BALLOON_SPEED` | 0.5 | 移动速度 (m/s) |
| `BALLOON_RADIUS` | 0.5 | 碰撞半径 |
| `BALLOON_SCORE` | 10 | 击杀得分 |
| `BALLOON_DAMAGE` | 5 | 撞船伤害 |

### 6.4 骑士

| 常量 | 值 | 说明 |
|:-----|:---:|:-----|
| `KNIGHT_HP` | 500 | 生命值 |
| `KNIGHT_SCORE` | 30 | 得分 |
| `KNIGHT_SCALE` | 3 | 模型缩放 |
| `KNIGHT_RADIUS` | 1.5 | 碰撞半径 = 0.5×3 |

### 6.5 波次

| 常量 | 值 | 说明 |
|:-----|:---:|:-----|
| `WAVE_BASE_SPAWN_COUNT` | 30 | 每波基础总数 |
| `SPAWN_BATCH_INTERVAL` | 1.0 | 批次间隔 (s) |
| `SPAWN_BATCH_SIZE` | 3 | 每批数量 |
| `SPAWN_MAX_ACTIVE` | 10 | 同屏上限 |
| `SPAWN_DISTANCE` | 15 | 生成距离 (m) |
| `SPAWN_SPREAD` | 8 | 散布范围 (m) |

### 6.6 鲲鹏（原气球船）

| 常量 | 值 | 说明 |
|:-----|:---:|:-----|
| `SHIP_MAX_HP` | 100 | 最大生命 |
| `SHIP_COLLISION_RADIUS` | 2.5 | 碰撞半径 |
| `SHIP_REPEL_FORCE` | 2.0 | 对气球排斥力 |
| `BALLOON_REPEL_FORCE` | 3.0 | 气球互斥力 |
| `SHIP_SCALE` | 7.0 | 模型缩放（整体放大7倍） |
| `SHIP_POS` | [1, 1, 0.05] | 世界坐标 [x=右1m, y=离地1m, z≈0] |
| `SHIP_ROT` | [0, 1.57, 0] | 弧度 (Y 轴 90° 使正面朝前) |

### 6.7 如来神掌

| 常量 | 值 | 说明 |
|:-----|:---:|:-----|
| `BUDDHA_COOLDOWN` | 8 | 冷却 (s) |
| `BUDDHA_KILL_RADIUS` | 50 | 杀伤半径 (m, 直接拉满) |
| `BUDDHA_DAMAGE` | 1000 | 伤害 |
| `BUDDHA_HAND_SCALE` | 0.2 | 装备在手柄的缩放 |
| `BUDDHA_HAND_POS` | [0, -0.08, 0.03] | 手柄局部坐标 |
| `BUDDHA_HAND_ROT_X` | `-PI/2` | 平放角度 |

详见第 14 节完整参数表。

### 6.8 特效

| 常量 | 值 | 说明 |
|:-----|:---:|:-----|
| `DEBRIS_COUNT` | 30 | 碎片池大小 |
| `DEBRIS_LIFE` | 0.8 | 存活 (s) |
| `PARTICLE_COUNT` | 50 | 粒子池大小 |
| `PARTICLE_LIFE` | 1.0 | 存活 (s) |

### 6.9 AK48 枪支

| 参数 | 值 | 说明 |
|:-----|:---:|:-----|
| `AK48_SCALE` | 0.6 | 整体缩放 |
| 右手位置 | (0, -0.1, 0.01) | 相对右手柄（代码中 gunInstance.position） |
| 右手旋转 | x=-20rad, y=90° | 弧度（-20rad ≈ -66° 有效倾角） |
| 左手位置 | (0, -0.1, 0.01) | 同上 |
| 左手旋转 | x=-20rad, y=-90° | 弧度 |
| 左手镜像 | scale.x = -0.6 | X 轴翻转 |

### 6.10 枪支后坐力

| 参数 | 值 | 说明 |
|:-----|:---:|:-----|
| `RECOIL_ROT_AMPLITUDE` | 0.08 | 单次射击旋转偏移（弧度） |
| `RECOIL_DECAY` | 0.80 | 每帧衰减系数（越小回弹越快） |

后坐力采用纯旋转方式（位置不变），枪口上跳（减少 `rotation.x` 负值），避免平移方向感知歧义。低射速时后坐力明显，高射速时轻微。

---

## 7. 移动系统

真实移动 dolly（不是云海滚动），摇杆控制，钳制在 4×8 米范围。

```javascript
// 右摇杆优先，无输入时回退到左摇杆
// sy = -sy 取反（PICO 前推为负值）
// 基于 camera 朝向计算移动方向
const forward = new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion);
const right = new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion);
dolly.position.x = clamp(-BOUND_X, +BOUND_X);
dolly.position.z = clamp(-BOUND_Z, +BOUND_Z);
```

---

## 8. 射击系统

### 8.1 子弹对象池

预创建 `BULLET_POOL_SIZE(20)` 个 Mesh，循环使用，避免 GC 抖动。

```javascript
const sharedBulletGeom = new THREE.SphereGeometry(0.02, 8, 8);
const sharedBulletMat = new THREE.MeshStandardMaterial({
    color: 0xffaa00, emissive: 0xff4400, emissiveIntensity: 0.8
});
```

### 8.2 发射机制

```javascript
const muzzleLocal = new THREE.Vector3(0, 0, -0.2); // 枪口前方 20cm
const origin = muzzleLocal.clone().applyMatrix4(controller.matrixWorld);
const bulletPitch = -30 * Math.PI / 180;            // 固定 30° 下倾
const localPitchQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(bulletPitch, 0, 0));
const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(finalQuat);
```

子弹俯仰在控制器本地空间计算（与旋转解耦），避免水平转动串扰。

### 8.3 多重射击

```javascript
// 抽卡获得 multiShotChance 后，概率发射额外子弹
let remain = STATE.multiShotChance;
while (remain > 0) {
    if (remain >= 100 || Math.random() * 100 < remain) {
        setTimeout(() => fireOneBullet(controller), 50);
        remain -= 100;
    } else break;
}
```

- `>= 100%` 必发 1 颗 + 余数再判定
- 多发间隔 50ms

### 8.4 左右手射击

- 右手（默认）：`rightController` + `rightTrigger`
- 左手（模式）：`leftController` + `leftTrigger`（由 `enterVR(true)` 启用）
- 独立冷却: `lastRightShootTime` / `lastLeftShootTime`
- 冷却受 `fireRate` 修正: `cooldown / max(0.1, fireRate)`

---

## 9. 天空系统（日夜黄昏）

### 9.1 预设表

| 预设 | 天空色 | 雾色 | 太阳仰角 | 月亮仰角 | 环境光强 | 太阳光强 | 星光 |
|:----:|--------|------|:--------:|:--------:|:--------:|:--------:|:----:|
| day | `#87CEEB` | `#87CEEB` | 50° | -30° | 1.2 | 2.5 | 0 |
| dusk | `#E85D26` | `#E87544` | 5° | 5° | 0.7 | 1.8 | 0.25 |
| night | `#0A0A28` | `#0C0C2A` | -25° | 50° | 0.35 | 0.5 | 1.0 |

### 9.2 过渡机制

- `applySkyTarget(name)` 设置 `STATE.skyTarget`
- `updateSkyTransition(dt)` 每帧 lerp 13+ 属性
- 指数缓动: `ease = 1 - exp(-0.12 * dt)`，约 30 秒完成 95%
- 星空 3 层叠加 (80+130+180=390 颗)，AdditiveBlending，幂分布头顶最密
- 星空闪烁: `opacity * (0.85 + 0.15 * sin(time * 1.7 + layer * 2.1))`
- 太阳/月亮透明度随仰角渐变: `max(0, min(1, (elev + 3) / 8))`

### 9.3 切换操作

- 桌面: 顶部 ☀️🌅🌙 按钮
- VR: 左手 X +1 / Y -1 循环

---

## 10. 气球与波次系统

### 10.1 普通气球

- 几何体: `SphereGeometry(0.5, 16, 16)`
- 材质: `MeshStandardMaterial`，7 种随机颜色 + 笑脸贴图 + 随机染色
- 每帧 `b.lookAt(playerPos)` + `rotateY(-PI/2)` 让笑脸始终朝玩家
- 漂浮动画: `position.y += sin(time * 0.003 + i) * 0.002`
- 击中闪烁: `emissiveIntensity = 0.5` 持续 100ms

### 10.2 骑士气球

- 模型: `Model/骑士.glb` 克隆，scale=3
- 属性: HP=500，损伤=30，碰撞半径=1.5
- **动态血条**: PlaneGeometry 子元素，按 HP% 缩放 + 变色（绿→黄→红）
- 出现概率: 第 0 波起，`min(0.35, 0.08 + waveNumber * 0.025)`

### 10.3 波次分阶段生成

| 时间 | 阶段 | 生成方向 |
|:----:|:----:|----------|
| 0s | Phase 1 | 仅前方 |
| 15s | Phase 2 | 前方 + 左右 |
| 30s | Phase 3 | 全方向（含后方） |

- `updateWaveSpawning(dt)` 每帧调用，每秒一批
- 每批 `SPAWN_BATCH_SIZE=3` 个，同屏上限 `SPAWN_MAX_ACTIVE=10`
- 每波总数: `WAVE_BASE_SPAWN_COUNT(30) + waveNumber * 5`
- **波次结束**: 全部生成完毕 (`waveSpawnRemaining <= 0`) 且无活跃气球 → 触发抽卡

---

## 11. 碰撞系统

### 11.1 气球-气球排斥

```javascript
// O(n²) 双重循环，仅水平方向排斥，Y 衰减 0.3 倍
const overlap = minDist - dist;
const pushX = (dx / dist) * overlap * BALLOON_REPEL_FORCE * dt;
const pushZ = (dz / dist) * overlap * BALLOON_REPEL_FORCE * dt;
b.position.x += pushX; b.position.z += pushZ;
```

### 11.2 气球-船碰撞（防穿模）

- 船碰撞中心: `shipModel.position + (0, 1.0, 0)`
- 半径: `SHIP_COLLISION_RADIUS = 2.5`
- 排斥力: `SHIP_REPEL_FORCE = 2.0`（仅 X/Z）

### 11.3 子弹-气球碰撞

- 距离阈值: `balloon.radius + 0.05`
- 伤害: `STATE.playerStats.atk`（默认 30，抽卡升级）
- 击中 → 扣血 → HP≤0 → 爆炸 + 碎片/粒子 + 得分

### 11.4 气球撞船伤害

- 触发: 气球进入 `|x| <= 2, |z| <= 4` 区域
- 伤害: `BALLOON_DAMAGE = 5`/个
- 效果: 气球消失 + 碎片/粒子 + 音效 + 船闪烁（`shipHitFlash`）
- 船血 ≤ 0 → `gameOver()`

---

## 12. 抽卡系统（稀有度版）

### 12.1 触发

清空白波次所有气球后自动生成。

### 12.2 属性类型

| 属性 | 图标 | 效果 |
|:-----|:----:|:-----|
| 攻击力 (atk) | ⚔️ | 直接加数值到 `playerStats.atk` |
| 生命值 (hp) | ❤️ | 直接加数值到 `playerStats.hp` |
| 射速 (fireRate) | 🎯 | `fireRate += value/100` |
| 多重射击 (multiShot) | 🔫 | `multiShotChance += value` (%) |

### 12.3 稀有度

| 稀有度 | 颜色 | 数值 | 边框色 |
|:-------|:----:|:----:|:------:|
| 普通 | `#ffffff` | 10 | 白色 |
| 稀有 | `#4da6ff` | 20 | 蓝色 |
| 史诗 | `#b388ff` | 50 | 紫色 |
| 传说 | `#ffd700` | 100 | 金色 |

### 12.4 刷新机制

- 触碰下方绿色刷新卡，花费 `10 * 2^次数` 金币
- 有 2 秒冷却，冷却中按钮灰色显示倒计时
- 金币通过击杀获得（气球=10，骑士=30）

### 12.5 交互方式

- **左手射线选择**: 左手柄青色发光小球发射可见射线（与子弹同角度 -30° 上仰），射线指向的卡片高亮（移近 0.1m + 缩放 1.2x）
- 属性卡和刷新卡均支持高亮反馈
- 扳机确认选择（上升沿检测，避免持续触发）
- 3 张属性卡横向排列，间距 `CHOICE_CARD_SPACING=0.6m`
- 刷新卡在下方 `CHOICE_REFRESH_OFFSET_Y=-0.35m`
- 所有卡片固定在**出生点正前方**（不随头显旋转），始终面朝 -Z 方向
- 选卡期间玩家只能往出生点后方 1m 范围内活动
- 15 秒超时自动跳过

### 12.6 波次推进

选择/超时后 → 清理卡片 → 1 秒后:
1. `waveNumber++`
2. `spawnBalloons()` 开始下一波
3. 如来神掌在 `clearChoiceCards` 中由 `waveNumber >= 1` 条件触发，选关时通过 `buddhaPalmUnlocked` 标记在模型加载时即解锁

---

## 13. 死亡与重开

```
gameOver() → 所有气球 inactive → 1.5s → restartLevel()
                                                      |
                                                      v
                        keep waveNumber, 清除气球, 重置生成状态
                                      0.5s → 赠送抽卡机会
```

**关键设计**: 不清除波次、不清除抽卡升级属性。玩家在当前波次重新挑战，获得一次免费抽卡补偿。

---

## 14. 如来神掌

### 14.1 解锁

| 方式 | 条件 | 触发 |
|:-----|:-----|:-----|
| 正常游戏 | 打完第 0 波后 `clearChoiceCards` 中 `waveNumber >= 1` → `attachBuddhaPalmToLeft()` |
| 选关模式 | `sessionstart` 中 `selectedLevel > 0` → 设置 `STATE.buddhaPalmUnlocked = true`，模型已加载时直接调用，否则等加载回调 |

### 14.2 状态机

```
IDLE → (左手握柄上升沿 + 冷却结束) → 直接释放（无瞄准状态）→ IDLE(冷却8秒)
```

**简化说明**: 握柄即放，无预览、无瞄准等待、无二次确认。

### 14.3 全部参数

| 阶段 | 参数 | 值 | 说明 |
|:-----|:-----|:---:|:-----|
| 装备 | `BUDDHA_HAND_SCALE` | 0.2 | 装备在左手柄的缩放 |
|  | `BUDDHA_HAND_POS` | (0, -0.08, 0.03) | 相对 leftGrip 局部坐标 |
|  | `BUDDHA_HAND_ROT_X` | `-PI/2` | 平放（手掌朝下） |
| 释放 | `BUDDHA_FALL_START_SCALE` | 2.0 | 起始缩放 |
|  | `BUDDHA_FALL_END_SCALE` | 20.0 | 落地缩放 |
|  | `BUDDHA_FALL_HEIGHT` | 20m | 起始高度（玩家上方） |
|  | `BUDDHA_FALL_FORWARD` | 3m | 落地偏移（瞄准方向前方） |
|  | `BUDDHA_FALL_DURATION` | 0.5s | 下落动画时长 |
| 碰撞 | `BUDDHA_KILL_RADIUS` | 50m | 杀伤半径（覆盖全地图） |
|  | `BUDDHA_DAMAGE` | 1000 | 对气球伤害 |
|  | `BUDDHA_PARTICLE_COUNT` | 20 | 落地金色粒子数 |
| 冷却 | `BUDDHA_COOLDOWN` | 8s | 两次释放间隔 |
| 清理 | `BUDDHA_IMPACT_CLEANUP` | 0.3s | 落地后网格清理延迟 |

### 14.4 核心流程

1. **握柄释放** (IDLE → grip 上升沿 + cooldown=0):
   - 锁定 `aimDirection`（当前 camera 朝向，去 Y）
   - 20x 手掌从瞄准方向上方 20m 处 0.5s 落地
   - 手掌旋转设为 `-PI/2` 平放
   - 落地后半径 50m 内气球扣 1000 HP
   - 金色粒子爆炸
   - 冷却 8s 后可再次使用

---

## 14.5 云朵转场系统

### 14.5.1 触发

```
打完一关 → checkAllBalloonsDestroyed() → startCloudTransition()
  ↓
所有云向 +Z 移动 → Z>300 消失 → 重置到 Z=-320 重新移入
  ↓
新云朵移到目标位置（4个角+正前方）→ 转场完成
```

### 14.5.2 云朵组成

| 类型 | 数量 | 位置 | 行为 |
|:----|:---:|:-----|:-----|
| 转场云 | 5 | 4个角(xz=±15) + 正前方(0,-15) | 打完一关后向+Z移动 |
| 静态装饰云 | 12 | 场景各地 | 转场时同步向+Z移动（速度×1.2） |

### 14.5.3 全部参数

| 参数 | 值 | 说明 |
|:-----|:---:|:-----|
| `TRANSITION_SPEED` | 50 | 移动速度（m/s） |
| `TRANSITION_DISAPPEAR_Z` | 300 | 消失Z坐标（旧50改300） |
| `TRANSITION_SPAWN_Z` | -320 | 重生Z坐标（旧-55改-320） |
| `TRANSITION_CLOUD_Y` | 5 | 云朵高度（m） |
| `TRANSITION_CLOUD_SCALE` | 2 | 云朵大小 |

---

## 15. 特效系统

### 15.1 碎片（对象池 30 个）

- 几何体: `TetrahedronGeometry(0.04, 0)` 共享
- 物理: 重力 `-4.0` m/s², 阻力 `0.98`
- 旋转: 随机三轴角速度
- 透明度: `life / DEBRIS_LIFE`
- 自动回收: `life ≤ 0` 或 `y < -2`

### 15.2 粒子（对象池 50 个）

- 几何体: `SphereGeometry(0.01, 4, 4)`（各实例独立）
- 运动: 随机方向速度 + 阻尼 `0.98`
- 透明度: 线性衰减

---

## 16. 音效系统

全部使用 Web Audio API 代码生成，无外部音频文件。

| 音效 | 实现 | 参数 |
|:-----|:-----|:-----|
| 射击 | 白噪声 + lowpass 3000Hz | 增益 0.4, 衰减 0.1s |
| 气球爆炸 | 方波 200→800Hz 上行滑音 | 增益 0.6, 持续 0.3s |
| 背景音乐 | OfflineAudioContext 预渲染 4s 循环 | 16 鼓点 + 8 木琴, 增益 0.12 |
| AudioContext | 首次射击懒初始化 | 避免自动播放策略拦截 |

**BGM**: 16 个噪声鼓点 (0.25s/拍, lowpass 800Hz) + 8 个木琴旋律音 (523→1047Hz)

---

## 17. UI 系统

### 17.1 右手腕面板

- 触发: grip 按住 + 翻腕
- Canvas 512×256px, PlaneGeometry 0.18×0.09m
- ⚔️ 攻击 / 🎯 射速x / 🔫 多重% / 💥 范围m / 🏆 得分
- 更新频率: 每 5 帧

### 17.2 左手腕面板

| 模式 | 显示 |
|:----:|:-----|
| 默认 | 🚢 船血 X/100 | 💰 金币 X | 🖐 如来神掌 | ⏳ 冷却X% |
| 抽卡中 | 🎴 选择增益 | 👇 触碰卡片 | 🔄 刷新[冷却Xs] |

### 17.3 2D 页面 UI

| 元素 | 位置 | 说明 |
|:-----|:-----|:-----|
| `#loading` | 居中 | 加载动画 + 模型进度百分比 |
| `#js-status` | 右上角 | JS 执行状态指示器 |
| `#vr-entry` | 底部居中 | 两个进入 VR 按钮（正常/左手持枪） |
| `#time-switch` | 顶部居中 | 天空切换按钮 |
| `#log-panel` | 左侧 42vw | 诊断日志面板 |

---

## 18. 输入映射（PICO 4 手柄）

### 右手

| 输入 | Gamepad 索引 | 功能 |
|:-----|:-----------:|:-----|
| Trigger | buttons[0] | 射击 |
| Grip | buttons[1] | 按住显示右手腕面板 |
| Stick | axes[2]/[3] 回退 axes[0]/[1] | 移动（优先） |
| A | buttons[4] | 退出 VR |
| B | buttons[5] | 退出 VR |

### 左手

| 输入 | Gamepad 索引 | 功能 |
|:-----|:-----------:|:-----|
| Trigger | buttons[0] | 左手射击（左手模式） |
| Grip | buttons[1] | 两段式神掌 / 按住显示左手腕面板 |
| Stick | axes[2]/[3] | 移动（右摇杆无输入时回退） |
| X | buttons[4] | 天空循环 +1 |
| Y | buttons[5] | 天空循环 -1 |

---

## 19. 激光关卡（第三关）

`js/laser-level.js` | 约 745 行 | 独立游戏模式（非射击，躲避型）

### 19.1 触发条件

- **正常流程**: 波次1清空后，`waveNumber===2` → `STATE.gameMode = 'laser'`
- **选关**: 直接选第三关 → `startLaserLevel()` 跳过射击
- **天空**: `applySkyTarget('day')`（白天）
- **原场景**: `hideShootingScene()` 隐藏船/云/日月/容器/AK48，恢复时 `showShootingScene()`

### 19.2 坐标网格

- 6m×10m 1m 网格，居中于原点 (0,0,0)
- 坐标轴: X=红线, Z=蓝线, Y=绿线（正方向），灰色虚线（负方向）
- 每个气球上方有 Canvas Sprite 数字标签 ①-⑧

### 19.3 气球初始位置

全部 Z=-4，两列 X=±2.5，Y 从 0.5 递增到 6.7

### 19.4 动画序列状态机

```
INTRO(8s) → DRIVE(6s) → ANIM_1A(1s) → ANIM_1B(0.5s) → ANIM_2 → ANIM_3
                                                              ↓ 碰激光
                                                        handleLaserHit()
                                                          ├─ 黑屏1s
                                                          └─ freezeTimer
                                                               ↓ 结束
                                                        failures≥3 → CLEANUP
                                                        failures<3 → resetAndRestart()
                                                                      ↓
                                                                  回到 DRIVE
```

| 阶段 | 时长 | 内容 |
|:----|:----:|:-----|
| `INTRO` | 8.0s | 魔术师漂浮旋转表演 |
| `DRIVE` | 6.0s | 所有气球 Z:-4→2 |
| `ANIM_1A` | 1.0s | ③-⑧号 Z:2→0，①②号不动 |
| `ANIM_1B` | 0.5s | ③④号 rotation.z→0（激光垂直指向地面）|
| `ANIM_2` | ~3s | ①② Y振荡(0.2~4), ③④ Y+2→X振荡, ⑤-⑧ Z:0→-2 |
| `ANIM_3` | 持续 | ⑤⑥ Y振荡(周期6s), ⑦⑧ 旋转→Y4.5→X振荡 |
| `WINNING` | 1.5s | 魔术师飞到面前斜上方庆祝旋转 |
| `CLEARED` | — | 全部传说品质卡片×3 + 500金币 |

### 19.5 死亡机制

1. 碰激光 → `handleLaserHit()`: `freezeTimer=1s`, 黑屏(5×5×5方块), 瞬移安全区
2. 冻结结束 → `resetAndRestart()`: 清理旧气球→重新生成→回到 `DRIVE`
3. `invulnTimer=1s` 无敌保护
4. 失败3次 → 清理场景，恢复射击模式

### 19.6 通关条件

- 玩家走进 Z:-4 ~ -2.2 区间
- 触发 `WINNING` 阶段：魔术师飞到 (1.5, 5.5, -3) 庆祝
- 1.5s 后弹出 3 张全部传说品质卡片 + 500金币

### 19.7 碰撞检测

使用 `applyMatrix4(g.matrixWorld)` 将激光的局部端点变换到世界坐标，支持任意旋转方向。每 3 帧检测一次，高度偏移点 0.5/1.3/1.6m。

### 19.8 可调参数

| 参数 | 默认值 | 说明 |
|:-----|:------:|:-----|
| `magicianDur` | 8.0s | 开场时长 |
| `freezeDuration` | 1.0s | 黑屏冻结时长 |
| `maxFailures` | 3 | 最大失败次数 |
| `collisionRadius` | 0.15m | 激光碰撞半径 |
| `groupScale` | 0.25 | 气球整体缩放 |
| `laserLengthPreScale` | 16 → 4m | 激光长度（缩放后）|

## 20. 游戏状态机

### 19.1 整体流程

```
[桌面预览] → 点击"正常开始游戏"（或选关后进入）
      ↓
[VR 会话请求] → isSessionSupported() → requestSession('immersive-vr')
      ↓ sessionstart 事件
[attachAK48() / initAudio()] → 500ms → 选关逻辑 → 进入射击或激光模式
      ↓
      ├── 射击模式 (STATE.gameMode === 'shooting'):
      │   [波次0: 黄昏·有云] → 清空 → 抽卡 → waveNumber=1 → 
      │   [波次1: 夜晚·无云] → 清空 → 抽卡 → waveNumber=2 →
      │            ↓ waveNumber===2
      │   [STATE.gameMode = 'laser', 气球清理]
      │            ↓ index.html 检测到gameMode切换
      └── 激光模式 (STATE.gameMode === 'laser'):
              [hideShootingScene() 隐藏原场景]
              [applySkyTarget('day') 白天]
              [舞台网格 + 魔术师模型(8秒表演)]
              [8个激光气球登场] → [淡入] → [驱赶动画(2s)]
              → [第三排散落(1s)] → [第二排+第一排散落(1s)]
              → [FIGHTING: 玩家躲避激光走向终点]
                  ├── 碰到激光 → 黑屏方块包裹头显 → 冻结3秒
                  │     ├── 3次失败 → 关卡结束无奖励 → 恢复射击模式
                  │     └── <3次失败 → 1秒无敌 → 继续闯关
                  └── 到达终点(z<-3.5) → 奖励500金币+抽卡 → 恢复射击模式
```

### 19.2 波次→天空→云朵映射

| 波次 | 关卡 | 天空 | 云朵 |
|:----:|:----:|:----:|:----:|
| wave=0 | 第一关（射击） | 🌅 黄昏 | 可见 |
| wave=1 | 第二关（射击） | 🌙 夜晚 | 消失 |
| wave=2 | **第三关（激光）** | ☀️ 白天 | 可见 |
| wave≥3 | 后续射击 | ☀️ 白天 | 可见 |

### 19.3 关键状态变量

**`STATE` 对象**（`js/core.js`）:
- `gameMode`: `'shooting'` | `'laser'` — 当前游戏模式
- `gameStarted`: 是否开始战斗
- `gameOverState`: 是否死亡处理中
- `waveNumber`: 0-based 波次
- `shipHp`: 船血量
- `choiceCardsActive`: 是否抽卡中
- `buddhaPalmReady`: 神掌是否解锁
- `playerStats`: `{hp, score, atk, gold}`
- `fireRate`: 射速倍率（默认 1.0）
- `multiShotChance`: 多重射击概率 %

**sessionend 重置**: 所有 STATE 字段清零，`gameMode='shooting'`，清除选择卡和神掌，清理激光关卡。

---

## 20. 平台适配与性能

### 20.1 PICO 4 兼容问题

| 问题 | 解决方案 |
|:-----|:---------|
| `requestSession` 参数不兼容 | `isSessionSupported()` 检测 → 失败无参回退 |
| `import * as` 语法 Bug (Chrome/105) | **已规避**: 全部使用命名导入 + `GameAPI`/`VrAPI` 聚合对象 |
| CanvasTexture dispose+recreate 黑屏崩溃 | **已规避**: 纯色 `MeshBasicMaterial` 穹顶，不用动态纹理 |
| 大 GLB 加载超时 | Draco 压缩 + `isSessionSupported()` 回退延迟 |
| 自动播放策略 | AudioContext 首次射击懒加载 |

### 20.2 性能优化

| 措施 | 说明 |
|:-----|:-----|
| VR 关闭阴影 | `setShadow(false)` |
| 关闭 toneMapping | `THREE.NoToneMapping` |
| 降采样 | `setPixelRatio(min(DPR, 1.0))` |
| 关闭抗锯齿 | `antialias: false` |
| 对象池 | 子弹(20) 碎片(30) 粒子(50) |
| MeshBasicMaterial | 云朵、星空无光照材质 |
| 星空白天关闭 | `visible = false` |
| 面板降频 | 每 5 帧更新 Canvas 纹理 |

### 20.3 开发环境

- HTTP: `npx serve -l 3000 -s .`（PICO 专用）
- HTTPS: `node https_server_simple.js`（Chrome 调试）
- 自签名证书: `node generate-certs.js`
- PICO 访问: `http://<IP>:3000` 或 `https://192.168.0.114:3443/`

---

## 21. 3D 模型资源

| 模型 | 路径 | 用途 | 加载失败 |
|:-----|:-----|:-----|:---------|
| AK48 枪支 | `Model/Ak48.glb` | 主武器（挂载到手柄） | 显示错误提示 |
| 鲲鹏 | `Model/鲲鹏.glb` | 玩家乘坐的飞船模型 | 静默跳过 |
| 骑士 | `Model/骑士.glb` | 精英敌人（克隆） | 降级为普通气球 |
| 如来神掌 | `Model/如来神掌.glb` | 大招模型（克隆） | 不显示神掌 |
| 火焰 | `Model/火焰.glb` | 预留 | 未加载 |
| 气球船 | `Model/气球船.glb` | 已替换为鲲鹏 | 保留兼容 |

All Draco 压缩，CDN 解压。15 秒加载超时自动隐藏 loading。

---

## 22. 修改指南

### 22.1 调整游戏难度

```javascript
// js/core.js — 修改这些导出常量
WAVE_BASE_SPAWN_COUNT = 40;  // 更多敌人生成
SPAWN_BATCH_SIZE = 5;        // 更密集
SPAWN_MAX_ACTIVE = 15;       // 同屏更多
SHIP_MAX_HP = 80;            // 船更脆
BALLOON_SPEED = 0.8;         // 敌人更快
```

### 22.2 新增抽卡属性

```javascript
// js/game.js — ATTR_TYPES 数组
{ id: 'newAttr', label: '新能力', icon: '⭐',
  apply: (v) => { STATE.newAttr += v; },
  formatValue: (v) => `+${v}` }
```

### 22.3 调整天空颜色

修改 `js/core.js` 中 `skyPresets` 的 Hex 值。

### 22.4 新增模型

1. `.glb` 放入 `Model/` 目录
2. 在 `js/vr.js` 中添加 `gltfLoader.load()` 调用
3. `scene.add()` 或挂载到控制器

---

## 23. 代码定位速查

| 功能 | 搜索关键词 | 文件 |
|:-----|:----------|:----|
| 天空预设 | `skyPresets` | core.js |
| 过渡速度 | `exp(-0.12` | core.js |
| 气球参数 | `BALLOON_HP` | core.js |
| 骑士参数 | `KNIGHT_HP` | core.js |
| 神掌全部 | `releaseBuddhaPalm` | game.js |
| 神掌解锁 | `attachBuddhaPalmToLeft` | game.js |
| 抽卡系统 | `spawnChoiceCards` | game.js |
| 稀有度配置 | `RARITIES` | game.js |
| AK48 枪支 | `AK48_SCALE` | core.js |
| 枪支挂载 | `attachAK48()` | vr.js |
| 射击 | `fireOneBullet` | game.js |
| 音效 | `playBalloonPopSound` | vr.js |
| 手柄输入 | `updateInputs` | vr.js |
| 左手面板 | `updateLeftDebugPanel` | vr.js |
| 日志 | `__log` | logger.js |
| 左手射线球 | `leftRaySphere` | vr.js |
| 可见射线 | `RAY_PITCH_ANGLE` | vr.js |
| 选择卡固定 | `updateChoiceCards` | game.js |
| 选关按钮 | `selectedLevel` | index.html |
| 后坐力 | `updateGunRecoil` | vr.js |
| 后坐力参数 | `RECOIL_ROT_AMPLITUDE` | core.js |
| 云朵转场 | `updateTransitionClouds` | game.js |
| 转场参数 | `TRANSITION_SPEED` | core.js |
| 波次过渡 | `nextWaveTimer` | game.js |

---

## 24. Git 工作流

```bash
# Git 路径
E:\01_AI\WebXR_Ce\PortableGit\cmd\git.exe

# 常用操作
git pull --rebase              # 先拉取
git add .                      # 暂存
git commit -m "feat: xxx"      # 提交
git push                       # 推送到 origin/master

# 注意：推送前需用户确认
```

---

## 25. 术语表

| 术语 | 含义 |
|:-----|:-----|
| dolly | Three.js 中承载 camera 的移动根 Group |
| grip | VR 手柄握柄侧键 (buttons[1]) |
| Draco | Google 3D 几何压缩库 |
| 对象池 | 预创建对象循环使用，避免 GC |
| 抽卡 | 波次奖励系统，4 属性 × 4 稀有度 |
| 如来神掌 | 清屏大招，巨大手掌从空中落下 |
| 骑士 | 精英气球敌人（更大、带血条） |
| shipHp | 气球船血量（撞船扣血） |
| 多重射击 | 概率性额外子弹 |

---

## 26. GitHub Pages 部署

`github-pages/` 目录包含独立的单文件可运行版本（WebXR）。

---

*文档生成时间: 2026-05-12 | 模块化架构 | Three.js r168 | WebXR immersive-vr*
