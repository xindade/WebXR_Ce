// ===== 全局日志系统（ES Module 加载前执行） =====

(function() {
    var el = document.getElementById('js-status');
    if (el) el.textContent = '✓ JS 已执行';
})();

window.__logBuffer = [];
window.__logPaused = false;
window.__vrActive = false;
window.__MAX_LOG_LINES = 200;  // DOM 节点上限，超出移除最旧

window.__logFreeze = function() { 
    try {
        var panel = document.getElementById('log-panel');
        if (panel) {
            var warn = document.createElement('div');
            warn.style.cssText = 'color:#ff4444;font-weight:bold';
            warn.textContent = '========== 日志已冻结 ==========';
            panel.appendChild(warn);
        }
    } catch(e) {}
    window.__logPaused = true;
};

window.__logResume = function() { 
    window.__logPaused = false; 
    window.__log('日志已恢复', 's'); 
};

window.__log = function(msg, level) {
    level = level || 'i';
    var entry = { msg: msg, level: level, time: Date.now() };
    window.__logBuffer.push(entry);
    // 限制 buffer 大小
    if (window.__logBuffer.length > 500) window.__logBuffer.shift();
    
    // 使用 DOM API 而非 innerHTML +=
    try {
        var panel = document.getElementById('log-panel');
        if (panel && !window.__logPaused) {
            var ts = new Date(entry.time).toTimeString().slice(0, 8);
            
            var line = document.createElement('div');
            line.className = 'log-line';
            
            var timeSpan = document.createElement('span');
            timeSpan.className = 'log-time';
            timeSpan.textContent = '[' + ts + '] ';
            
            var msgSpan = document.createElement('span');
            msgSpan.className = 'log-' + level;
            msgSpan.textContent = msg;
            
            line.appendChild(timeSpan);
            line.appendChild(msgSpan);
            
            panel.appendChild(line);
            // 仅在 VR 中自动滚到底部
            if (window.__vrActive) {
                panel.scrollTop = panel.scrollHeight;
            }
            
            // 移除超出的旧节点
            while (panel.childNodes.length > window.__MAX_LOG_LINES) {
                panel.removeChild(panel.firstChild);
            }
        } else if (!panel) {
            document.title = 'LOG:' + msg.slice(0, 40);
        }
    } catch(e) {}
    
    console.log('[' + (level === 'e' ? 'ERR' : level === 'w' ? 'WRN' : 'INF') + ']', msg);
};

window.__log('logger.js 已加载', 's');

// 模块加载超时检测：3 秒后检查模块是否加载
setTimeout(function() {
    var el = document.getElementById('js-status');
    if (el && el.textContent === '✓ JS 已执行') {
        if (window.__logBuffer.length < 5) {
            window.__log('⚠️ 3秒了，ES Module 可能加载失败', 'w');
            window.__log('  请检查服务器是否正确提供 .js 文件', 'w');
        }
    }
}, 3000);

// 捕获全局 JS 错误
window.addEventListener('error', function(e) {
    var msg = e.message || (e.error && e.error.message) || String(e);
    var src = e.filename || (e.error && e.error.stack ? '(看堆栈)' : '');
    var line = e.lineno ? ':' + e.lineno : '';
    var col = e.colno ? ':' + e.colno : '';
    var location = src + line + col;
    window.__log('全局错误: ' + msg + (location ? ' | ' + location : ''), 'e');
    if (e.error && e.error.stack) {
        var stackLines = e.error.stack.split('\n').slice(0, 4).join(' | ');
        window.__log('  stack: ' + stackLines, 'e');
    }
});

window.addEventListener('unhandledrejection', function(e) {
    window.__log('未处理 Promise: ' + String(e.reason || e), 'e');
    if (e.reason && e.reason.stack) {
        var stackLines = e.reason.stack.split('\n').slice(0, 4).join(' | ');
        window.__log('  stack: ' + stackLines, 'e');
    }
});