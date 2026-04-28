const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PORT = 3443;
const DIR = __dirname;

// 生成自签名证书
function generateCerts() {
    console.log('生成自签名证书...');
    try {
        execSync(`node -e "
const { generateKeyPairSync, createSign } = require('crypto');
const fs = require('fs');

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
});

const cert = require('selfsigned')({
    keys: [{ key: privateKey }]
});

// 这里用简化方法
"`, { stdio: 'inherit' });
    } catch (e) {}
    
    // 使用 npx mkcert 或 openssl
    try {
        execSync('npx --yes mkcert localhost', { stdio: 'inherit', cwd: DIR });
        console.log('证书生成成功');
        return true;
    } catch (e) {
        console.log('mkcert 失败，尝试其他方法...');
        return false;
    }
}

// 检查证书是否存在
if (!fs.existsSync(path.join(DIR, 'cert.pem')) || !fs.existsSync(path.join(DIR, 'key.pem'))) {
    generateCerts();
}

// MIME 类型
const mimeTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.glb': 'model/gltf-binary',
    '.gltf': 'model/gltf+json',
    '.wasm': 'application/wasm',
};

// 简单 HTTP 服务器（自动跳转 HTTPS 或直接 HTTP）
const httpServer = http.createServer((req, res) => {
    let filePath = path.join(DIR, req.url === '/' ? '/index36.html' : req.url);
    
    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    
    fs.readFile(filePath, (err, content) => {
        if (err) {
            res.writeHead(404);
            res.end('Not Found');
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content);
        }
    });
});

console.log(`HTTP 服务器运行在 http://localhost:3000`);
console.log(`按 Ctrl+C 停止`);

httpServer.listen(3000);
