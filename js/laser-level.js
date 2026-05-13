import * as THREE from '../three.module.js';
import { scene, dolly, STATE, BOUND_X, BOUND_Z, applySkyTarget,
         clouds, balloonGroup, bulletGroup, particleGroup, debrisGroup, choiceCardGroup,
         sunSprite, moonSprite, starLayers } from './core.js';
import { GLTFLoader } from '../jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from '../jsm/loaders/DRACOLoader.js';
import { spawnBalloons, spawnChoiceCards } from './game.js';

// GLTF Loader
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
dracoLoader.setDecoderConfig({ type: 'js' });
const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);

// ===================== 可调参数 =====================
//   全部参数开放，修改后本地刷新即可生效
//
// 气球索引（在 groups[] 中的位置）:
//   0→① 左列, 1→② 右列, 2→③ 左, 3→④ 右
//   4→⑤ 左, 5→⑥ 右, 6→⑦ 左, 7→⑧ 右
export const LASER_CONFIG = {
    // ── 初始布局（对应 spawn 中的 pos 数组）──
    balloonInitPos: [
        [-2.5, 0.5, -4],  [2.5, 0.7, -4],
        [-2.5, 2.5, -4],  [2.5, 2.7, -4],
        [-2.5, 4.5, -4],  [2.5, 4.7, -4],
        [-2.5, 6.5, -4],  [2.5, 6.7, -4],
    ],

    // ── 动画时长 ──
    magicianDur: 8.0,       // 开场念白/展示（秒）

    // ── 激光参数 ──
    laserLengthPreScale: 16,
    groupScale: 0.25,
    collisionRadius: 0.15,

    // ── 魔术师 ──
    magicianScale: 1.5,  magicianY: 4,

    // ── 死亡反馈 ──
    freezeDuration: 1.0,       // 黑屏冻结时长（秒）
    blackoutDuration: 1.0,     // 漆黑时长（秒）

    // ── 过关/失败 ──
    winZ: -3.5,  resetZ: 2.0,  maxFailures: 3,
};

// ===================== 内部状态 =====================
const S = {
    phase: 'INACTIVE',         // 当前阶段
    timer: 0,                   // 阶段内计时器
    elapsed: 0,                 // 总用时
    failures: 0,                // 失败次数
    groups: [],                 // 8个激光气球组
    gridGroup: null,            // 舞台网格
    magician: null,             // 魔术师组
    magicianWand: null,
    freezeTimer: 0,             // 冻结倒计时
    blackoutTimer: 0,           // 漆黑倒计时
    blackOverlay: null,         // 黑屏Mesh
    invulnTimer: 0,             // 无敌倒计时
    restoreAfterBlackout: false,
    // 排动画保存的初始值（惰性赋值）
    r1: {},  r2: {},  r3: {},
};

// ===================== 隐藏/显示场景 =====================
const _hiddenGroups = [];
function hideShootingScene() {
    _hiddenGroups.length = 0;
    const hide = (obj) => { if (obj && obj.visible !== undefined) { _hiddenGroups.push({ obj, visible: obj.visible }); obj.visible = false; } };
    hide(balloonGroup); hide(bulletGroup); hide(particleGroup); hide(debrisGroup);
    clouds.forEach(c => hide(c));
    if (STATE.shipModel) hide(STATE.shipModel);
    hide(choiceCardGroup);
    hide(sunSprite); hide(moonSprite);
    starLayers.forEach(s => { if (s) hide(s); });
    dolly.traverse(child => { if (child.isMesh && child.name && child.name.includes('AK48')) hide(child); });
    window.__log('👻 原场景已隐藏', 's');
}
function showShootingScene() {
    _hiddenGroups.forEach(item => { item.obj.visible = item.visible; });
    window.__log('👻 原场景已恢复', 's');
}

// ===================== 工具函数 =====================
function easeInOut(p) { return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; }

// roundRect polyfill（PICO 4 浏览器兼容）
if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
        if (r > w/2) r = w/2;
        if (r > h/2) r = h/2;
        this.moveTo(x + r, y);
        this.arcTo(x + w, y, x + w, y + h, r);
        this.arcTo(x + w, y + h, x, y + h, r);
        this.arcTo(x, y + h, x, y, r);
        this.arcTo(x, y, x + w, y, r);
        return this;
    };
}

// ===================== 双金字塔几何体 =====================
let _sharedBalloonGeo = null;
function getBalloonGeo() {
    if (!_sharedBalloonGeo) {
        const v = new Float32Array([0,1.5,0, 0,-1.5,0, 0,0,1, 1,0,0, 0,0,-1, -1,0,0]);
        const idx = new Uint16Array([0,2,3, 0,3,4, 0,4,5, 0,5,2, 1,3,2, 1,4,3, 1,5,4, 1,2,5]);
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(v, 3));
        g.setIndex(new THREE.BufferAttribute(idx, 1));
        g.computeVertexNormals();
        _sharedBalloonGeo = g;
    }
    return _sharedBalloonGeo;
}

