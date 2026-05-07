import * as THREE from '../three.module.js';

// ===================== 全局日志系统 =====================
// 所有模块最先执行的代码，确保日志缓冲区在 DOM 加载前就能用
if (!window.__logBuffer) window.__logBuffer = [];
window.__log = function(msg, level = 'i') {
    const entry = { msg, level, time: Date.now() };
    window.__logBuffer.push(entry);
    // 同时输出到 console 方便 PC 调试
    const prefix = level === 'e' ? '❌' : level === 'w' ? '⚠️' : level === 's' ? '✅' : '🔹';
    console.log(prefix, msg);
    // 直接更新面板 DOM（即使模块加载失败也能看到）
    try {
        const panel = document.getElementById('log-panel');
        if (panel) {
            const ts = new Date(entry.time).toTimeString().slice(0, 8);
            panel.innerHTML += '<span class="log-time">[' + ts + ']</span> <span class="log-' + level + '">' + msg + '</span>\n';
            panel.scrollTop = panel.scrollHeight;
        }
    } catch(e) {}
};

__log('core.js 模块开始加载', 's');

// ===================== 常量配置 =====================
export const MOVE_SPEED = 3.5;
export const DEADZONE = 0.2;
export const SHOOT_COOLDOWN = 150;

export const BULLET_SPEED = 15;
export const BULLET_LIFE = 2;
export const BULLET_POOL_SIZE = 20;

export const BALLOON_SPEED = 0.5;
export const BALLOON_SPAWN_RADIUS = 15;
export const BALLOON_COUNT = 10;
export const BALLOON_HP = 100;
export const BALLOON_SCORE = 10;
export const BALLOON_RADIUS = 0.5;
export const BALLOON_DAMAGE = 5;
export const BALLOON_COLORS = [0xff4444, 0x44ff44, 0x4444ff, 0xffff44, 0xff44ff, 0xff88ff, 0x88ffff];

export const KNIGHT_HP = 500;
export const KNIGHT_SCORE = 30;
export const KNIGHT_SCALE = 3;
export const KNIGHT_RADIUS = 0.5 * KNIGHT_SCALE;

export const WAVE_BASE_SPAWN_COUNT = 30;
export const SPAWN_BATCH_INTERVAL = 1.0;
export const SPAWN_BATCH_SIZE = 3;
export const SPAWN_MAX_ACTIVE = 10;
export const SPAWN_DISTANCE = 15;
export const SPAWN_SPREAD = 8;

export const SHIP_MAX_HP = 100;
export const SHIP_COLLISION_RADIUS = 2.5;
export const BALLOON_REPEL_FORCE = 3.0;
export const SHIP_REPEL_FORCE = 2.0;

export const CHOICE_CARD_DISTANCE = 1.5;

export const BUDDHA_COOLDOWN = 8;
export const AIM_TIMEOUT = 5;

export const AK48_SCALE = 0.6;
export const SHIP_SCALE = 7.0;
export const SHIP_POS = [1, 1, 0.05];
export const SHIP_ROT = [0, 1.57, 0];

export const DEBRIS_COUNT = 30;
export const DEBRIS_LIFE = 0.8;
export const PARTICLE_COUNT = 50;
export const PARTICLE_LIFE = 1.0;

export const BOUND_X = 2;
export const BOUND_Z = 4;

export const skyCycle = ['day', 'dusk', 'night'];

// ===================== 共享状态 =====================
export const STATE = {
    gameStarted: false,
    gameOverState: false,
    waveNumber: 0,
    leftHandGunEnabled: false,

    shipHp: SHIP_MAX_HP,
    shipHitFlash: 0,

    playerStats: { hp: 100, score: 50, atk: 30 },

    choiceCardsActive: false,
    extraBulletEnabled: false,
    selectedCardIndex: -1,
    cardHighlightTime: 0,
    choiceCardTimeout: null,

    buddhaPalmReady: false,
    buddhaPalmAttached: false,
    buddhaPalmCooldown: 0,
    buddhaPalmState: 'IDLE',
    buddhaPalmTimer: 0,

    rightInput: { stickX: 0, stickY: 0 },
    leftInput: { stickX: 0, stickY: 0 },
    rightTrigger: false,
    leftTrigger: false,

    leftBtnState: { trigger: false, grip: false, stickBtn: false, btnX: false, btnY: false },
    rightBtnState: { trigger: false, grip: false, stickBtn: false, btnA: false, btnB: false },

    prevLeftX: false,
    prevLeftY: false,
    prevLeftGrip: false,

    leftController: null,
    rightController: null,
    leftGrip: null,
    rightGrip: null,

    ak48Model: null,
    ak48Attached: false,
    ak48LeftAttached: false,
    shipModel: null,
    knightModel: null,
    buddhaPalmModel: null,

    lastRightShootTime: 0,
    lastLeftShootTime: 0,

    skyTarget: 'day',

    waveSpawnRemaining: 0,
    waveSpawned: 0,
    wavePhaseTimer: 0,
    wavePhase: 0,
    spawnBatchTimer: 0,

    loadingResources: { texture: false, model: false },
    loadingHidden: false,
};

