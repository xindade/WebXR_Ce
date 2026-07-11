import * as THREE from '../three.module.js';
import {
    renderer, scene, dolly, camera, STATE,
    SHOOT_COOLDOWN, MOVE_SPEED, DEADZONE, BOUND_X, BOUND_Z,
    AK48_SCALE, SHIP_SCALE, SHIP_POS, SHIP_ROT,
    SPAWN_MAX_ACTIVE, SHIP_MAX_HP,
    BUDDHA_COOLDOWN,
    RAY_SPHERE_RADIUS, RAY_SPHERE_POS, RAY_SPHERE_COLOR, RAY_PITCH_ANGLE,
    RECOIL_POS_AMPLITUDE, RECOIL_ROT_AMPLITUDE, RECOIL_DECAY,
    roundRect
} from './core.js';
import { gltfLoader } from './loader.js';
import { shootBullet, attachBuddhaPalmToLeft } from './game.js';

if (window.__log) window.__log('vr.js 模块加载完成', 's');

// ===================== 音效系统 =====================
let audioCtx = null;
let bgmBuffer = null;
let bgmSource = null;
let bgMusicGain = null;

async function renderJungleDrums() {
    const SAMPLE_RATE = 44100;
    const LOOP_DURATION = 4;
    const offline = new OfflineAudioContext(2, SAMPLE_RATE * LOOP_DURATION, SAMPLE_RATE);

    function scheduleNoise(ctx, time, duration, gain, filterType, freq) {
        const sr = ctx.sampleRate;
        const len = Math.floor(sr * (duration + 0.02));
        const buf = ctx.createBuffer(1, len, sr);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const filter = ctx.createBiquadFilter();
        filter.type = filterType;
        filter.frequency.setValueAtTime(freq, time);
        const gainNode = ctx.createGain();
        gainNode.gain.setValueAtTime(gain, time);
        gainNode.gain.exponentialRampToValueAtTime(0.001, time + duration);
        src.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(ctx.destination);
        src.start(time);
        src.stop(time + duration + 0.02);
    }

    function scheduleNote(ctx, time, freq, duration, type, gain) {
        const osc = ctx.createOscillator();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, time);
        const gainNode = ctx.createGain();
        gainNode.gain.setValueAtTime(0, time);
        gainNode.gain.linearRampToValueAtTime(gain, time + 0.008);
        gainNode.gain.exponentialRampToValueAtTime(0.001, time + duration);
        osc.connect(gainNode);
        gainNode.connect(ctx.destination);
        osc.start(time);
        osc.stop(time + duration + 0.05);
    }

    for (let i = 0; i < 16; i++) {
        scheduleNoise(offline, i * 0.25, 0.06, 0.6, 'lowpass', 800);
    }
    const melody = [523, 587, 659, 698, 784, 880, 988, 1047];
    melody.forEach((f, i) => scheduleNote(offline, i * 0.5, f, 0.1, 'sine', 0.4));
    return offline.startRendering();
}

export function initAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (!bgmBuffer) {
        renderJungleDrums().then(buf => { bgmBuffer = buf; startBackgroundMusic(); });
    } else {
        startBackgroundMusic();
    }
}

export function playShootSound() {
    if (!audioCtx) return;
    const bufferSize = audioCtx.sampleRate * 0.1;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.1));
    }
    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.4, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3000, audioCtx.currentTime);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);
    noise.start();
    noise.stop(audioCtx.currentTime + 0.1);
}

export function playBalloonPopSound() {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.exponentialRampToValueAtTime(800, now + 0.3);
    gain.gain.setValueAtTime(0.6, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.3);
}

export function startBackgroundMusic() {
    if (!audioCtx || !bgmBuffer || bgmSource) return;
    bgMusicGain = audioCtx.createGain();
    bgMusicGain.gain.setValueAtTime(0.12, audioCtx.currentTime);
    bgMusicGain.connect(audioCtx.destination);
    bgmSource = audioCtx.createBufferSource();
    bgmSource.buffer = bgmBuffer;
    bgmSource.loop = true;
    bgmSource.connect(bgMusicGain);
    bgmSource.start(0);
}

