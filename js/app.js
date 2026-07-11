// app.js — Main application: animate loop, VR session, initialization
import * as THREE from '../three.module.js';
import { renderer, scene, camera, choiceCardGroup, setShadow, updateSkyTransition, applySkyTarget, STATE, createShootingGrid, destroyShootingGrid } from './core.js';
import { GameAPI as game } from './game.js';
import { VrAPI as vr } from './vr.js';
import { LaserAPI as laser } from './laser-level.js';
import { startIntro6, updateIntro6, cleanUpIntro6, isIntro6Fighting } from './intro6.js';

// Inject audio/VR modules into game (avoid circular dependency)
game.setAudio(vr);
game.setVR(vr);
window.__log('app.js 模块导入完成 / GameAPI+VrAPI 就绪', 's');

// ===== DOM Elements =====
const enterVRBtn = document.getElementById('enter-vr-btn');
const enterVRLeftHandBtn = document.getElementById('enter-vr-left-hand');
const statusMsgEl = document.getElementById('status-msg');
const vrHintsEl = document.getElementById('vr-hints');
const vrEntryEl = document.getElementById('vr-entry');

document.body.appendChild(renderer.domElement);

// ===== Time Switch =====
const timeBtns = {
    day: document.getElementById('btn-day'),
    dusk: document.getElementById('btn-dusk'),
    night: document.getElementById('btn-night')
};
function setActiveTimeBtn(name) {
    Object.keys(timeBtns).forEach(k => timeBtns[k].classList.remove('active'));
    if (timeBtns[name]) timeBtns[name].classList.add('active');
}
timeBtns.day.addEventListener('click', () => { applySkyTarget('day'); setActiveTimeBtn('day'); });
timeBtns.dusk.addEventListener('click', () => { applySkyTarget('dusk'); setActiveTimeBtn('dusk'); });
timeBtns.night.addEventListener('click', () => { applySkyTarget('night'); setActiveTimeBtn('night'); });

// ===== VR Session =====
async function enterVR(isLeftHandMode = false) {
    if (enterVRBtn.disabled) return;
    enterVRBtn.disabled = true;
    enterVRLeftHandBtn.disabled = true;
    enterVRBtn.textContent = '⏳ 启动中...';
    enterVRLeftHandBtn.textContent = '⏳ 启动中...';
    try {
        if (!navigator.xr) throw new Error('浏览器不支持 WebXR');
        let session;
        try {
            if (navigator.xr.isSessionSupported) {
                const supported = await navigator.xr.isSessionSupported('immersive-vr');
                if (!supported) throw new Error('设备不支持VR');
            }
            session = await navigator.xr.requestSession('immersive-vr', { requiredFeatures: ['local-floor'] });
        } catch (e) {
            console.log('使用 PICO 兼容模式:', e.message);
            session = await navigator.xr.requestSession('immersive-vr');
        }
        STATE.leftHandGunEnabled = isLeftHandMode;
        window.__log('左手持枪模式: ' + (isLeftHandMode ? '启用' : '未启用'), 'i');
        renderer.xr.enabled = true;
        renderer.xr.setSession(session);
        window.__log('WebXR 会话已启动', 's');
        enterVRBtn.disabled = false;
        enterVRLeftHandBtn.disabled = false;
        enterVRBtn.textContent = '🎈 正常开始游戏';
        enterVRLeftHandBtn.textContent = '🔫 左手持枪模式';
    } catch (err) {
        window.__log('VR 会话请求失败: ' + err.message, 'e');
        statusMsgEl.innerHTML = '❌ ' + err.message;
        statusMsgEl.classList.add('error');
        enterVRBtn.disabled = false;
        enterVRLeftHandBtn.disabled = false;
        enterVRBtn.textContent = '🎈 正常开始游戏';
        enterVRLeftHandBtn.textContent = '🔫 左手持枪模式';
    }
}

enterVRBtn.onclick = () => enterVR(false);
enterVRLeftHandBtn.onclick = () => enterVR(true);