// ===================== Three.js 核心 =====================
export const renderer = new THREE.WebGLRenderer({ antialias: false });
__log('WebGLRenderer 创建完成', 's');
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.0));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
// 注意：renderer.xr.enabled 在进入 VR 时由 enterVR() 设置（PICO 4 兼容性）

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);
scene.fog = new THREE.Fog(0x87CEEB, 30, 100);
renderer.setClearColor(new THREE.Color(0x87CEEB));
__log('Scene/背景/雾 创建完成 (0x87CEEB)', 's');

export const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 6.6, 0);
export const dolly = new THREE.Group();
dolly.add(camera);
scene.add(dolly);
__log('Camera 创建 (FOV:72, pos:0,6.6,0) + Dolly', 's');

// ===================== 灯光 =====================
export const sunLight = new THREE.DirectionalLight(0xffffff, 2.5);
sunLight.position.set(20, 40, 10);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 2048;
sunLight.shadow.mapSize.height = 2048;
sunLight.shadow.camera.near = 0.5;
sunLight.shadow.camera.far = 100;
sunLight.shadow.camera.left = -30;
sunLight.shadow.camera.right = 30;
sunLight.shadow.camera.top = 30;
sunLight.shadow.camera.bottom = -30;
scene.add(sunLight);
__log('DirectionalLight 创建 (强度:2.5, 阴影开启)', 's');

export const ambientLight = new THREE.AmbientLight(0xffeedd, 1.2);
scene.add(ambientLight);

export const hemiLight = new THREE.HemisphereLight(0x87CEEB, 0x90EE90, 0.8);
scene.add(hemiLight);

// VR 阴影开关
export function setShadow(enabled) {
    renderer.shadowMap.enabled = enabled;
    sunLight.castShadow = enabled;
    if (!enabled) {
        scene.traverse(obj => {
            if (obj.isMesh) obj.castShadow = false;
        });
    } else {
        sunLight.castShadow = true;
    }
}

