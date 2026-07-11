// 动画录制工具本地服务器
// 使用方法: node server.js
// 然后打开 http://localhost:3000/anim-recorder.html

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const ROOT = path.join(__dirname, '..'); // WebXR_Ce 根目录

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.png': 'image/png',
  '.wasm': 'application/wasm',
};

http.createServer((req, res) => {
  let url = req.url.split('?')[0];
  if (url === '/') url = '/Model_Copy/anim-recorder.html';
  const filePath = path.join(ROOT, url);
  
  // 安全检查：防止访问 ROOT 之外的路径
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403); res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('404 Not Found: ' + url);
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, '0.0.0.0', () => {
  console.log('=== VR 动画录制工具 ===');
  console.log('服务器已启动:');
  console.log('  本机:    http://localhost:' + PORT + '/Model_Copy/anim-recorder.html');
  console.log('  PICO:    http://<电脑IP>:' + PORT + '/Model_Copy/anim-recorder.html');
  console.log('  原项目:  http://<电脑IP>:' + PORT + '/');
  console.log('按 Ctrl+C 停止');
});