// ===================== 创建激光气球 =====================
const _balloonColors = [0xff2222,0xff6600,0xffcc00,0x22dd22, 0x22dddd,0x2266ff,0x8822ff,0xff22ff];
function createLaserBalloon(dir, color) {
    const cfg = LASER_CONFIG;
    const group = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.88, depthWrite: false });
    const m = new THREE.Mesh(getBalloonGeo(), mat);
    group.add(m);
    const LL = cfg.laserLengthPreScale;
    const atY = -1.5 - LL / 2;
    const coreMat = new THREE.MeshBasicMaterial({ color:0xff3300, transparent:true, opacity:1, toneMapped:false, depthWrite:false, blending:THREE.AdditiveBlending });
    const glowMat = new THREE.MeshBasicMaterial({ color:0xff5500, transparent:true, opacity:0.3, toneMapped:false, depthWrite:false, blending:THREE.AdditiveBlending });
    const haloMat = new THREE.MeshBasicMaterial({ color:0xff7700, transparent:true, opacity:0.08, toneMapped:false, depthWrite:false, blending:THREE.AdditiveBlending });
    [{r:0.015,seg:4},{r:0.06,seg:6},{r:0.18,seg:6}].forEach((ll,idx)=>{
        const mats = [coreMat,glowMat,haloMat];
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(ll.r,ll.r,LL,ll.seg,1), mats[idx]);
        mesh.position.set(0, atY, 0);
        group.add(mesh);
    });
    if (dir==='posX') group.rotation.z = Math.PI/2;
    else if (dir==='negX') group.rotation.z = -Math.PI/2;
    group.scale.setScalar(cfg.groupScale);
    group.userData = { coreMat, glowMat, haloMat, balloonMesh:m, mat, dir, baseY:0, startZ:0 };
    return group;
}

// ===================== 坐标网格（居中到玩家活动区域） =====================
function createStageGrid() {
    const g = new THREE.Group();
    // 网格居中于原点(0,0,0)，范围: X±BOUND_X, Z±BOUND_Z
    const GX = BOUND_X * 2;  // 总宽6m
    const GZ = BOUND_Z * 2;  // 总深10m
    const halfX = BOUND_X;
    const halfZ = BOUND_Z;

    // 半透明底板
    const box = new THREE.Mesh(new THREE.BoxGeometry(GX, 0.12, GZ),
        new THREE.MeshBasicMaterial({ color: 0x1a2a3a, transparent: true, opacity: 0.3, depthWrite: false }));
    box.position.set(0, -0.06, 0);
    box.renderOrder = 1; g.add(box);

    // 1m × 1m 网格线（居中于原点）
    const gridMat = new THREE.LineBasicMaterial({ color: 0x4488aa, transparent: true, opacity: 0.45 });
    for (let i = -halfX; i <= halfX; i++) {
        const pts = [new THREE.Vector3(i, 0.01, -halfZ), new THREE.Vector3(i, 0.01, halfZ)];
        g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gridMat));
    }
    for (let i = -halfZ; i <= halfZ; i++) {
        const pts = [new THREE.Vector3(-halfX, 0.01, i), new THREE.Vector3(halfX, 0.01, i)];
        g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gridMat));
    }

    // 坐标轴箭头 (X=红, Z=蓝, Y=绿) — 从原点出发
    const arrowLen = 1.2;
    [[0xff4444,-1],[0x4444ff,0],[0x44ff44,2]].forEach(([color, axis])=>{
        const mat = new THREE.LineBasicMaterial({ color });
        let pts;
        if(axis===-1) pts=[new THREE.Vector3(0,0.02,0), new THREE.Vector3(arrowLen,0.02,0)];
        else if(axis===0) pts=[new THREE.Vector3(0,0.02,0), new THREE.Vector3(0,0.02,arrowLen)];
        else pts=[new THREE.Vector3(0,0.02,0), new THREE.Vector3(0,arrowLen,0)];
        g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
    });
    // 同时显示负轴短虚线
    const dashMat = new THREE.LineDashedMaterial({ color:0x666666, dashSize:0.05, gapSize:0.05 });
    [-1,0,2].forEach(axis=>{
        const mat = dashMat;
        let pts;
        if(axis===-1) pts=[new THREE.Vector3(-arrowLen*0.5,0.02,0), new THREE.Vector3(0,0.02,0)];
        else if(axis===0) pts=[new THREE.Vector3(0,0.02,-arrowLen*0.5), new THREE.Vector3(0,0.02,0)];
        else pts=[new THREE.Vector3(0,0.02,0), new THREE.Vector3(0,0.02,0)];
        if(axis===2) return; // Y负轴不显示
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat);
        line.computeLineDistances();
        g.add(line);
    });

    // 轴标签
    function makeLabel(text, pos, color) {
        const c = document.createElement('canvas');
        c.width = 128; c.height = 64;
        const ctx = c.getContext('2d');
        ctx.fillStyle = color; ctx.font = 'bold 40px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(text, 64, 34);
        const tex = new THREE.CanvasTexture(c);
        const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
        const sprite = new THREE.Sprite(mat);
        sprite.position.copy(pos); sprite.scale.set(0.4, 0.2, 1);
        g.add(sprite);
    }
    makeLabel('+X', new THREE.Vector3(arrowLen + 0.3, 0.02, 0), '#ff6666');
    makeLabel('-X', new THREE.Vector3(-arrowLen - 0.3, 0.02, 0), '#666666');
    makeLabel('+Z', new THREE.Vector3(0, 0.02, arrowLen + 0.3), '#6666ff');
    makeLabel('-Z', new THREE.Vector3(0, 0.02, -arrowLen - 0.3), '#666666');
    makeLabel('+Y', new THREE.Vector3(0, arrowLen + 0.3, 0), '#66ff66');

    return g;
}