export function stopBackgroundMusic() {
    if (bgmSource) {
        try { bgmSource.stop(); } catch (e) {}
        bgmSource.disconnect();
        bgmSource = null;
    }
    if (bgMusicGain) {
        bgMusicGain.gain.setValueAtTime(0, audioCtx.currentTime);
        bgMusicGain = null;
    }
}


// AK48
gltfLoader.load('Model/Ak48.glb', (gltf) => {
    STATE.ak48Model = gltf.scene;
    STATE.ak48Model.scale.set(1, 1, 1);
    STATE.ak48Model.traverse(child => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; } });
    attachAK48();
    STATE.loadingResources.model = true;
    if (window.__log) window.__log('Ak48.glb 加载成功', 's');
    import('./core.js').then(m => m.checkAllLoaded());
}, (progress) => {
    if (progress.total > 0) {
        const pct = (progress.loaded / progress.total * 100).toFixed(1);
        document.getElementById('loading').innerHTML = '<div id="loading-spinner"></div><div>加载模型: ' + pct + '%</div>';
    }
}, (error) => {
    console.error('❌ 模型加载失败:', error);
    STATE.loadingResources.model = true;
    if (window.__log) window.__log('Ak48.glb 加载失败: ' + (error.message || error), 'e');
    import('./core.js').then(m => m.onResourceError('⚠️ 模型加载失败'));
});

// 鲲鹏（替换原气球船）
gltfLoader.load('Model/鲲鹏.glb', (gltf) => {
    STATE.shipModel = gltf.scene;
    STATE.shipModel.scale.setScalar(SHIP_SCALE);
    STATE.shipModel.position.set(...SHIP_POS);
    STATE.shipModel.rotation.set(...SHIP_ROT);
    STATE.shipModel.traverse(child => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; } });
    scene.add(STATE.shipModel);
    window.__log('🦅 鲲鹏模型加载成功', 's');
}, (progress) => {
    if (progress.total > 0) console.log('鲲鹏 加载: ' + (progress.loaded / progress.total * 100).toFixed(1) + '%');
}, (error) => {
    console.warn('⚠️ 鲲鹏.glb 未找到:', error ? error.message : '');
});

// 骑士
gltfLoader.load('Model/骑士.glb', (gltf) => {
    STATE.knightModel = gltf.scene;
    console.log('✅ 骑士模型加载成功');
}, undefined, () => console.warn('⚠️ 骑士模型未找到'));

// 如来神掌
gltfLoader.load('Model/如来神掌.glb', (gltf) => {
    STATE.buddhaPalmModel = gltf.scene;
    console.log('✅ 如来神掌模型加载成功');
    if (STATE.buddhaPalmUnlocked) {
        attachBuddhaPalmToLeft();
    }
}, undefined, () => console.warn('⚠️ 如来神掌.glb 未找到'));

// ===================== 枪支挂载 =====================
export function attachAK48() {
    if (!STATE.ak48Model || !STATE.rightGrip || STATE.ak48Attached) return;
    const gunInstance = STATE.ak48Model.clone();
    const box = new THREE.Box3().setFromObject(gunInstance);
    const size = new THREE.Vector3();
    box.getSize(size);
    gunInstance.scale.set(AK48_SCALE, AK48_SCALE, AK48_SCALE);
    gunInstance.traverse(child => { if (child.isMesh) child.castShadow = true; });
    gunInstance.position.set(0, -0.1, 0.01);
    gunInstance.rotation.x = -20;
    gunInstance.rotation.y = Math.PI / 2;
    STATE.rightGrip.add(gunInstance);
    STATE.ak48Attached = true;
    STATE.ak48Mesh = gunInstance;
    STATE.ak48BasePos = new THREE.Vector3(0, -0.1, 0.01);
    STATE.ak48BaseRot = new THREE.Vector3(-20, Math.PI / 2, 0);
}

