# 🎈 VR 热气球射击游戏 — 项目文档

## 目录
1. [项目概述](#1-项目概述)
2. [环境要求](#2-环境要求)
3. [项目文件结构](#3-项目文件结构)
4. [启动方式](#4-启动方式)
5. [模型与资源说明](#5-模型与资源说明)
6. [核心系统架构](#6-核心系统架构)
7. [可调参数速查](#7-可调参数速查)
8. [操作说明](#8-操作说明)
9. [常见问题](#9-常见问题)
10. [换电脑/AI工具迁移指南](#10-换电脑ai工具迁移指南)

---

## 1. 项目概述

一个基于 **Three.js + WebXR** 的 VR 热气球射击游戏。玩家站在热气球托盘（气球船）上，用 AK48 射击从四周涌来的气球敌人，通过波次战斗、抽卡升级、如来神掌大招等机制推进游戏。

- **框架**: Three.js r168+ (ES Module)
- **VR 运行时**: WebXR (PICO 4 / Meta Quest)
- **3D 模型格式**: glTF Binary (`.glb`)，Draco 压缩
- **架构**: 模块化拆分 (`index.html` + `js/core.js` + `js/game.js` + `js/vr.js`)
- **HTTP 服务器**: `npx serve` 或 Python 内置服务器

---

## 2. 环境要求

| 项目 | 版本/要求 |
|------|----------|
| Node.js | ≥ 16.x（用于运行 HTTP 服务器） |
| 浏览器 | Chrome/Edge ≥ 90（支持 WebXR） |
| VR 设备 | PICO 4 / PICO 4 Ultra / Meta Quest 2/3 |
| 操作系统 | Windows / macOS / Linux |

> **注意**: PICO 浏览器默认允许 HTTP 访问本地内容，无需 HTTPS 证书。

---

## 3. 项目文件结构

```
WebXR_Ce/
├── index.html                 # 入口（初始化 + VR 会话 + 动画循环）
│
├── js/                        # 模块化逻辑代码
│   ├── logger.js              # 独立日志系统（模块加载前执行）
│   ├── core.js                # 常量/STATE/场景/灯光/天空/云朵
│   ├── game.js                # 战斗系统（子弹/气球/波次/抽卡/神掌/特效）
│   └── vr.js                  # VR 系统（音效/模型加载/手柄/枪支/UI面板）
│
├── three.module.js            # Three.js ES Module 核心库 (~1.3MB)
├── jsm/loaders/               # Three.js addons
│   ├── GLTFLoader.js          # GLTF 加载器
│   └── DRACOLoader.js         # Draco 解压加载器
│
├── Model/                     # 3D 模型（全部 Draco 压缩）
│   ├── Ak48.glb               # 枪支
│   ├── 气球船.glb             # 热气球场景
│   ├── 骑士.glb               # 骑士气球
│   ├── 如来神掌.glb           # 大招技能
│   ├── 火焰.glb               # 预留特效
│   └── 鲲鹏.glb               # 预留
│
├── image/                     # 贴图资源
│   ├── sun.png                # 太阳贴图 (PNG, 透明背景)
│   ├── moon.png               # 月亮贴图 (PNG, 透明背景)
│   └── smile.png              # 气球笑脸贴图
│
├── draco/                     # Draco WASM 解压器（离线备用）
│
├── pico-vr-app/               # Capacitor 打包的 PICO Android 原生应用
│
├── github-pages/              # 独立 GitHub Pages 部署版
│
├── TECH_README.md             # 技术文档（详细技术参考）
├── PROJECT_GUIDE.md           # 完整项目白皮书
└── PROJECT_README.md          # 本文档
```

---

## 4. 启动方式

### 4.1 一键启动（推荐）

```bash
cd /path/to/WebXR_Ce
npx serve -l 3000 -s .
```

### 4.2 PICO 设备访问

1. 确保 PICO 和电脑在同一局域网
2. 查看电脑 IP 地址（`ipconfig`）
3. PICO 浏览器访问: `http://<电脑IP>:3000`
4. 点击「🎈 正常开始游戏」进入 VR

### 4.3 Draco 解压器

默认从 CDN 加载: `https://www.gstatic.com/draco/versioned/decoders/1.5.6/`
离线部署改为本地: 修改 `js/vr.js` 中 `dracoLoader.setDecoderPath('./draco/')`

---

## 5. 模型与资源说明

### 5.1 模型列表

| 文件名 | 位置 | 用途 | 备注 |
|--------|------|------|------|
| `Ak48.glb` | `Model/` | 手持枪支 | 加载失败显示错误 |
| `气球船.glb` | `Model/` | 热气球场景 | 加载失败静默跳过 |
| `骑士.glb` | `Model/` | 精英敌人 | 加载失败降级为普通气球 |
| `如来神掌.glb` | `Model/` | 大招技能 | 加载失败不显示神掌 |

### 5.2 贴图加载机制

太阳/月亮/气球贴图采用**双轨加载**：
1. **Canvas 备用纹理**: 代码内置 Canvas 纹理，图片加载失败时自动使用
2. **外部图片**: 自动尝试加载 `image/sun.png` 等，加载成功替换备用纹理

> 图片不放在 `image/` 目录也不影响运行。

---

## 6. 核心系统架构

### 6.1 模块分工

| 模块 | 职责 |
|------|------|
| `index.html` | 入口、VR 会话、动画循环、UI 部分（桌面按钮/日志面板） |
| `js/core.js` | 常量配置、共享状态 STATE、Three.js 核心（渲染器/场景/相机）、灯光、天空、云朵 |
| `js/game.js` | 子弹对象池、气球系统、波次生成、碰撞检测、抽卡系统、如来神掌、特效（碎片/粒子） |
| `js/vr.js` | 音效（Web Audio API）、模型加载（GLTFLoader+DRACOLoader）、手柄设置、枪支挂载、输入处理、UI 面板 |

### 6.2 日夜黄昏天空系统

三个预设，30 秒平滑过渡：

| 预设 | 天空色 | 太阳仰角 | 月亮仰角 | 环境光 | 星空 |
|------|--------|:------:|:------:|--------|:----:|
| day | `#87CEEB` 天蓝 | 50° 高空 | -30° 地下 | 1.2 | 无 |
| dusk | `#E85D26` 橙红 | 5° 地平线 | 5° 对面 | 0.7 | 微弱 |
| night | `#0A0A28` 深蓝 | -25° 地下 | 50° 高悬 | 0.35 | 满 |

切换: 页面按钮 或 VR 左手 X/Y 键。

### 6.3 移动系统

真实移动 dolly（玩家组），钳制在 **4×8 米** 范围（X: ±2, Z: ±4）。

### 6.4 波次生成系统

分阶段、分方向持续生成（非一次性生成）：
- 阶段1（0~15秒）：仅前方
- 阶段2（15~30秒）：前方 + 左右
- 阶段3（30秒+）：全方向（含后方）
- 每秒 3 个，同屏上限 10 个

### 6.5 抽卡系统（稀有度版）

清完一波弹出 4 张卡（3 属性 + 1 刷新）：
- 属性卡: 随机 4 种属性（攻击/生命/射速/多重射击）× 4 种稀有度（普通/稀有/史诗/传说）
- 刷新卡: 花费金币重新随机

### 6.6 如来神掌技能

| 属性 | 值 |
|------|-----|
| 解锁 | 打完第 0 波 |
| 释放 | 左手握柄侧键 (grip) 两段式 |
| 冷却 | 8 秒 |
| 效果 | 20 倍手掌从头顶 20m 落下，半径 10m，伤害 1000 |

---

## 7. 可调参数速查

所有参数在 `js/core.js` 中搜索对应名称即可定位。

| 参数 | 值 | 说明 |
|------|:---:|------|
| `BALLOON_HP` | 100 | 气球生命值 |
| `BALLOON_SPEED` | 0.5 | 气球移动速度 (m/s) |
| `BALLOON_RADIUS` | 0.5 | 碰撞半径 (m) |
| `KNIGHT_HP` | 500 | 骑士生命值 |
| `SHIP_MAX_HP` | 100 | 船最大生命值 |
| `BULLET_SPEED` | 15 | 子弹速度 (m/s) |
| `SHOOT_COOLDOWN` | 150 | 射击冷却 (ms) |
| `MOVE_SPEED` | 3.5 | 摇杆移动速度 (m/s) |
| `BOUND_X/BOUND_Z` | 2/4 | 移动边界 |
| `AK48_SCALE` | 0.6 | 枪支缩放 |
| `BUDDHA_COOLDOWN` | 8 | 神掌冷却 (秒) |
| `SPAWN_BATCH_SIZE` | 3 | 每批生成数 |
| `SPAWN_MAX_ACTIVE` | 10 | 同屏上限 |

---

## 8. 操作说明

### VR 模式

| 操作 | 手柄 | 按键 |
|------|------|------|
| 射击 | 右手 | 扳机 |
| 移动 | 任意 | 摇杆 |
| 退出 VR | 右手 | A 或 B |
| 切换天空 | 左手 | X / Y |
| 如来神掌 | 左手 | 握柄侧键 (两段式) |
| 选择强化卡 | 左手 | 触碰选择卡 |
| 翻腕面板 | 任意 | 握柄按住 + 翻腕 |

---

## 9. 常见问题

### Q: 启动后页面空白？
A: 必须通过 HTTP 服务器打开，如 `npx serve -l 3000 -s .`。

### Q: PICO 浏览器看不到页面？
A: 确保在同一 WiFi。检查防火墙是否阻止 3000 端口。

### Q: 左侧出现绿色日志面板？
A: 这是正常的诊断面板（开发模式），显示模块加载状态和执行心跳。

### Q: 骑士/神掌模型不出现？
A: 将对应 `.glb` 放到 `Model/` 目录下。

---

## 10. 换电脑/AI工具迁移指南

### 10.1 最小可用文件清单

```
必需文件:
├── index.html              # 入口
├── js/                     # 全部模块代码
│   ├── logger.js
│   ├── core.js
│   ├── game.js
│   └── vr.js
├── three.module.js         # Three.js 库
├── jsm/loaders/            # GLTF + Draco 加载器
│   ├── GLTFLoader.js
│   └── DRACOLoader.js
├── Model/Ak48.glb          # 枪支模型
├── Model/气球船.glb        # 热气球场景（可选）
└── draco/                  # Draco WASM 解压器（如果离线）

可选资源:
├── image/                  # 贴图（可选，使用 Canvas 备用）
└── Model/                  # 骑士/神掌/火焰（可选）
```

### 10.2 Git 版本管理

```bash
git add .
git commit -m "feat: xxx"
git push

# .gitignore 建议:
node_modules/
.cache/
*.log
```

---

> 📅 最后更新: 2026-05-07 | Three.js r168+ | WebXR Immersive-VR
