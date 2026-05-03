# VR 热气球射击游戏

基于 WebXR 的 VR 热气球托盘射击场景，支持 PICO VR 和 Meta Quest。

## 在线体验

[点击进入 VR 游戏](https://你的用户名.github.io/vr-balloon-shooter/)

## 操作说明

- 🔫 **扳机** - 射击
- 🕹️ **摇杆** - 移动
- 🅰️ **A键** - 退出 VR

## 技术栈

- WebXR Device API
- Three.js
- GLTFLoader + DRACOLoader

## 本地运行

```bash
# 使用 Python 启动本地服务器
python -m http.server 8080

# 或使用 Node.js
npx serve .
```

然后在 VR 浏览器中访问 `http://localhost:8080`