// 创建数字标签 (Canvas Sprite)
function makeBalloonLabel(num, position) {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 80;
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.beginPath(); ctx.roundRect(4, 4, 120, 72, 16); ctx.fill();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(4, 4, 120, 72, 16); ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 48px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(num), 64, 42);
    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.position.copy(position);
    sprite.position.y += 1.2;  // 气球上方
    sprite.scale.set(0.4, 0.25, 1);
    return sprite;
}

// ===================== 加载魔术师模型 =====================
function loadMagicianModel(callback) {
    const group = new THREE.Group();
    gltfLoader.load('Model/魔术师.glb', (gltf) => {
        const mag = gltf.scene;
        mag.scale.setScalar(LASER_CONFIG.magicianScale);
        mag.position.y = LASER_CONFIG.magicianY;
        group.add(mag);
        gltfLoader.load('Model/魔术棒.glb', (gltf2) => {
            const wand = gltf2.scene;
            wand.scale.setScalar(LASER_CONFIG.magicianScale);
            wand.position.set(0.8, 0.2, 0);
            mag.add(wand);
            window.__log('🎩 魔术师+魔术棒 加载成功', 's');
            if (callback) callback(group);
        }, undefined, () => { if (callback) callback(group); });
    }, undefined, () => {
        window.__log('⚠️ 魔术师.glb 未找到，使用占位', 'w');
        const placeholder = new THREE.Mesh(new THREE.SphereGeometry(0.6,8,6), new THREE.MeshBasicMaterial({ color:0x8844ff }));
        placeholder.position.y = LASER_CONFIG.magicianY;
        const hat = new THREE.Mesh(new THREE.ConeGeometry(0.5,0.7,6), new THREE.MeshBasicMaterial({ color:0x222266 }));
        hat.position.set(0, LASER_CONFIG.magicianY+0.5, 0);
        group.add(placeholder);
        group.add(hat);
        if (callback) callback(group);
    });
}

// ===================== 初始化激光关卡 =====================
export function startLaserLevel() {
    if (S.phase !== 'INACTIVE') return;
    const cfg = LASER_CONFIG;
    hideShootingScene();
    S.gridGroup = createStageGrid();
    scene.add(S.gridGroup);

    // 黑屏遮罩
    const overlayGeo = new THREE.BoxGeometry(5, 5, 5);
    const overlayMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false, depthTest: false, side: THREE.BackSide });
    S.blackOverlay = new THREE.Mesh(overlayGeo, overlayMat);
    S.blackOverlay.position.set(0, 1.6, 0);
    dolly.add(S.blackOverlay);

    applySkyTarget('day');
    S.magician = new THREE.Group();
    scene.add(S.magician);
    loadMagicianModel((magGroup) => {
        scene.remove(S.magician);
        S.magician = magGroup;
        scene.add(S.magician);
        window.__log('🎩 魔术师就位', 's');
    });

    S.phase = 'INTRO';
    S.timer = 0;
    S.elapsed = 0;
    S.failures = 0;
    S.freezeTimer = 0;
    S.groups = [];
    STATE.gameMode = 'laser';
    window.__log('🎩 激光关卡开场！8秒后展示气球...', 's');
}

// ===================== 创建激光气球（INTRO结束时调用） =====================
function spawnLaserBalloons() {
    S.groups = [];
    const pos = LASER_CONFIG.balloonInitPos;
    pos.forEach((p, i) => {
        const dir = i % 2 === 0 ? 'posX' : 'negX';
        const g = createLaserBalloon(dir, _balloonColors[i]);
        g.position.set(p[0], p[1], p[2]);
        g.userData.baseY = p[1];
        const label = makeBalloonLabel(i + 1, new THREE.Vector3(p[0], p[1], p[2]));
        g.userData.label = label;
        scene.add(label);
        scene.add(g);
        S.groups.push(g);
    });
    window.__log('🔦 8个激光气球已放置（等待观察）', 's');
}