export function attachAK48ToLeft() {
    if (!STATE.ak48Model || !STATE.leftGrip || STATE.ak48LeftAttached) return;
    const gunInstance = STATE.ak48Model.clone();
    gunInstance.scale.set(AK48_SCALE, AK48_SCALE, AK48_SCALE);
    gunInstance.traverse(child => { if (child.isMesh) child.castShadow = true; });
    gunInstance.position.set(0, -0.1, 0.01);
    gunInstance.rotation.x = -20;
    gunInstance.rotation.y = -90 * Math.PI / 180;
    gunInstance.scale.x = -AK48_SCALE;
    STATE.leftGrip.add(gunInstance);
    STATE.ak48LeftAttached = true;
}

// ===================== 手柄设置 =====================
export const controllers = [];

function createControllerModel(isRight) {
    return new THREE.Group();
}

export function setupController(idx) {
    const controller = renderer.xr.getController(idx);
    const grip = renderer.xr.getControllerGrip(idx);
    const model = createControllerModel(idx === 1);
    grip.add(model);
    dolly.add(controller);
    dolly.add(grip);
    controllers.push(controller);

    if (idx === 1) {
        STATE.rightGrip = grip;
        attachAK48();
        const panel = createDebugPanel();
        grip.add(panel);
    } else {
        STATE.leftGrip = grip;
        const leftPanel = createLeftDebugPanel();
        grip.add(leftPanel);
        // 左手射线指示球
        const raySphere = new THREE.Mesh(
            new THREE.SphereGeometry(RAY_SPHERE_RADIUS, 16, 16),
            new THREE.MeshStandardMaterial({ color: RAY_SPHERE_COLOR, emissive: RAY_SPHERE_COLOR, emissiveIntensity: 0.5, transparent: true, opacity: 0.8 })
        );
        raySphere.position.set(RAY_SPHERE_POS[0], RAY_SPHERE_POS[1], RAY_SPHERE_POS[2]);
        raySphere.name = 'leftRaySphere';
        grip.add(raySphere);
        STATE.leftRaySphere = raySphere;
        // 可见射线线条（从球体沿射线方向延伸3米）
        const rayDir = new THREE.Vector3(
            0,
            Math.sin(-RAY_PITCH_ANGLE * Math.PI / 180),  // pitch -30° → sin(30°) = 0.5 向上
            -Math.cos(-RAY_PITCH_ANGLE * Math.PI / 180)  // cos(30°) ≈ 0.866
        );
        const rayLen = 3;
        const lineStart = new THREE.Vector3(RAY_SPHERE_POS[0], RAY_SPHERE_POS[1], RAY_SPHERE_POS[2]);
        const lineEnd = lineStart.clone().addScaledVector(rayDir, rayLen);
        const lineGeom = new THREE.BufferGeometry().setFromPoints([lineStart, lineEnd]);
        const lineMat = new THREE.LineBasicMaterial({
            color: 0x00ffff, transparent: true, opacity: 0.35, linewidth: 1
        });
        const rayLine = new THREE.Line(lineGeom, lineMat);
        rayLine.name = 'leftRayLine';
        grip.add(rayLine);
        window.__log('🔵 左手射线球+可见射线已添加', 's');
    }
    if (idx === 0) STATE.leftController = controller;
    else STATE.rightController = controller;
}

