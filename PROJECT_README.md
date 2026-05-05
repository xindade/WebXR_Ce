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

一个基于 **Three.js + WebXR** 的 VR 热气球射击游戏。玩家乘坐热气球，用右手 AK48 射击气球，每清完一波可选择强化卡，第二波起出现骑士气球，打完第二波解锁如来神掌技能。

- **框架**: Three.js r168+ (ES Module)
- **VR 运行时**: WebXR (PICO 4 / Meta Quest)
- **3D 模型格式**: glTF Binary (`.glb`)，Draco 压缩
- **HTTP 服务器**: `npx serve` 或 `npx http-server`

---

## 2. 环境要求

| 项目 | 版本/要求 |
|------|----------|
| Node.js | ≥ 16.x（用于运行 HTTP 服务器） |
| 浏览器 | Chrome/Edge ≥ 90（支持 WebXR） |
| VR 设备 | PICO 4 / PICO 4 Ultra / Meta Quest 2/3 |
| 操作系统 | Windows / macOS / Linux |

> **注意**: PICO 浏览器默认允许 HTTP 访问本地内容，无需 HTTPS 证书。如果使用 Chrome 测试 WebXR，需要 HTTPS。

---

## 3. 项目文件结构

```
WebXR_Ce/
├── index.html                 # 主入口（全部游戏逻辑）
├── three.module.js            # Three.js ES Module 核心库 (~1.3MB)
├── GLTFLoader.js              # GLTF 独立加载器（备用）
├── BufferGeometryUtils.js     # Three.js 工具类
│
├── Ak48.glb                   # AK48 枪支模型 (Draco 压缩)
├── ReQiQiu1.glb               # 热气球模型 (Draco 压缩)
│
├── image/                     # 贴图资源
│   ├── sun.png                # 太阳贴图 (PNG, 透明背景, 512×512)
│   ├── moon.png               # 月亮贴图 (PNG, 透明背景, 512×512)
│   └── smile.png              # 气球笑脸贴图 (PNG)
│
├── Model/                     # 3D 模型
│   ├── 骑士.glb               # 骑士气球模型
│   ├── 如来神掌.glb           # 如来神掌技能模型
│   └── 火焰.glb               # 火焰效果模型（未使用）
│
├── jsm/
│   └── loaders/
│       ├── GLTFLoader.js      # GLTF 加载器
│       └── DRACOLoader.js     # Draco 解压加载器
│
├── draco/                     # Draco WebAssembly 解压器
│   ├── draco_decoder.js
│   ├── draco_decoder.wasm
│   └── draco_wasm_wrapper.js
│
├── start_server.bat           # 一键启动 HTTP 服务器 (Windows)
├── start_https_server.bat     # 一键启动 HTTPS 服务器 (Windows)
└── PROJECT_README.md          # 本文档
```

---

## 4. 启动方式

### 4.1 Windows 一键启动（推荐）

双击 `start_server.bat`，启动后访问 `http://localhost:3000`。

### 4.2 手动启动

```bash
# 方法1: 使用 npx serve（推荐，简单）
cd /path/to/WebXR_Ce
npx serve -l 3000 -s .

# 方法2: 使用 npx http-server（需要 HTTPS 时）
npx http-server -p 3443 -S -C localhost+1.pem -K localhost+1-key.pem

# 方法3: Python 内置服务器（仅测试，不支持 VR）
python -m http.server 3000
```

### 4.3 PICO 设备访问

1. 确保 PICO 和电脑在同一局域网
2. 查看电脑 IP 地址（`ipconfig`）
3. PICO 浏览器访问: `http://<电脑IP>:3000`
4. 点击「🎈 正常开始游戏」进入 VR

### 4.4 Draco 解压器来源

项目使用 Google Draco 压缩的 `.glb` 模型，解压器从 CDN 加载：

```
https://www.gstatic.com/draco/versioned/decoders/1.5.6/
```

> **离线部署**: 如果服务器无法访问外网，需要将 `draco/` 目录下的三个文件放到本地，然后在代码中修改 `dracoLoader.setDecoderPath('./draco/')`。

---

## 5. 模型与资源说明

### 5.1 模型列表