// ===================== 每帧更新 =====================
export function updateLaserLevel(dt) {
    if (S.phase === 'INACTIVE') return;
    S.elapsed += dt;
    const cfg = LASER_CONFIG;

    // ── 冻结闪烁（碰激光时短暂黑屏 0.3s）──
    if (S.freezeTimer > 0) {
        S.freezeTimer -= dt;
        dolly.position.set(0, 0, cfg.resetZ);
        if (S.blackOverlay) S.blackOverlay.material.opacity = 1;
        if (S.freezeTimer <= 0) {
            if (S.blackOverlay) S.blackOverlay.material.opacity = 0;
            // 死亡路径：直接重置或结束，不走卡片引导
            if (S.failures >= cfg.maxFailures) {
                S.phase = 'CLEARED';
                onLaserFailed();
                return;
            } else {
                resetAndRestartAnimation();
            }
        }
        return;
    }

    // ── 无敌保护 ──
    if (S.invulnTimer > 0) S.invulnTimer -= dt;

    // ── 通关检测（DRIVE 阶段也可通关）──
    if (S.freezeTimer <= 0 && S.invulnTimer <= 0 &&
        (S.phase === 'ANIM_1A' || S.phase === 'ANIM_1B' || S.phase === 'ANIM_2' || S.phase === 'ANIM_3' || S.phase === 'SHOW_GRID' || S.phase === 'DRIVE')) {
        if (dolly.position.z >= -4.0 && dolly.position.z <= -2.2 && dolly.position.x >= -2 && dolly.position.x <= 2) {
            enterCenterPhase();
        }
    }

    // ── 碰撞检测（INTRO 和结局阶段不检测，其余全检测）──
    if (S.freezeTimer <= 0 && S.invulnTimer <= 0 &&
        S.phase !== 'INTRO' && S.phase !== 'SHOW_GRID' &&
        S.phase !== 'CENTER' && S.phase !== 'MAGICIAN_CENTER' && S.phase !== 'SHOW_CARDS') {
        if (checkLaserCollision()) handleLaserHit();
    }
    switch (S.phase) {

    case 'INTRO':
        S.timer += dt;
        if (S.magician) {
            S.magician.position.y = cfg.magicianY + 0.3 * Math.sin(S.elapsed * 1.5);
            S.magician.rotation.y += dt * 0.3;
        }
        if (S.timer >= cfg.magicianDur) {
            spawnLaserBalloons();
            S.phase = 'DRIVE';
            S.timer = 0;
            window.__log('🚀 驱赶动画 6秒 Z:-4→3', 's');
        }
        break;

    case 'DRIVE':
        S.timer += dt;
        {
            const dur = 6.0;
            const p = Math.min(S.timer / dur, 1);
            const ep = easeInOut(p);
            S.groups.forEach(g => {
                g.position.z = -4 + (2 - (-4)) * ep;  // Z: -4 -> 2
            });
            if (p >= 1) {
                S.phase = 'ANIM_1A';
                S.timer = 0;
                // 记录 3-8 号(idx 2-7)的起始 Z（驱赶结束时应在 Z=2）
                S.animZ = {};
                window.__log('🎯 驱赶完成，动画1A: 3-8号 Z:2→0', 's');
            }
        }
        break;

    case 'ANIM_1A':
        S.timer += dt;
        {
            const dur = 1.0;
            const p = Math.min(S.timer / dur, 1);
            const ep = easeInOut(p);
            // 首次记录起始 Z
            if (S.animZ._init === undefined) {
                S.animZ._init = true;
                for (let i = 2; i <= 7; i++) {
                    const g = S.groups[i];
                    if (g) S.animZ['z' + i] = g.position.z;
                }
            }
            for (let i = 2; i <= 7; i++) {
                const g = S.groups[i];
                if (!g) continue;
                const startZ = S.animZ['z' + i] || 2;
                g.position.z = startZ + (0 - startZ) * ep;  // Z: 当前 → 0
            }
            if (p >= 1) {
                S.phase = 'ANIM_1B';
                S.timer = 0;
                window.__log('🎯 动画1B: 3-4号绕Z旋转90度', 's');
            }
        }
        break;

    case 'ANIM_1B':
        S.timer += dt;
        {
            const dur = 0.5;
            const p = Math.min(S.timer / dur, 1);
            const ep = easeInOut(p);
            // 首次记录起始旋转
            if (S.animZ._rotInit === undefined) {
                S.animZ._rotInit = true;
                // 3号(idx=2) + 4号(idx=3): rotation.z 都转到 0（激光指向地面）
                S.animZ.r2Start = S.groups[2] ? S.groups[2].rotation.z : 0;
                S.animZ.r3Start = S.groups[3] ? S.groups[3].rotation.z : 0;
            }
            const g2 = S.groups[2], g3 = S.groups[3];
            if (g2) g2.rotation.z = S.animZ.r2Start + (0 - S.animZ.r2Start) * ep;
            if (g3) g3.rotation.z = S.animZ.r3Start + (0 - S.animZ.r3Start) * ep;
            if (p >= 1) {
                S.phase = 'ANIM_2';
                S.timer = 0;
                S.anim2 = {};
                window.__log('🎯 动画2: 1-2上下浮 3-4左右摆 5-8 Z前移', 's');
            }
        }
        break;

    case 'ANIM_2':
        S.timer += dt;
        {
            const cfg2 = S.anim2;

            // --- 1,2号: Y 在 0.2~4 来回振荡，周期 4s，保持 0.2 差值 ---
            const yOsc = 2.1 + 1.9 * Math.sin(2 * Math.PI * S.elapsed / 4.0);
            const g0 = S.groups[0], g1 = S.groups[1];
            if (g0) g0.position.y = yOsc;      // 1号: 0.2~4
            if (g1) g1.position.y = yOsc + 0.2; // 2号: 0.4~4.2

            // --- 3,4号: 先上升2m → 再X向来回振荡 ---
            if (cfg2._riseInit === undefined) {
                cfg2._riseInit = true;
                cfg2._riseTimer = 0;
                const g2 = S.groups[2], g3 = S.groups[3];
                cfg2._riseY2 = g2 ? g2.position.y : 0;
                cfg2._riseY3 = g3 ? g3.position.y : 0;
            }
            const g2 = S.groups[2], g3 = S.groups[3];
            if (!cfg2._riseDone) {
                cfg2._riseTimer += dt;
                const rp = Math.min(cfg2._riseTimer / 0.5, 1);
                const rep = easeInOut(rp);
                if (g2) g2.position.y = cfg2._riseY2 + 2 * rep;
                if (g3) g3.position.y = cfg2._riseY3 + 2 * rep;
                if (rp >= 1) {
                    cfg2._riseDone = true;
                    // 上升完成，记录新的 Y 基准
                    cfg2._xYbase = g2 ? g2.position.y : 2;
                }
            } else {
                // 保持 Y 不变，只振荡 X（三角波，周期 4s）
                const xPhase = (S.elapsed % 4.0) / 4.0;
                const xTri = 1 - Math.abs(2 * xPhase - 1);
                if (g2) g2.position.x = -2.5 + (2.4 * xTri);
                if (g3) g3.position.x = 2.5 - (2.4 * xTri);
            }

            // --- 5-8号: Z 从 0 → -2，时长 1s（一次性） ---
            if (cfg2._zInit === undefined) {
                cfg2._zInit = true;
                for (let i = 4; i <= 7; i++) {
                    const g = S.groups[i];
                    if (g) cfg2['z' + i] = g.position.z;
                }
            }
            if (!cfg2._zDone) {
                cfg2._zTimer = (cfg2._zTimer || 0) + dt;
                const zp = Math.min(cfg2._zTimer / 1.0, 1);
                const zep = easeInOut(zp);
                for (let i = 4; i <= 7; i++) {
                    const g = S.groups[i];
                    if (!g) continue;
                    const startZ = cfg2['z' + i] || 0;
                    g.position.z = startZ + (-2 - startZ) * zep;
                }
                if (zp >= 1) cfg2._zDone = true;
            }
            // 5-8 Z移动完成后等待 2 秒，进入 ANIM_3
            if (cfg2._zDone) {
                if (cfg2._endTimer === undefined) cfg2._endTimer = 0;
                cfg2._endTimer += dt;
                if (cfg2._endTimer >= 2.0) {
                    S.phase = 'ANIM_3';
                    S.timer = 0;
                    S.anim3 = {};
                    window.__log('🎬 动画3: 5-6上下浮 7-8旋转+下降+X摆', 's');
                }
            }
        }
        break;

    case 'ANIM_3':
        S.timer += dt;
        {
            const cfg3 = S.anim3;

            // --- 1-4号: 保持 ANIM_2 的行为 ---
            // 1,2: Y 振荡，保持 0.2 差值
            const yOsc = 2.1 + 1.9 * Math.sin(2 * Math.PI * S.elapsed / 4.0);
            const g0 = S.groups[0], g1 = S.groups[1];
            if (g0) g0.position.y = yOsc;
            if (g1) g1.position.y = yOsc + 0.2;
            // 3,4: X 三角波振荡
            const xPhase = (S.elapsed % 4.0) / 4.0;
            const xTri = 1 - Math.abs(2 * xPhase - 1);
            const g2 = S.groups[2], g3 = S.groups[3];
            if (g2) g2.position.x = -2.5 + (2.4 * xTri);
            if (g3) g3.position.x = 2.5 - (2.4 * xTri);

            // --- 5,6号: Y 在 0.2~4 振荡，周期 6s，间距 0.2 ---
            const yOsc56 = 2.1 + 1.9 * Math.sin(2 * Math.PI * S.elapsed / 6.0);
            const g4 = S.groups[4], g5 = S.groups[5];
            if (g4) g4.position.y = yOsc56;      // 5号: 0.2~4 (周期6s)
            if (g5) g5.position.y = yOsc56 + 0.2; // 6号: 0.4~4.2 (周期6s)

            // --- 7,8号: 先绕Z旋转90度 → Y下降到4.5 → X振荡 ---
            if (cfg3._init78 === undefined) {
                cfg3._init78 = true;
                cfg3._phase78 = 'ROT';  // ROT → Y_DESC → X_OSC
                cfg3._t78 = 0;
                const g6 = S.groups[6], g7 = S.groups[7];
                cfg3._r6Start = g6 ? g6.rotation.z : 0;
                cfg3._r7Start = g7 ? g7.rotation.z : 0;
                cfg3._y6Start = g6 ? g6.position.y : 0;
                cfg3._y7Start = g7 ? g7.position.y : 0;
            }
            const g6 = S.groups[6], g7 = S.groups[7];
            cfg3._t78 += dt;

            if (cfg3._phase78 === 'ROT') {
                // 旋转 0.5s：rotation.z → 0（激光指向地面）
                const dur = 0.5;
                const rp = Math.min(cfg3._t78 / dur, 1);
                const rep = easeInOut(rp);
                if (g6) g6.rotation.z = cfg3._r6Start + (0 - cfg3._r6Start) * rep;
                if (g7) g7.rotation.z = cfg3._r7Start + (0 - cfg3._r7Start) * rep;
                if (rp >= 1) {
                    cfg3._phase78 = 'Y_DESC';
                    cfg3._t78 = 0;
                }
            } else if (cfg3._phase78 === 'Y_DESC') {
                // Y 下降到 4.5，1s
                const dur = 1.0;
                const rp = Math.min(cfg3._t78 / dur, 1);
                const rep = easeInOut(rp);
                if (g6) g6.position.y = cfg3._y6Start + (4.5 - cfg3._y6Start) * rep;
                if (g7) g7.position.y = cfg3._y7Start + (4.5 - cfg3._y7Start) * rep;
                if (rp >= 1) {
                    cfg3._phase78 = 'X_OSC';
                    cfg3._t78 = 0;
                }
            } else {
                // X 振荡：7号 -2.5↔-0.1, 8号 +2.5↔+0.1，周期 4s
                const xp = (S.elapsed % 4.0) / 4.0;
                const xt = 1 - Math.abs(2 * xp - 1);
                if (g6) g6.position.x = -2.5 + (2.4 * xt);
                if (g7) g7.position.x = 2.5 - (2.4 * xt);
            }
        }
        break;

    case 'SHOW_GRID':
        break;

    // ==================== 通用结局引导 ====================
    // 通关或死亡后: 隐去气球 → 引导至中心 → 魔术师飞来 → 4秒 → 卡片

    case 'CENTER':
        S.timer += dt;
        // 地面指示环
        if (!S.centerRing) {
            const ringGeo = new THREE.RingGeometry(0.3, 0.5, 32);
            const ringMat = new THREE.MeshBasicMaterial({ color: 0x44ff88, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false });
            S.centerRing = new THREE.Mesh(ringGeo, ringMat);
            S.centerRing.rotation.x = -Math.PI / 2;
            S.centerRing.position.set(0, 0.02, 0);
            scene.add(S.centerRing);
        }
        // 检测玩家是否走到中心（直径 2m 内）或超过 10 秒自动推进
        const distCenter = Math.sqrt(dolly.position.x * dolly.position.x + dolly.position.z * dolly.position.z);
        if (distCenter < 1.0 || S.timer > 10.0) {
            if (S.centerRing) { scene.remove(S.centerRing); S.centerRing = null; }
            // 修复: 强制将玩家传送到中心
            dolly.position.set(0, 0, 0);
            S.phase = 'MAGICIAN_CENTER';
            S.timer = 0;
            window.__log('🎩 魔术师到场...', 's');
        }
        break;

    case 'MAGICIAN_CENTER':
        S.timer += dt;
        // 魔术师飞到 (0, 1.5, -2)
        if (S.magician) {
            const target = new THREE.Vector3(0, 1.5, -2);
            S.magician.position.lerp(target, dt * 2);
            S.magician.rotation.y += dt * 0.5;
        }
        // 等待 4 秒
        if (S.timer >= 4.0) {
            S.phase = 'SHOW_CARDS';
            S.timer = 0;
            window.__log('💳 生成卡片...', 's');
        }
        break;

    case 'SHOW_CARDS':
        S.timer += dt;
        if (!S.cardsSpawned) {
            S.cardsSpawned = true;
            // 恢复 choiceCardGroup 可见（被 hideShootingScene 隐藏了）
            choiceCardGroup.visible = true;
            // 确保 choiceCardsActive 为 false 才能生成
            STATE.choiceCardsActive = false;
            spawnChoiceCards(true);
            S._prevChoiceActive = false;
        }
        // 检测卡片是否被选中 (choiceCardsActive true→false)
        const ca = STATE.choiceCardsActive;
        if (S._prevChoiceActive && !ca) {
            // 卡片被选中，结束胜利流程
            S._prevChoiceActive = false;
            onLaserCleared();
            return;
        }
        S._prevChoiceActive = ca;
        break;

    }

    // 通用气球动画（自转+激光闪烁）
    updateBalloonFX(dt);
}