// ===================== 输入处理 =====================
export function updateInputs() {
    const session = renderer.xr.getSession();
    if (!session) return;
    STATE.rightInput.stickX = 0; STATE.rightInput.stickY = 0;
    STATE.leftInput.stickX = 0; STATE.leftInput.stickY = 0;
    STATE.rightTrigger = false;
    STATE.leftTrigger = false;
    Object.keys(STATE.leftBtnState).forEach(k => STATE.leftBtnState[k] = false);
    Object.keys(STATE.rightBtnState).forEach(k => STATE.rightBtnState[k] = false);

    if (!session.inputSources) return;
    for (const source of session.inputSources) {
        if (!source.gamepad) continue;
        const gp = source.gamepad;
        const hand = source.handedness;
        let sx = 0, sy = 0;
        if (gp.axes.length >= 4) { sx = gp.axes[2]; sy = gp.axes[3]; }
        else if (gp.axes.length >= 2) { sx = gp.axes[0]; sy = gp.axes[1]; }

        const triggerVal = gp.buttons[0]?.value || 0;
        const trigger = triggerVal > 0.5;
        const grip = gp.buttons[1]?.pressed || false;
        const stickBtn = gp.buttons[3]?.pressed || false;

        if (hand === 'right') {
            STATE.rightInput.stickX = sx; STATE.rightInput.stickY = sy;
            STATE.rightTrigger = trigger;
            STATE.rightBtnState.trigger = trigger;
            STATE.rightBtnState.grip = grip;
            STATE.rightBtnState.stickBtn = stickBtn;
            STATE.rightBtnState.btnA = gp.buttons[4]?.pressed || false;
            STATE.rightBtnState.btnB = gp.buttons[5]?.pressed || false;
        } else if (hand === 'left') {
            STATE.leftInput.stickX = sx; STATE.leftInput.stickY = sy;
            STATE.leftTrigger = trigger;
            STATE.leftBtnState.trigger = trigger;
            STATE.leftBtnState.grip = grip;
            STATE.leftBtnState.stickBtn = stickBtn;
            STATE.leftBtnState.btnX = gp.buttons[4]?.pressed || false;
            STATE.leftBtnState.btnY = gp.buttons[5]?.pressed || false;
        }
    }
}

export function handleShooting() {
    const now = performance.now();
    const cooldown = SHOOT_COOLDOWN / Math.max(0.1, STATE.fireRate);
    if (STATE.rightController && STATE.rightTrigger) {
        if (now - STATE.lastRightShootTime > cooldown) {
            initAudio();
            playShootSound();
            shootBullet(STATE.rightController);
            STATE.lastRightShootTime = now;
            // 后坐力：低射速明显，高射速轻微
            const intensity = Math.min(1.0, 1.0 / Math.max(0.3, STATE.fireRate));
            STATE.gunRecoilPos += RECOIL_POS_AMPLITUDE * intensity;
            STATE.gunRecoilRot += RECOIL_ROT_AMPLITUDE * intensity;
        }
    }
    if (STATE.leftHandGunEnabled && STATE.leftController && STATE.leftTrigger) {
        if (now - STATE.lastLeftShootTime > cooldown) {
            initAudio();
            playShootSound();
            shootBullet(STATE.leftController);
            STATE.lastLeftShootTime = now;
        }
    }
}

// 每帧更新后坐力回弹
export function updateGunRecoil() {
    if (!STATE.ak48Mesh || !STATE.ak48BasePos) return;
    // 衰减回弹
    STATE.gunRecoilPos *= RECOIL_DECAY;
    STATE.gunRecoilRot *= RECOIL_DECAY;
    if (Math.abs(STATE.gunRecoilPos) < 0.0001) STATE.gunRecoilPos = 0;
    if (Math.abs(STATE.gunRecoilRot) < 0.0001) STATE.gunRecoilRot = 0;
    // 位置保持基准不变（纯旋转后坐力，避免平移的方向歧义）
    STATE.ak48Mesh.position.copy(STATE.ak48BasePos);
    // 旋转后坐力：枪口上跳（减少rotation.x负值，使枪管抬升）
    STATE.ak48Mesh.rotation.x = STATE.ak48BaseRot.x + STATE.gunRecoilRot;
    STATE.ak48Mesh.rotation.y = STATE.ak48BaseRot.y;
    STATE.ak48Mesh.rotation.z = 0;
}