| 文件名 | 位置 | 用途 | 格式 | 大小 |
|--------|------|------|------|------|
| `Ak48.glb` | 根目录 | 右手枪支 | Draco GLB | 456KB |
| `ReQiQiu1.glb` | 根目录 | 热气球场景 | Draco GLB | 453KB |
| `骑士.glb` | `Model/` | 骑士气球（第2波起） | GLB | 845KB |
| `如来神掌.glb` | `Model/` | 大招技能（第3波起） | GLB | 430KB |
| `火焰.glb` | `Model/` | 预留特效 | GLB | 471KB |

### 5.2 贴图列表

| 文件名 | 位置 | 用途 | 格式要求 |
|--------|------|------|----------|
| `sun.png` | `image/` | 太阳精灵 | PNG, 透明背景, 512×512 推荐 |
| `moon.png` | `image/` | 月牙精灵 | PNG, 透明背景, 512×512 推荐 |
| `smile.png` | `image/` | 气球笑脸贴图 | PNG, 任意尺寸 |

### 5.3 图片加载机制

太阳/月亮/气球贴图采用**双轨加载**：

1. **Canvas 备用纹理**: 代码内置 Canvas 绘制的径向渐变太阳/月牙纹理，图片加载失败时自动使用
2. **外部图片**: 启动时自动尝试加载 `image/sun.png` 等，加载成功替换备用纹理

> 图片不放在 `image/` 目录也不影响运行，会自动使用 Canvas 备用纹理。

### 5.4 Draco 压缩模型处理方式

项目中的 `.glb` 文件（Ak48、ReQiQiu1）使用 **Google Draco** 压缩，文件体积可缩小 10-20 倍。加载流程：

```
GLTFLoader.load('Ak48.glb')
  → DRACOLoader 检测到 Draco 压缩
    → 下载 draco_decoder.wasm（WebAssembly 解压器）
      → 解压 → 返回标准 Three.js Scene
```