// ===== Level Selection =====
let selectedLevel = 0;
document.querySelectorAll('.level-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        selectedLevel = parseInt(btn.dataset.level);
        STATE.playerStats.gold = 1000;
        STATE.playerStats.atk = 100;
        window.__log('已选关卡 ' + selectedLevel + '（gold:1000 atk:100）', 's');
        document.querySelectorAll('.level-btn').forEach(b => b.style.boxShadow = 'none');
        btn.style.boxShadow = '0 0 16px rgba(255,215,0,0.7)';
    });
});

// ===== Animate Loop =====
const clock = new THREE.Clock();
function animate() {
    const dt = Math.min(clock.getDelta(), 0.1);
    if (!animate._frameCount) animate._frameCount = 0;
    animate._frameCount++;
    if (animate._frameCount % 60 === 1) {
        const xrState = renderer.xr.isPresenting ? 'VR中' : '非VR';
        window.__log('❤️ 帧#' + animate._frameCount + ' / XR:' + xrState + ' / dt:' + dt.toFixed(4) + ' / grip L:' + STATE.leftBtnState.grip + ' R:' + STATE.rightBtnState.grip, 'i');
    }
    try {
        updateSkyTransition(dt);
        game.updateCooldowns(dt);
        if (STATE.gameMode === 'laser' && !laser._initialized) {
            laser._initialized = true;
            laser.startLaserLevel();
        }

        if (renderer.xr.isPresenting) {
            if (STATE.gameMode === 'laser') {
                if (!STATE.gameOverState) {
                    vr.updateInputs();
                    vr.handleMovement(dt);
                    laser.updateLaserLevel(dt);
                    vr.handleExit();
                }
            } else if (STATE.gameMode === 'intro6') {
                vr.updateInputs();
                vr.handleMovement(dt);
                if (isIntro6Fighting()) {
                    vr.handleShooting();
                    game.updateBullets(dt);
                    game.updateBalloons(dt);
                    game.checkBulletBalloonCollisions();
                    game.updateChoiceBalloons(dt);
                }
                updateIntro6(dt);
                vr.handleExit();
            } else if (!STATE.gameOverState) {
                vr.updateInputs();
                vr.handleMovement(dt);
                vr.handleShooting();
                game.updateBullets(dt);
                game.updateBalloons(dt);
                game.updateWaveSpawning(dt);
                game.checkBulletBalloonCollisions();
                game.updateChoiceBalloons(dt);
                game.updateBuddhaPalm(dt);
                vr.handleExit();
                game.checkVRSkySwitch();
            }
            vr.updateGunRecoil();
            game.updateTransitionClouds(dt);
            game.updateDebris(dt);
            game.updateParticles(dt);
            if (animate._frameCount % 5 === 0) {
                vr.updateDebugPanel();
                vr.updateLeftDebugPanel();
            }
            vrEntryEl.style.display = 'none';
            vrHintsEl.style.display = 'none';
        } else {
            vrEntryEl.style.display = 'block';
            vrHintsEl.style.display = 'flex';
        }
    } catch (e) {
        console.error('Animate error:', e);
        window.__log('Animate 错误: ' + e.message, 'e');
        statusMsgEl.innerHTML = '❌ ' + e.message;
        statusMsgEl.classList.add('error');
        statusMsgEl.style.display = 'block';
    }
    try {
        renderer.render(scene, camera);
    } catch (e) {
        window.__log('Render 调用失败: ' + e.message, 'e');
        console.error('Render error:', e);
    }
}
renderer.setAnimationLoop(animate);

// ===== Init =====
function initScene() {
    try {
        vr.setupController(0);
        vr.setupController(1);
        game.initTransitionClouds();
        window.__log('☁️ 转场云朵初始化', 's');
    } catch (e) {
        console.error('Init error:', e);
        statusMsgEl.innerHTML = '❌ 初始化错误: ' + e.message;
        statusMsgEl.classList.add('error');
    }
}