export function handleMovement(dt) {
    let sx = STATE.rightInput.stickX, sy = STATE.rightInput.stickY;
    if (Math.abs(sx) < DEADZONE && Math.abs(sy) < DEADZONE) {
        sx = STATE.leftInput.stickX; sy = STATE.leftInput.stickY;
    }
    if (Math.abs(sx) < DEADZONE && Math.abs(sy) < DEADZONE) return;

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    forward.y = 0; forward.normalize();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    right.y = 0; right.normalize();

    const speed = MOVE_SPEED * dt;
    sy = -sy;
    const dx = (forward.x * sy + right.x * sx) * speed;
    const dz = (forward.z * sy + right.z * sx) * speed;
    dolly.position.x = Math.max(-BOUND_X, Math.min(BOUND_X, dolly.position.x + dx));
    const dzNew = dolly.position.z + dz;
    dolly.position.z = Math.max(-BOUND_Z, Math.min(BOUND_Z, dzNew));
}

export function handleExit() {
    const session = renderer.xr.getSession();
    if (!session || !session.inputSources) return;
    for (const src of session.inputSources) {
        if (!src.gamepad) continue;
        if (src.handedness === 'right') {
            const btnA = src.gamepad.buttons[4]?.pressed;
            const btnB = src.gamepad.buttons[5]?.pressed;
            if (btnA || btnB) { session.end(); break; }
        }
    }
}

// ===================== UI 面板 =====================
let debugPanel = null, debugCanvas = null, debugCtx = null, debugTexture = null;

function createDebugPanel() {
    debugCanvas = document.createElement('canvas');
    debugCanvas.width = 512; debugCanvas.height = 256;
    debugCtx = debugCanvas.getContext('2d');
    debugTexture = new THREE.CanvasTexture(debugCanvas);
    const panelGeo = new THREE.PlaneGeometry(0.18, 0.09);
    const panelMat = new THREE.MeshBasicMaterial({
        map: debugTexture, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide
    });
    debugPanel = new THREE.Mesh(panelGeo, panelMat);
    debugPanel.position.set(0, 0.06, 0.04);
    debugPanel.rotation.x = -Math.PI * 0.35;
    drawDebugPanel('初始化中...');
    return debugPanel;
}

function drawDebugPanel(info) {
    if (!debugCtx) return;
    const c = debugCtx, w = debugCanvas.width, h = debugCanvas.height;
    c.clearRect(0, 0, w, h);
    c.fillStyle = 'rgba(0,0,0,0.82)';
    roundRect(c, 0, 0, w, h, 24); c.fill();
    c.strokeStyle = '#00ffcc'; c.lineWidth = 4;
    roundRect(c, 2, 2, w - 4, h - 4, 22); c.stroke();
    c.fillStyle = '#00ffcc';
    c.font = 'bold 28px monospace';
    c.fillText('⚔️ 战斗属性', 18, 42);
    c.fillStyle = '#ffffff';
    c.font = '22px monospace';
    info.split('\n').forEach((line, i) => c.fillText(line, 18, 80 + i * 30));
    if (debugTexture) debugTexture.needsUpdate = true;
}

export function updateDebugPanel() {
    if (!debugPanel) return;
    const multiPct = STATE.multiShotChance + '%';
    const radiusStr = STATE.explosionRadius > 0 ? STATE.explosionRadius + 'm' : '0';
    const info = [
        `⚔️ 攻击  ${STATE.playerStats.atk}`,
        `🎯 射速  ${STATE.fireRate.toFixed(1)}x`,
        `🔫 多重  ${multiPct}`,
        `💥 范围  ${radiusStr}`,
        `🏆 得分  ${STATE.playerStats.score}`
    ].join('\n');
    drawDebugPanel(info);
}

let leftDebugPanel = null, leftDebugCanvas = null, leftDebugCtx = null, leftDebugTexture = null;

