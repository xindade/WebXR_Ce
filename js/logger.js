// ===== 独立日志系统（在 ES Module 加载前执行） =====

// 第一步：更新 JS 状态指示器（最可靠的反馈）
(function() {
    var el = document.getElementById('js-status');
    if (el) el.textContent = '✅ JS 已执行';
})();

window.__logBuffer = [];
window.__log = function(msg, level) {
    level = level || 'i';
    var entry = { msg: msg, level: level, time: Date.now() };
    window.__logBuffer.push(entry);
    // 如果日志已暂停，只缓冲不更新 DOM
    if (window.__logPaused) return;
    try {
        var panel = document.getElementById('log-panel');
        if (panel) {
            var ts = new Date(entry.time).toTimeString().slice(0, 8);
            panel.innerHTML += '<span class="log-time">[' + ts + ']</span> <span class="log-' + level + '">' + msg + '</span>\n';
            // 仅在 VR 中自动滚到底部（预览模式让用户自己滚动）
            if (window.__vrActive) {
                panel.scrollTop = panel.scrollHeight;
            }
        } else {
            document.title = 'LOG:' + msg.slice(0, 40);
        }
    } catch(e) {}
    console.log('[' + (level === 'e' ? 'ERR' : level === 'w' ? 'WRN' : 'INF') + ']', msg);
};

window.__log('logger.js 已加载', 's');

// 模块加载超时检测：3 秒后检查模块是否就绪
setTimeout(function() {
    var el = document.getElementById('js-status');
    if (el && el.textContent === '✅ JS 已执行') {
        if (window.__logBuffer.length < 5) {
            window.__log('⚠️ 3秒了，ES Module 可能加载失败', 'w');
            window.__log('  请检查服务器是否正确提供 .js 文件', 'w');
        }
    }
}, 3000);

// 捕获全局 JS 错误
window.addEventListener('error', function(e) {
    var msg = e.message || (e.error && e.error.message) || String(e);
    var src = e.filename || (e.error && e.error.stack ? '(有堆栈)' : '');
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
    window.__log('未捕获 Promise: ' + String(e.reason || e), 'e');
    if (e.reason && e.reason.stack) {
        var stackLines = e.reason.stack.split('\n').slice(0, 4).join(' | ');
        window.__log('  stack: ' + stackLines, 'e');
    }
});