// ===================== 气球特效（自转+激光闪烁，所有阶段通用） =====================
function updateBalloonFX(dt) {
    if (!S.groups.length) return;
    const t = S.elapsed;
    S.groups.forEach((g, i) => {
        const d = g.userData;
        if (!d || !d.balloonMesh) return;
        d.balloonMesh.rotation.y = t * 0.4 + i;
        d.balloonMesh.rotation.z = 0.15 * Math.sin(t * 0.3 + i * 0.5);
        if (d.coreMat) d.coreMat.opacity = 0.65 + 0.35 * (0.5 + 0.5 * Math.sin(t * 15 + i));
        if (d.glowMat) d.glowMat.opacity = 0.15 + 0.25 * (0.5 + 0.5 * Math.sin(t * 6 + i));
        if (d.haloMat) d.haloMat.opacity = 0.03 + 0.09 * (0.5 + 0.5 * Math.sin(t * 3 + i));
    });
}

// ===================== 碰撞检测 =====================
// 通过 group.matrixWorld 将激光的局部端点变换到世界坐标
// 激光（CylinderGeometry）在局部沿 Y 轴，中心在 (0, atY, 0)，高度 LL
// atY = -1.5 - LL/2, LL = laserLengthPreScale
// 经 groupScale 缩放后: 中心在 (0, atY*scale, 0), 半长 = LL*scale/2
let _cct = 0;
const _ls = new THREE.Vector3(), _le = new THREE.Vector3();
function checkLaserCollision() {
    if (!S.groups.length) return false;
    const cfg = LASER_CONFIG;
    const pp = dolly.position;
    _cct++;
    if (_cct % 3 !== 0) return false;
    const hs = [0.5, 1.3, 1.6];
    // 激光局部坐标（未缩放，让 applyMatrix4 处理缩放）
    const atY = -1.5 - cfg.laserLengthPreScale / 2;  // 激光中心局部Y = -9.5
    const halfLen = cfg.laserLengthPreScale / 2;      // 半长 = 8

    for (let i = 0; i < S.groups.length; i++) {
        const g = S.groups[i];
        if (!g.visible) continue;

        // 用 group.matrixWorld 将局部端点变换到世界坐标（含缩放+旋转+位移）
        _ls.set(0, atY + halfLen, 0).applyMatrix4(g.matrixWorld);
        _le.set(0, atY - halfLen, 0).applyMatrix4(g.matrixWorld);

        const dx = _le.x - _ls.x, dy = _le.y - _ls.y, dz = _le.z - _ls.z;
        const ls = dx*dx + dy*dy + dz*dz;
        if (ls < 0.001) continue;

        for (const yOff of hs) {
            const px = pp.x, py = pp.y + yOff, pz = pp.z;
            let t = ((px-_ls.x)*dx + (py-_ls.y)*dy + (pz-_ls.z)*dz) / ls;
            t = Math.max(0, Math.min(1, t));
            const cx = _ls.x + dx * t;
            const cy = _ls.y + dy * t;
            const cz = _ls.z + dz * t;
            const dist = Math.sqrt((px-cx)**2 + (py-cy)**2 + (pz-cz)**2);
            if (dist < cfg.collisionRadius) return true;
        }
    }
    return false;
}