// ===== Session Events =====
renderer.xr.addEventListener('sessionstart', () => {
    window.__log('sessionstart 事件触发', 's');
    setShadow(false);
    setTimeout(() => vr.attachAK48(), 100);
    if (STATE.leftHandGunEnabled) {
        setTimeout(() => vr.attachAK48ToLeft(), 100);
    }
    setTimeout(() => {
        if (!STATE.gameStarted) {
            STATE.gameStarted = true;
            STATE.gameOverState = false;
            STATE.shipHp = 100;
            STATE.shipHitFlash = 0;
            if (selectedLevel > 0) {
                STATE.playerStats.gold = 1000;
                STATE.playerStats.atk = 100;
                if (selectedLevel === 3) {
                    STATE.waveNumber = 2;
                    STATE.gameMode = 'laser';
                    window.__log('🎆 第三关：激光关卡启动 wave=2', 's');
                } else if (selectedLevel === 6) {
                    STATE.waveNumber = 5;
                    STATE.gameMode = 'shooting';
                    STATE.buddhaPalmUnlocked = true;
                    window.__log('👑 第六关：Boss关 wave=5', 's');
                } else {
                    STATE.waveNumber = selectedLevel - 1;
                    STATE.buddhaPalmUnlocked = true;
                    window.__log('关卡' + selectedLevel + ' 生效: gold=' + STATE.playerStats.gold + ' atk=' + STATE.playerStats.atk + ' wave=' + STATE.waveNumber, 's');
                }
            }
            if (STATE.gameMode === 'laser') {
                laser.startLaserLevel();
                laser._initialized = true;
            } else if (STATE.gameMode === 'intro6') {
                startIntro6();
            } else {
                createShootingGrid();
                if (STATE.waveNumber === 5 || STATE.waveNumber === 11) {
                    game.createKnightBalloon(-1.5, 2, -4);
                    game.createKnightBalloon(1.5, 2, -4);
                    window.__log('👑 Boss关：2个骑士气球', 's');
                } else {
                    game.spawnBalloons();
                }
                window.__log('游戏开始 / 气球生成', 's');
            }
        }
    }, 500);
});

renderer.xr.addEventListener('sessionend', () => {
    window.__log('sessionend 事件触发', 'w');
    setShadow(true);
    enterVRBtn.disabled = false;
    enterVRLeftHandBtn.disabled = false;
    vrEntryEl.style.display = 'block';
    vrHintsEl.style.display = 'flex';
    statusMsgEl.style.display = 'none';
    STATE.gameStarted = false;
    STATE.waveNumber = 0;
    STATE.gameOverState = false;
    STATE.shipHp = 100;
    STATE.shipHitFlash = 0;
    STATE.gameMode = 'shooting';
    destroyShootingGrid();
    laser.cleanupLaserLevel();
    laser._initialized = false;
    STATE.leftHandGunEnabled = false;
    STATE.ak48Attached = false;
    STATE.ak48LeftAttached = false;
    STATE.ak48Mesh = null;
    STATE.gunRecoilPos = 0;
    STATE.gunRecoilRot = 0;
    STATE.choiceCardsActive = false;
    STATE.choiceRefreshCount = 0;
    game.resetBuddhaPalm();
    STATE.buddhaPalmReady = false;
    STATE.buddhaPalmUnlocked = false;
    STATE.transitionCloudActive = false;
    STATE.transitionCloudPhase = 0;
    STATE.nextWaveTimer = 0;
    game.initTransitionClouds();
    selectedLevel = 0;
    if (STATE.choiceCardTimeout) { clearTimeout(STATE.choiceCardTimeout); STATE.choiceCardTimeout = null; }
    while (choiceCardGroup.children.length > 0) {
        const child = choiceCardGroup.children[0];
        if (child.material && child.material.map) child.material.map.dispose();
        if (child.material) child.material.dispose();
        if (child.geometry) child.geometry.dispose();
        choiceCardGroup.remove(child);
    }
});

window.addEventListener('beforeunload', () => {
    renderer.dispose();
    scene.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
            if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
            else obj.material.dispose();
        }
    });
});

initScene();
window.__log('initScene() 完成', 's');