**如果要在新电脑上用 Draco 模型：**
1. 从 [Google Draco Releases](https://github.com/google/draco/releases) 下载解码器
2. 或将 `draco/` 目录整体复制
3. 在代码中设置本地路径: `dracoLoader.setDecoderPath('./draco/')`

---

## 6. 核心系统架构

### 6.1 场景层级

```
Scene
├── AmbientLight (动态天色)
├── DirectionalLight (太阳光，动态)
├── HemisphereLight (半球光，动态)
├── balloonGroup (气球 + 骑士)
├── bulletGroup (子弹对象池)
├── particleGroup (粒子对象池)
├── cloudLayers (已废弃，空数组)
├── cloud meshes × 12 (3D 装饰云，世界空间)
├── ReQiQiu1 热气球模型
├── buddhaPalmSkills (飞行中的神掌)
└── dolly (玩家跟随组)
    ├── camera
    ├── skyDome (天空穹顶，动态变色)
    ├── starLayers[3] (星空粒子)
    ├── sunSprite (太阳精灵)
    ├── moonSprite (月牙精灵)
    ├── choiceCardGroup (强化选择卡)
    ├── leftController / leftGrip
    └── rightController / rightGrip
        ├── AK48 枪支模型
        └── debugPanel (手腕 UI)
```

### 6.2 日夜黄昏天空系统

三个预设，30 秒平滑过渡：

| 预设 | 天空色 | 太阳仰角 | 月亮仰角 | 环境光 | 星空 |
|------|--------|:------:|:------:|--------|:----:|
| day | `#87CEEB` 天蓝 | 50° 高空 | -30° 地下 | 1.2 | 无 |
| dusk | `#E85D26` 橙红 | 5° 地平线 | 5° 对面 | 0.7 | 微弱 |
| night | `#0A0A28` 深蓝 | -25° 地下 | 50° 高悬 | 0.35 | 满 |

**切换方式**:
- 页面按钮: ☀️白天 / 🌅黄昏 / 🌙夜晚
- VR 手柄: 左手 X/Y 键循环切换
- 过渡时间: ~30 秒指数缓动

### 6.3 移动系统

- **方式**: 真实移动 dolly（玩家组），钳制在 **4×8 米** 范围（X: ±2, Z: ±4）
- **控制**: VR 手柄摇杆
- **效果**: 所有世界物体（云朵、气球、热气球）自然相对运动

### 6.4 气球波次系统

| 波次 | 普通气球 | 骑士气球 | 特殊事件 |
|:----:|:------:|:------:|----------|
| 0 | 10 | 0 | 初始波 |
| 1 | 7~9 | 1~3 | — |
| 2 | 7~9 | 1~3 | 🖐️ 清完解锁如来神掌 |

每清完一波弹出 3 张**强化选择卡**（左手触碰选择）：
- ❤️ 生命值 +100
- ⚔️ 攻击力 +20
- 🔫 多一发子弹

### 6.5 如来神掌技能

| 属性 | 值 |
|------|-----|
| 解锁 | 打完第 2 波 |
| 释放 | 左手握柄侧键 (grip) |
| 冷却 | 8 秒 |
| 效果 | 从头顶 20m 落下，掌心朝下，落地击杀半径 5m 内所有气球 |
| 特效 | 40 个金色粒子爆炸 |

### 6.6 输入映射

| 按键 | 功能 |
|------|------|
| 右手扳机 | 射击 |
| 左/右摇杆 | 移动 |
| 右手 A/B | 退出 VR |
| 左手 X/Y | 切换天空（白天/黄昏/夜晚） |
| 左手握柄 | 如来神掌（解锁后） |
| 左手扳机 | 左手模式射击 |

---

## 7. 可调参数速查

所有参数在 `index.html` 中搜索对应注释即可定位。

### 7.1 天空预设

```javascript
// 搜索: "天空预设：白天 / 黄昏 / 夜晚"
skyPresets = {
    day:   { bg: 0x87CEEB, sunElev: 50, moonElev: -30, stars: 0    },
    dusk:  { bg: 0xe85d26, sunElev: 5,  moonElev: 5,   stars: 0.25 },
    night: { bg: 0x0a0a28, sunElev: -25, moonElev: 50, stars: 1.0  },
}
```

### 7.2 气球

```javascript
// 搜索: "气球参数速查表"
BALLOON_COUNT = 10      // 每波数量
BALLOON_HP    = 100     // 生命值
BALLOON_SPEED = 0.5     // 移动速度(米/秒)
BALLOON_RADIUS = 0.5    // 碰撞半径(米)
BALLOON_SCORE = 10      // 得分
BULLET_DAMAGE = 30      // 子弹伤害
```

### 7.3 骑士

```javascript
// 搜索: "骑士气球配置"
KNIGHT_HP    = 500      // 生命值
KNIGHT_SCORE = 30       // 得分
KNIGHT_SCALE = 3        // 模型缩放
KNIGHT_RADIUS = 0.5 * KNIGHT_SCALE  // 碰撞半径(自动)
```

### 7.4 如来神掌

```javascript
// 搜索: "BUDDHA_COOLDOWN"
BUDDHA_COOLDOWN = 8     // 冷却时间(秒)
// 在 releaseBuddhaPalm() 中:
palm.scale.setScalar(3.0)   // 神掌大小
dropPos.y += 20             // 出现高度
ud.killRadius = 5           // 击杀半径
ud.fallSpeed = 15           // 下落速度
```

### 7.5 移动边界

```javascript
// 搜索: "移动范围限制"
BOUND_X = 2   // X 半宽(总宽4米)
BOUND_Z = 4   // Z 半宽(总深8米)
MOVE_SPEED = 3.5
```

### 7.6 枪支 (AK48)

```javascript
// 搜索: "AK48 枪支配置区"
AK48_SCALE = 0.6                    // 缩放
gunInstance.position.set(0, -0.1, 0.01)  // 位置
gunInstance.rotation.x = -20        // 俯仰
gunInstance.rotation.y = Math.PI/2  // 偏航(90° 枪管朝前)
```

### 7.7 子弹

```javascript
// 搜索: "子弹参数速查表"
BULLET_SPEED = 15       // 速度(米/秒)
BULLET_LIFE  = 2        // 存活(秒)
SHOOT_COOLDOWN = 150    // 冷却(毫秒)
```

### 7.8 热气球模型 (ReQiQiu1)

```javascript
// 搜索: "ReQiQiu1 热气球模型配置"
ReQiQiu1_SCALE = 1.0       // 缩放
ReQiQiu1_POS  = [0, 0, -5] // 位置 [X, Y, Z]
ReQiQiu1_ROT  = [0, 0, 0]  // 旋转 [X, Y, Z] 弧度
```

### 7.9 星空

```javascript
// 搜索: "星空粒子"
starTex = createGlowTexture(...)  // 光点纹理
count = 80 + layer * 50           // 每层数量 (80+130+180=390)
size = 0.35 + layer * 0.1         // 光点大小
phi = Math.pow(Math.random(), 2.5) * ...  // 分布(头顶最密)
```

---

## 8. 操作说明

### 8.1 桌面端（非VR）

- 页面顶部三个按钮切换白天/黄昏/夜晚
- 其他功能需要在 VR 模式下使用

### 8.2 VR 模式

| 操作 | 手柄 | 按键 |
|------|------|------|
| 射击 | 右手 | 扳机 |
| 移动 | 任意 | 摇杆 |
| 退出 VR | 右手 | A 或 B |
| 切换天空 | 左手 | X (下一个) / Y (上一个) |
| 如来神掌 | 左手 | 握柄侧键 |
| 选择强化卡 | 左手 | 触碰选择卡 |

---

## 9. 常见问题

### Q: 启动后页面空白/模型不加载？
A: 必须通过 HTTP 服务器打开，不能直接双击 HTML 文件。使用 `npx serve -l 3000 -s .`。

### Q: PICO 浏览器看不到页面？
A: 确保 PICO 和电脑在同一 WiFi。检查电脑防火墙是否阻止了 3000 端口。尝试用 `npx serve -l 3000 --cors`。

### Q: Draco 模型加载报错？
A: 检查 `draco/` 目录是否存在且包含三个文件，或确保 CDN `gstatic.com` 可访问。

### Q: 太阳/月亮是空白圆圈？
A: 将 `image/sun.png` 和 `image/moon.png` 放到正确位置。图片必须是 **PNG 透明背景**。

### Q: 气球笑脸看不到？
A: 将 `image/smile.png` 放到 `image/` 目录下。

### Q: 骑士/神掌模型不出现？
A: 将 `Model/骑士.glb` 和 `Model/如来神掌.glb` 放到 `Model/` 目录下。

### Q: 移动方向反了？
A: 不同 VR 手柄摇杆轴方向可能不同。在 `handleMovement` 中调整 `sy = -sy` 的符号。

---

## 10. 换电脑/AI工具迁移指南

### 10.1 最小可用文件清单

换一台电脑后，以下文件必须完整复制：

```
必需文件:
├── index.html              # 核心文件
├── three.module.js         # Three.js 库
├── jsm/loaders/            # GLTF + Draco 加载器
│   ├── GLTFLoader.js
│   └── DRACOLoader.js
├── draco/                  # Draco WASM 解压器（如果离线）
│   ├── draco_decoder.js
│   ├── draco_decoder.wasm
│   └── draco_wasm_wrapper.js
├── Ak48.glb                # 枪支模型
└── ReQiQiu1.glb            # 热气球模型（可选）

可选资源:
├── image/
│   ├── sun.png             # 可选，缺失使用 Canvas 备用
│   ├── moon.png            # 可选，缺失使用 Canvas 备用
│   └── smile.png           # 可选，缺失气球为白色
└── Model/
    ├── 骑士.glb            # 可选，缺失骑士降级为普通气球
    └── 如来神掌.glb        # 可选，缺失不显示神掌技能
```

### 10.2 给 AI 工具的提示词模板

```
这是一个 Three.js WebXR VR 游戏项目。
入口文件是 index.html（单文件 ~2200 行），
使用 ES Module 导入 three.module.js，
GLB 模型使用 Draco 压缩（CDN 解压: gstatic.com/draco/1.5.6/）。
HTTP 服务器用 "npx serve -l 3000 -s ." 启动。
核心文件是 index.html，其他都是静态资源。
请阅读 index.html 后开始工作。
```

### 10.3 Git 版本管理

```bash
git init
git add -A
git commit -m "VR 热气球射击游戏完整项目"

# .gitignore 建议内容:
node_modules/
.cache/
*.log
```

### 10.4 http-server 安装（首次使用）

```bash
npm install -g serve        # 推荐，零配置
# 或
npm install -g http-server  # 需要更多配置选项
```

---

> 📅 最后更新: 2025-05-04 | Three.js r168+ | WebXR Immersive-VR