// ===================== 命中 =====================
function handleLaserHit() {
    S.failures++;
    S.freezeTimer = 0.3;    // 0.3 秒黑色闪烁
    if (S.blackOverlay) S.blackOverlay.material.opacity = 1;
    teleportPlayerToSafe();
    // 隐藏当前激光气球
    S.groups.forEach(g => { if (g) g.visible = false; });
    S._fromDeath = true;
    window.__log('💥 撞到激光！剩余:' + (LASER_CONFIG.maxFailures - S.failures) + '次', 'e');
}

function enterCenterPhase() {
    S.groups.forEach(g => { if (g) g.visible = false; });
    if (S.centerRing) { scene.remove(S.centerRing); S.centerRing = null; }
    S.phase = 'CENTER';
    S.timer = 0;
    window.__log('🎯 请走到场地中央（绿色光圈）', 's');
}

function resetAndRestartAnimation() {
    const cfg = LASER_CONFIG;
    // 1. 清理当前气球（移除场景+释放几何体）
    S.groups.forEach(g => {
        // 移除标签
        if (g.userData.label) scene.remove(g.userData.label);
        g.traverse(c => {
            if (c.geometry) c.geometry.dispose();
            if (c.material) {
                if (Array.isArray(c.material)) c.material.forEach(m=>m.dispose());
                else c.material.dispose();
            }
        });
        scene.remove(g);
    });
    // 2. 重新生成气球到初始位置
    S.groups = [];
    const pos = cfg.balloonInitPos;
    pos.forEach((p, i) => {
        const dir = i % 2 === 0 ? 'posX' : 'negX';
        const g = createLaserBalloon(dir, _balloonColors[i]);
        g.position.set(p[0], p[1], p[2]);
        g.userData.baseY = p[1];
        const label = makeBalloonLabel(i + 1, new THREE.Vector3(p[0], p[1], p[2]));
        g.userData.label = label;
        scene.add(label);
        scene.add(g);
        S.groups.push(g);
    });
    // 3. 重新开始动画序列
    S.phase = 'DRIVE';
    S.timer = 0;
    S.elapsed = 0;
    S.invulnTimer = 1.0;  // 重生无敌 1 秒
    window.__log('🔄 气球重置，重新驱赶', 's');
}