function createLeftDebugPanel() {
    leftDebugCanvas = document.createElement('canvas');
    leftDebugCanvas.width = 512; leftDebugCanvas.height = 256;
    leftDebugCtx = leftDebugCanvas.getContext('2d');
    leftDebugTexture = new THREE.CanvasTexture(leftDebugCanvas);
    const panelGeo = new THREE.PlaneGeometry(0.18, 0.09);
    const panelMat = new THREE.MeshBasicMaterial({
        map: leftDebugTexture, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide
    });
    leftDebugPanel = new THREE.Mesh(panelGeo, panelMat);
    leftDebugPanel.position.set(0, 0.06, 0.04);
    leftDebugPanel.rotation.x = -Math.PI * 0.35;
    drawLeftDebugPanel('初始化中...');
    return leftDebugPanel;
}

function drawLeftDebugPanel(info, countdown) {
    if (!leftDebugCtx) return;
    const c = leftDebugCtx, w = leftDebugCanvas.width, h = leftDebugCanvas.height;
    c.clearRect(0, 0, w, h);
    c.fillStyle = 'rgba(0,0,0,0.82)';
    roundRect(c, 0, 0, w, h, 24); c.fill();
    c.strokeStyle = '#00ffcc'; c.lineWidth = 4;
    roundRect(c, 2, 2, w - 4, h - 4, 22); c.stroke();

    c.fillStyle = '#00ffcc';
    c.font = 'bold 28px monospace';
    c.fillText('🚢 飞船状态', 18, 42);
    c.fillStyle = '#ffffff';
    c.font = '22px monospace';
    info.split('\n').forEach((line, i) => c.fillText(line, 18, 80 + i * 30));
    if (leftDebugTexture) leftDebugTexture.needsUpdate = true;
}

export function updateLeftDebugPanel() {
    if (!leftDebugPanel) return;
    // 选项卡气球状态
    if (STATE.choiceBalloonsActive) {
        const activeBalloons = STATE.choiceBalloons.filter(b => b.userData.active);
        const cdLeft = Math.max(0, STATE.choiceRefreshCooldown).toFixed(1);
        let balloonInfo = [];
        activeBalloons.forEach((b, idx) => {
            const name = b.userData.isRefresh ? '🔄刷新' : (b.userData.attr ? b.userData.attr.label : '?');
            const hitCount = b.userData.hitCount;
            const firstHit = b.userData.firstHitTime > 0 ? 
                ((performance.now() * 0.001 - b.userData.firstHitTime).toFixed(1) + 's') : '无';
            balloonInfo.push(`${idx+1}. ${name} 命中=${hitCount} 计时=${firstHit}`);
        });
        const info = [
            `🎈 选择增益（射击两次）`,
            `🎯 射击气球选择`,
            ...balloonInfo,
            STATE.choiceRefreshCooldown > 0 ? `⏳ 刷新冷却 ${cdLeft}s` : `🔄 射击绿色刷新`
        ].join('\n');
        drawLeftDebugPanel(info);
        return;
    }
    // 默认状态
    let buddhaLine = '🖐 未解锁';
    if (STATE.buddhaPalmReady) {
        if (STATE.buddhaPalmCooldown > 0) {
            buddhaLine = `🖐 冷却${STATE.buddhaPalmCooldown.toFixed(1)}s`;
        } else {
            buddhaLine = '🖐 就绪';
        }
    }
    const info = [
        `🚢 船血  ${STATE.shipHp}/${SHIP_MAX_HP}`,
        `💰 金币  ${STATE.playerStats.gold}`,
        buddhaLine
    ].join('\n');
    drawLeftDebugPanel(info);
}

// 聚合导出（避免 PICO 4 浏览器 import * as 兼容性问题）
export const VrAPI = {
    initAudio, playShootSound, playBalloonPopSound, startBackgroundMusic, stopBackgroundMusic,
    attachAK48, attachAK48ToLeft,
    setupController, controllers,
    updateInputs, handleShooting, handleMovement, handleExit,
    updateDebugPanel, updateLeftDebugPanel,
    updateGunRecoil
};
