# GitHub Pages 部署说明

## 📁 文件清单

```
github-pages/
├── .github/
│   └── workflows/
│       └── deploy.yml      # GitHub Actions 自动部署
├── index.html              # 主页面（已修改支持点击任意位置进入VR）
├── three.module.js         # Three.js 核心库
├── Ak48.glb               # 3D 模型
├── draco/                  # Draco 解码器
│   ├── draco_decoder.js
│   ├── draco_decoder.wasm
│   └── draco_wasm_wrapper.js
├── jsm/                    # Three.js 模块
│   ├── loaders/
│   │   ├── DRACOLoader.js
│   │   └── GLTFLoader.js
│   └── utils/
│       └── BufferGeometryUtils.js
├── image/                  # 图片资源
└── README.md              # 说明文档
```

## 🚀 部署步骤

### 1. 在 GitHub 创建新仓库

1. 登录 GitHub
2. 点击右上角 **+** → **New repository**
3. 仓库名称：`vr-balloon-shooter`
4. 选择 **Public**
5. 点击 **Create repository**

### 2. 上传文件

**方法 A：网页上传（推荐新手）**

1. 进入新创建的仓库
2. 点击 **Add file** → **Upload files**
3. 将 `github-pages` 文件夹内所有内容拖拽上传
4. 点击 **Commit changes**

**方法 B：Git 命令行**

```bash
# 进入部署目录
cd D:\01_AI\WebXR_Ce\github-pages

# 初始化 Git
git init
git add .
git commit -m "Initial commit: VR Balloon Shooter"

# 连接远程仓库（替换为你的用户名）
git remote add origin https://github.com/你的用户名/vr-balloon-shooter.git
git branch -M main
git push -u origin main
```

### 3. 启用 GitHub Pages

1. 进入仓库 → **Settings**
2. 左侧菜单找到 **Pages**
3. **Source** 选择 **GitHub Actions**
4. 等待自动部署完成（约 1-2 分钟）

### 4. 访问游戏

部署完成后，访问地址：
```
https://你的用户名.github.io/vr-balloon-shooter/
```

---

## 🔧 修改 APK 配置

部署完成后，修改 `MainActivity.java`：

```java
// 第 17 行
private static final String WEBXR_URL = "https://你的用户名.github.io/vr-balloon-shooter/";
```

然后重新编译 APK。

---

## 📱 PICO 设备使用

1. 在 PICO 浏览器中访问上述 URL
2. 点击屏幕任意位置进入 VR
3. 或安装修改后的 APK（自动打开浏览器进入 VR）

---

## ⚠️ 注意事项

1. **HTTPS 必须**：GitHub Pages 自动提供 HTTPS，WebXR 要求 HTTPS
2. **文件大小**：总大小约 7MB，首次加载可能需要几秒
3. **缓存**：更新文件后可能需要清除浏览器缓存

---

## 🎮 测试

部署后可以用 PC 浏览器访问测试（会显示 3D 场景，VR 功能需要在 VR 设备上测试）。