function restoreAfterBlackout() {
    applySkyTarget('day');
    STATE.skyLocked = false;
    // 恢复云月星日
    S.groups.forEach(g => { if (g) g.visible = true; });
    clouds.forEach(c => { if (c) c.visible = true; });
    if (moonSprite) moonSprite.visible = true;
    starLayers.forEach(s => { if (s) s.visible = true; });
    if (sunSprite) sunSprite.visible = true;
    scene.fog.color.setHex(0x87CEEB);
    scene.fog.near = 10; scene.fog.far = 50;
    S.restoreAfterBlackout = false;
    window.__log('☀️ 光明恢复！', 's');
}

function teleportPlayerToSafe() { dolly.position.set(0, 0, LASER_CONFIG.resetZ); }

// ===================== 过关/失败 =====================
function onLaserCleared() {
    // 确保所有关键对象恢复可见
    balloonGroup.visible = true;
    bulletGroup.visible = true;
    particleGroup.visible = true;
    debrisGroup.visible = true;
    if (STATE.shipModel) STATE.shipModel.visible = true;
    showShootingScene();
    cleanupLaserLevel();
    STATE.gameMode = 'shooting';
    STATE.playerStats.gold += 500;
    // 推进到下一波（打气球模式）
    STATE.waveNumber++;
    try { spawnBalloons(); } catch(e) { console.error('spawnBalloons failed:', e); window.__log('❌ 生成气球失败: ' + e.message, 'e'); }
    window.__log('💰 奖励: 全部传说选项卡+500金币', 's');
    console.log('✅ onLaserCleared done, mode=' + STATE.gameMode + ' wave=' + STATE.waveNumber);
}

