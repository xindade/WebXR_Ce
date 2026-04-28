const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3443;
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
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
};

const server = http.createServer((req, res) => {
    let filePath = '.' + req.url;
    if (filePath === './') filePath = './index36.html';
    
    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    
    fs.readFile(filePath, (err, content) => {
        if (err) {
            res.writeHead(404);
            res.end('Not Found');
            console.log(`${req.url} - 404`);
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content);
            console.log(`${req.url} - 200`);
        }
    });
});

server.listen(PORT, () => {
    console.log(`HTTP 服务器运行在 http://localhost:${PORT}`);
});