// ===================== 天空系统 =====================
export const skyDomeGeo = new THREE.SphereGeometry(60, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
export const skyDomeMat = new THREE.MeshBasicMaterial({
    color: 0x87CEEB, side: THREE.BackSide, depthWrite: false
});
export const skyDome = new THREE.Mesh(skyDomeGeo, skyDomeMat);
skyDome.position.y = 1.6;
dolly.add(skyDome);

// 星空
function createGlowTexture(innerColor, outerColor, size) {
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    const g = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
    g.addColorStop(0, innerColor);
    g.addColorStop(0.15, innerColor);
    g.addColorStop(0.5, outerColor);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(canvas);
}
export const starTex = createGlowTexture('white', 'rgba(180,200,255,0.6)', 64);
export const starLayers = [];
for (let layer = 0; layer < 3; layer++) {
    const starGeo = new THREE.BufferGeometry();
    const count = 80 + layer * 50;
    const positions = new Float32Array(count * 3);
    const twinkleData = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.pow(Math.random(), 2.5) * Math.PI * 0.48;
        const r = 48 + Math.random() * 4 + layer * 1.5;
        positions[i*3] = Math.sin(phi) * Math.cos(theta) * r;
        positions[i*3+1] = Math.cos(phi) * r + 1.6;
        positions[i*3+2] = Math.sin(phi) * Math.sin(theta) * r;
        twinkleData[i*2] = Math.random() * Math.PI * 2;
        twinkleData[i*2+1] = 0.3 + Math.random() * 1.5;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const starMat = new THREE.PointsMaterial({
        map: starTex, color: 0xffffff, size: 0.35 + layer * 0.1,
        transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending
    });
    const starField = new THREE.Points(starGeo, starMat);
    starField.userData = { twinkle: twinkleData, baseOpacity: 0 };
    dolly.add(starField);
    starLayers.push(starField);
}

// 太阳/月亮精灵
function loadSpriteImage(path, spriteMat) {
    const img = new Image();
    img.onload = () => {
        const tex = new THREE.CanvasTexture(img);
        tex.colorSpace = THREE.SRGBColorSpace;
        if (spriteMat.map) spriteMat.map.dispose();
        spriteMat.map = tex;
        spriteMat.needsUpdate = true;
    };
    img.src = path;
}

const sunCanvas = document.createElement('canvas');
sunCanvas.width = 512; sunCanvas.height = 512;
(() => {
    const c = sunCanvas.getContext('2d'), cx = 256, cy = 256;
    const g = c.createRadialGradient(cx, cy, 30, cx, cy, 250);
    g.addColorStop(0, 'rgba(255,255,220,1)');
    g.addColorStop(0.08, 'rgba(255,255,200,1)');
    g.addColorStop(0.25, 'rgba(255,200,80,0.8)');
    g.addColorStop(0.5, 'rgba(255,140,30,0.25)');
    g.addColorStop(1, 'rgba(255,80,10,0)');
    c.fillStyle = g; c.fillRect(0, 0, 512, 512);
})();
export const sunTex = new THREE.CanvasTexture(sunCanvas);
sunTex.colorSpace = THREE.SRGBColorSpace;
export const sunSpriteMat = new THREE.SpriteMaterial({
    map: sunTex, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.NormalBlending, opacity: 1
});
export const sunSprite = new THREE.Sprite(sunSpriteMat);
sunSprite.scale.set(8, 8, 1);
dolly.add(sunSprite);
__log('太阳精灵创建完成', 's');

const moonCanvas = document.createElement('canvas');
moonCanvas.width = 512; moonCanvas.height = 512;
(() => {
    const c = moonCanvas.getContext('2d'), cx = 256, cy = 256, R = 200;
    const g = c.createRadialGradient(cx, cy, R * 0.12, cx, cy, R * 0.7);
    g.addColorStop(0, 'rgba(200,220,255,0.5)');
    g.addColorStop(0.5, 'rgba(140,170,220,0.1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 512, 512);
    const cutX = cx + R * 0.35, cutY = cy - R * 0.08, cutR = R * 0.82;
    const a1 = -Math.PI * 0.42, a2 = Math.PI * 0.42;
    c.fillStyle = 'rgba(232,240,255,0.92)';
    c.beginPath();
    c.arc(cx, cy, R, a1, a2);
    c.arc(cutX, cutY, cutR, a2, a1, true);
    c.closePath(); c.fill();
})();
export const moonTex = new THREE.CanvasTexture(moonCanvas);
moonTex.colorSpace = THREE.SRGBColorSpace;
export const moonSpriteMat = new THREE.SpriteMaterial({
    map: moonTex, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0
});
export const moonSprite = new THREE.Sprite(moonSpriteMat);
moonSprite.scale.set(5, 5, 1);
dolly.add(moonSprite);

loadSpriteImage('image/sun.png', sunSpriteMat);
loadSpriteImage('image/moon.png', moonSpriteMat);

// 气球笑脸贴图
export const balloonTex = new THREE.Texture();
const balloonImg = new Image();
balloonImg.onload = () => {
    balloonTex.image = balloonImg;
    balloonTex.colorSpace = THREE.SRGBColorSpace;
    balloonTex.needsUpdate = true;
};
balloonImg.src = 'image/smile.png';

// 天空预设
const DAY_SUN_AZ = Math.atan2(20, 10);
export const skyPresets = {
    day: {
        bg: 0x87CEEB, fog: 0x87CEEB, fogNear: 30, fogFar: 100,
        skyDome: 0x87CEEB, ambient: 0xffeedd, ambientI: 1.2,
        sun: 0xfffef5, sunI: 2.5, sunX: 20, sunY: 40, sunZ: 10,
        hemiSky: 0x87CEEB, hemiGround: 0x90EE90, hemiI: 0.8,
        stars: 0, sunElev: 50, moonElev: -30, moonAz: DAY_SUN_AZ
    },
    dusk: {
        bg: 0xe85d26, fog: 0xe87544, fogNear: 20, fogFar: 80,
        skyDome: 0xe86830, ambient: 0xffccaa, ambientI: 0.7,
        sun: 0xff9955, sunI: 1.8, sunX: 30, sunY: 8, sunZ: 5,
        hemiSky: 0xff5511, hemiGround: 0x553322, hemiI: 0.5,
        stars: 0.25, sunElev: 5, moonElev: 5, moonAz: Math.atan2(30, 5) + Math.PI
    },
    night: {
        bg: 0x0a0a28, fog: 0x0c0c2a, fogNear: 15, fogFar: 60,
        skyDome: 0x0e0e30, ambient: 0x1a2a55, ambientI: 0.35,
        sun: 0x8899cc, sunI: 0.5, sunX: -10, sunY: 45, sunZ: -15,
        hemiSky: 0x0a0a3a, hemiGround: 0x0f0f1a, hemiI: 0.2,
        stars: 1.0, sunElev: -25, moonElev: 50, moonAz: DAY_SUN_AZ
    }
};

export const skyNow = {
    bg: new THREE.Color(skyPresets.day.bg),
    fog: new THREE.Color(skyPresets.day.fog),
    fogNear: 30, fogFar: 100,
    skyDome: new THREE.Color(skyPresets.day.skyDome),
    ambient: new THREE.Color(skyPresets.day.ambient),
    ambientI: skyPresets.day.ambientI,
    sun: new THREE.Color(skyPresets.day.sun),
    sunI: skyPresets.day.sunI,
    sunX: 20, sunY: 40, sunZ: 10,
    hemiSky: new THREE.Color(skyPresets.day.hemiSky),
    hemiGround: new THREE.Color(skyPresets.day.hemiGround),
    hemiI: skyPresets.day.hemiI,
    stars: 0, sunElev: 50, moonElev: -30, moonAz: DAY_SUN_AZ
};

export function applySkyTarget(name) {
    STATE.skyTarget = name;
}

export function updateSkyTransition(dt) {
    const p = skyPresets[STATE.skyTarget];
    const ease = 1 - Math.exp(-0.12 * dt);

    skyNow.bg.lerp(new THREE.Color(p.bg), ease);
    skyNow.fog.lerp(new THREE.Color(p.fog), ease);
    skyNow.skyDome.lerp(new THREE.Color(p.skyDome), ease);
    skyNow.ambient.lerp(new THREE.Color(p.ambient), ease);
    skyNow.sun.lerp(new THREE.Color(p.sun), ease);
    skyNow.hemiSky.lerp(new THREE.Color(p.hemiSky), ease);
    skyNow.hemiGround.lerp(new THREE.Color(p.hemiGround), ease);

    skyNow.ambientI += (p.ambientI - skyNow.ambientI) * ease;
    skyNow.sunI += (p.sunI - skyNow.sunI) * ease;
    skyNow.hemiI += (p.hemiI - skyNow.hemiI) * ease;
    skyNow.sunX += (p.sunX - skyNow.sunX) * ease;
    skyNow.sunY += (p.sunY - skyNow.sunY) * ease;
    skyNow.sunZ += (p.sunZ - skyNow.sunZ) * ease;
    skyNow.fogNear += (p.fogNear - skyNow.fogNear) * ease;
    skyNow.fogFar += (p.fogFar - skyNow.fogFar) * ease;
    skyNow.stars += (p.stars - skyNow.stars) * ease;
    skyNow.sunElev += (p.sunElev - skyNow.sunElev) * ease;
    skyNow.moonElev += (p.moonElev - skyNow.moonElev) * ease;
    skyNow.moonAz += (p.moonAz - skyNow.moonAz) * ease;

    scene.background.copy(skyNow.bg);
    scene.fog.color.copy(skyNow.fog);
    scene.fog.near = skyNow.fogNear;
    scene.fog.far = skyNow.fogFar;
    renderer.setClearColor(skyNow.bg);
    skyDomeMat.color.copy(skyNow.skyDome);
    ambientLight.color.copy(skyNow.ambient);
    ambientLight.intensity = skyNow.ambientI;
    sunLight.color.copy(skyNow.sun);
    sunLight.intensity = skyNow.sunI;
    sunLight.position.set(skyNow.sunX, skyNow.sunY, skyNow.sunZ);
    hemiLight.color.copy(skyNow.hemiSky);
    hemiLight.groundColor.copy(skyNow.hemiGround);
    hemiLight.intensity = skyNow.hemiI;

    const sunAzimuth = Math.atan2(skyNow.sunX, skyNow.sunZ);
    const D2R = Math.PI / 180;

    function placeSprite(sprite, azimuth, elevDeg, dist) {
        const el = elevDeg * D2R;
        const cosEl = Math.cos(el);
        sprite.position.x = Math.sin(azimuth) * cosEl * dist;
        sprite.position.y = Math.sin(el) * dist + 1.6;
        sprite.position.z = Math.cos(azimuth) * cosEl * dist;
    }
    placeSprite(sunSprite, sunAzimuth, skyNow.sunElev, 45);
    placeSprite(moonSprite, skyNow.moonAz, skyNow.moonElev, 42);

    sunSprite.material.opacity = Math.max(0, Math.min(1, (skyNow.sunElev + 3) / 8));
    moonSprite.material.opacity = Math.max(0, Math.min(1, (skyNow.moonElev + 3) / 8));

    const starsActive = skyNow.stars > 0.01;
    if (starsActive) {
        const now = performance.now() * 0.001;
        starLayers.forEach((sf, idx) => {
            sf.visible = true;
            sf.rotation.y += dt * (0.015 + idx * 0.01);
            const base = skyNow.stars * (0.7 + idx * 0.15);
            const flicker = 0.85 + 0.15 * Math.sin(now * 1.7 + idx * 2.1);
            sf.material.opacity = Math.min(1, base * flicker);
        });
    } else {
        starLayers.forEach(sf => { sf.visible = false; });
    }
}

// ===================== 云朵装饰 =====================
function createCloud(x, y, z, scale = 1) {
    const cloudGroup = new THREE.Group();
    const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const spheres = [
        { pos: [0, 0, 0], r: 0.8 },
        { pos: [0.6, 0.2, 0], r: 0.6 },
        { pos: [-0.6, 0.1, 0], r: 0.55 },
    ];
    spheres.forEach(s => {
        const sphere = new THREE.Mesh(new THREE.SphereGeometry(s.r, 8, 6), cloudMat);
        sphere.position.set(...s.pos);
        cloudGroup.add(sphere);
    });
    cloudGroup.position.set(x, y, z);
    cloudGroup.scale.setScalar(scale);
    return cloudGroup;
}

export const clouds = [
    createCloud(-8, 5, -10, 1.5), createCloud(10, 6, -15, 2),
    createCloud(-5, 7, 8, 1.2), createCloud(15, 5, 5, 1.8),
    createCloud(3, 8, -20, 2.2), createCloud(-12, 4, 3, 1.0),
    createCloud(20, 6, -8, 1.6), createCloud(-18, 5, -12, 1.4),
    createCloud(0, 9, 15, 2.5), createCloud(-8, 3, -25, 1.3),
    createCloud(25, 7, 10, 1.7), createCloud(-22, 4, -18, 1.1),
];
clouds.forEach(cloud => scene.add(cloud));

// ===================== Group 容器 =====================
export const bulletGroup = new THREE.Group();
scene.add(bulletGroup);

export const balloonGroup = new THREE.Group();
scene.add(balloonGroup);

export const particleGroup = new THREE.Group();
scene.add(particleGroup);

export const debrisGroup = new THREE.Group();
scene.add(debrisGroup);

export const choiceCardGroup = new THREE.Group();
dolly.add(choiceCardGroup);

// ===================== 加载管理 =====================
export function checkAllLoaded(msg) {
    if (STATE.loadingHidden) return;
    const loadingEl = document.getElementById('loading');
    if (msg) {
        loadingEl.innerHTML = '<div style="color:#ffaa00;">' + msg + '</div>';
        setTimeout(() => { loadingEl.style.display = 'none'; STATE.loadingHidden = true; }, 1500);
        return;
    }
    if (STATE.loadingResources.texture && STATE.loadingResources.model) {
        STATE.loadingHidden = true;
        loadingEl.style.display = 'none';
    }
}

export function onResourceError(msg) {
    const loadingEl = document.getElementById('loading');
    loadingEl.innerHTML = '<div style="color:#ffaa00;">' + msg + '</div>';
    setTimeout(() => { loadingEl.style.display = 'none'; STATE.loadingHidden = true; }, 2000);
}

setTimeout(() => {
    if (!STATE.loadingHidden) onResourceError('⚠️ 加载超时，检查 HTTP 服务器是否运行中...');
}, 15000);

// 输出系统信息到日志
__log('设备像素比: ' + window.devicePixelRatio, 'i');
__log('窗口尺寸: ' + window.innerWidth + 'x' + window.innerHeight, 'i');
__log('navigator.xr: ' + (navigator.xr ? '可用' : '不可用'), 'i');

STATE.loadingResources.texture = true;
checkAllLoaded();

// ===================== 窗口调整 =====================
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// ===================== 工具函数 =====================
export function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}