function onLaserFailed() {
    // 确保所有关键对象恢复可见
    balloonGroup.visible = true;
    bulletGroup.visible = true;
    particleGroup.visible = true;
    debrisGroup.visible = true;
    if (STATE.shipModel) STATE.shipModel.visible = true;
    showShootingScene();
    cleanupLaserLevel();
    STATE.gameMode = 'shooting';
    STATE.waveNumber++;
    try { spawnBalloons(); } catch(e) { console.error('spawnBalloons failed:', e); window.__log('❌ 生成气球失败: ' + e.message, 'e'); }
}

// ===================== 清理 =====================
export function cleanupLaserLevel() {
    S.groups.forEach(g => { g.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) { if (Array.isArray(c.material)) c.material.forEach(m=>m.dispose()); else c.material.dispose(); }}); scene.remove(g); });
    S.groups = [];
    if (S.gridGroup) { scene.remove(S.gridGroup); S.gridGroup = null; }
    if (S.magician) { scene.remove(S.magician); S.magician = null; }
    if (S.blackOverlay && S.blackOverlay.parent) { S.blackOverlay.parent.remove(S.blackOverlay); S.blackOverlay = null; }
    S.phase = 'INACTIVE';
    window.__log('🧹 激光关卡已清理', 's');
}

export const LaserAPI = { startLaserLevel, updateLaserLevel, cleanupLaserLevel };
