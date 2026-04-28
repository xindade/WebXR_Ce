#!/usr/bin/env python3
"""简单的 HTTPS 服务器，自动处理 MIME 类型"""

import http.server
import ssl
import os
import sys

PORT = 3443
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.mjs': 'application/javascript',
        '.json': 'application/json',
        '.glb': 'model/gltf-binary',
        '.gltf': 'model/gltf+json',
        '.wasm': 'application/wasm',
    }
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

os.chdir(DIRECTORY)

server_address = ('', PORT)
httpd = http.server.HTTPServer(server_address, MyHTTPRequestHandler)

# 生成自签名证书（如果不存在）
cert_file = os.path.join(DIRECTORY, 'cert.pem')
key_file = os.path.join(DIRECTORY, 'key.pem')

if not (os.path.exists(cert_file) and os.path.exists(key_file)):
    print("生成自签名证书...")
    os.system(f'openssl req -x509 -newkey rsa:2048 -keyout "{key_file}" -out "{cert_file}" -days 365 -nodes -subj "/CN=localhost"')

context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
context.load_cert_chain(cert_file, key_file)
httpd.socket = context.wrap_socket(httpd.socket, server_side=True)

print(f"🔒 HTTPS 服务器运行在 https://localhost:{PORT}")
print(f"🔒 网络访问: https://<电脑IP>:{PORT}")
print("在 PICO 浏览器中访问并接受风险提示")
print("按 Ctrl+C 停止服务器")

try:
    httpd.serve_forever()
except KeyboardInterrupt:
    print("\n服务器已停止")
    sys.exit(0)
