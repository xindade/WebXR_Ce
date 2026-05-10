import * as THREE from '../three.module.js';
import { scene, dolly, STATE, BOUND_X, BOUND_Z, applySkyTarget,
         clouds, balloonGroup, bulletGroup, particleGroup, debrisGroup, choiceCardGroup,
         sunSprite, moonSprite, starLayers } from './core.js';
import { GLTFLoader } from '../jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from '../jsm/loaders/DRACOLoader.js';

// GLTF Loader
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
dracoLoader.setDecoderConfig({ type: 'js' });
const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);

// ===================== 可调参数 =====================
//   全部参数开放，修改后本地刷新即可生效
// ===== 激光气球布局（世界坐标，米） =====
export const LASER_CONFIG = {
    // ── 气球位置 ──
    balloonZHeights: [1.0, 3.5, 6.0, 8.5],   // 四层高度 [底层, 二层, 三层, 顶层]（Y轴，米）
    balloonXLeft: -2.5,                        // 左列气球 X（正=右，负=左）
    balloonXRight: 2.5,                        // 右列气球 X

    // ── Z轴行程（米）──
    startZ: -4.5,                              // 初始Z（驱赶起点，编号1/6行位置）
    driveTargetZ: 2.5,                         // 驱赶终点Z（驱赶动画完成后位置）
    row3SettleZ: -1.5,                         // 第三排(4-7号)散落位置Z
    row2SettleZ: 0.5,                          // 第二排(2-3号)散落位置Z
    row1SettleZ: 2.5,                          // 第一排(0-1号)散落位置Z

    // ── 动画时长（秒）──
    introDuration: 8.0,                        // 开场(魔术师出场)总时长
    pauseDuration: 1.0,                        // 激光气球出场淡入时长
    driveDuration: 4.0,                        // 驱赶动画时长（从startZ到driveTargetZ）
    settleDuration: 2.0,                       // 散落动画时长（各排就位）

    // ── 战斗动画参数 ──
    oscAmplitude: 1.5,                         // 垂直振荡幅度（±米，总行程=振幅×2）
    oscPeriod: 8,                              // 振荡周期（秒，越大=摆动越慢）
    aggPeriod: 4,                              // X向聚合周期（秒，0→聚合→分开→0）
    aggRange: 2.5,                             // X向聚合幅度（半宽，米）
    floatAmplitude: 0.3,                       // 浮动幅度（±米，非战斗时的悬浮）
    floatFreq: 0.8,                            // 浮动频率（越高=抖动越快）
    spinSpeed: 0.4,                            // 气球自转速度（弧度/秒）
    coreFreq: 15,                              // 激光核心闪烁频率（越高=闪越快）
    glowFreq: 6,                               // 激光辉光闪烁频率
    haloFreq: 3,                               // 激光光晕闪烁频率

    // ── 激光视觉参数 ──
    laserLengthPreScale: 16,                   // 激光长度（缩放前，米；缩放后=16×0.25=4米）
    groupScale: 0.25,                          // 整体缩放（0.25=缩小到1/4）
    collisionRadius: 0.15,                     // 碰撞判定半径（米，>此值=碰激光）

    // ── 魔术师参数 ──
    magicianScale: 1.5,                        // 魔术师模型缩放
    magicianY: 4,                              // 魔术师位置高度（Y轴，米）

    // ── 冻结/死亡反馈 ──
    freezeDuration: 3.0,                       // 死亡冻结时长（秒，期间不能移动）
    blackFlashDuration: 0.5,                   // 黑屏闪动时长（秒）

    // ── 高度调整（相对动画最终位置）──
    row1HeightOffset: 1.0,                     // 第一排(groups 0-1) Y +1 米
    row2HeightOffset: 1.0,                     // 第二排(groups 2-3) Y +1 米
    row3HeightOffset: -3.0,                    // 第三排(groups 4-7) Y -3 米

    // ── 过关/失败 ──
    winZ: -3.5,                                // 玩家 Z <= 此值 = 过关（从+端走到-端）
    resetZ: 2.0,                               // 失败重生点 Z
    maxFailures: 3,                            // 最大失败次数（3次后关卡结束无奖励）
};

// ===================== 内部状态 =====================
const S = {
    phase: 'INACTIVE',
    timer: 0,
    elapsed: 0,
    failures: 0,
    groups: [],
    gridGroup: null,
    magician: null,
    magicianWand: null,
    animData: {},
    freezeTimer: 0,         // 死亡冻结倒计时（秒）
    blackOverlay: null,     // 黑屏Mesh
    invulnTimer: 0,         // 重生无敌保护（秒）
};

// ===================== 隐藏/显示场景 =====================
// 存储被隐藏物体的可见性状态
const _hiddenGroups = [];

function hideShootingScene() {
    _hiddenGroups.length = 0;
    const hide = (obj) => {
        if (obj && obj.visible !== undefined) {
            _hiddenGroups.push({ obj, visible: obj.visible });
            obj.visible = false;
        }
    };
    // 射击气球容器
    hide(balloonGroup); hide(bulletGroup); hide(particleGroup); hide(debrisGroup);
    // 云朵装饰
    clouds.forEach(c => hide(c));
    // 气球船模型
    if (STATE.shipModel) hide(STATE.shipModel);
    // 抽卡组
    hide(choiceCardGroup);
    // 天空元素（隐藏日月，星空保持夜晚）
    hide(sunSprite); hide(moonSprite);
    starLayers.forEach(s => { if (s) hide(s); });
    // AK48 枪支（遍历 dolly 查找）
    dolly.traverse(child => {
        if (child.isMesh && child.name && child.name.includes('AK48')) {
            hide(child);
        }
    });
    window.__log('👻 原场景已隐藏', 's');
}

function showShootingScene() {
    _hiddenGroups.forEach(item => {
        item.obj.visible = item.visible;
    });
    window.__log('👻 原场景已恢复', 's');
}

// ===================== 工具函数 =====================
function easeInOut(p) {
    return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
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
    group.userData = { coreMat, glowMat, haloMat, balloonMesh:m, mat, dir, baseY:0, startZ:0, targetZ:0 };
    return group;
}

// ===================== 舞台网格 =====================
function createStageGrid() {
    const g = new THREE.Group();
    const W = BOUND_X*2, D = BOUND_Z*2;
    const xs = -W/2, zs = -D/2;
    const box = new THREE.Mesh(new THREE.BoxGeometry(W,0.2,D), new THREE.MeshBasicMaterial({ color:0x1a2a3a, transparent:true, opacity:0.5, depthWrite:false }));
    box.position.set(0,-0.1,0); box.renderOrder = 1; g.add(box);
    const lm = new THREE.LineBasicMaterial({ color:0x446688, transparent:true, opacity:0.35 });
    for (let i=0;i<=D;i+=2){ const z=zs+i; g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(xs,0.01,z),new THREE.Vector3(xs+W,0.01,z)]),lm)); }
    for (let i=0;i<=W;i+=2){ const x=xs+i; g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x,0.01,zs),new THREE.Vector3(x,0.01,zs+D)]),lm)); }
    return g;
}

// ===================== 加载魔术师模型 =====================
function loadMagicianModel(callback) {
    const group = new THREE.Group();

    gltfLoader.load('Model/魔术师.glb', (gltf) => {
        const mag = gltf.scene;
        mag.scale.setScalar(LASER_CONFIG.magicianScale);
        mag.position.y = LASER_CONFIG.magicianY;
        group.add(mag);

        // 加载魔法棒并挂到魔术师右手
        gltfLoader.load('Model/魔术棒.glb', (gltf2) => {
            const wand = gltf2.scene;
            wand.scale.setScalar(LASER_CONFIG.magicianScale);
            wand.position.set(0.8, 0.2, 0); // 相对魔术师的偏移
            mag.add(wand);
            window.__log('🎩 魔术师+魔术棒 加载成功', 's');
            if (callback) callback(group);
        }, undefined, () => {
            window.__log('⚠️ 魔术棒加载失败，继续', 'w');
            if (callback) callback(group);
        });
    }, undefined, () => {
        window.__log('⚠️ 魔术师.glb 未找到，使用占位', 'w');
        // 回退占位
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

    // 1. 隐藏原场景
    hideShootingScene();

    // 2. 创建舞台网格
    S.gridGroup = createStageGrid();

    // 3. 创建黑屏遮罩（黑色方块包裹头显）
    const overlayGeo = new THREE.BoxGeometry(0.6, 0.5, 0.5);
    const overlayMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false, depthTest: false, side: THREE.BackSide });
    S.blackOverlay = new THREE.Mesh(overlayGeo, overlayMat);
    // 放在玩家眼高位置，用 BackSide 从内部看是全黑
    S.blackOverlay.position.set(0, 6.6, 0);  // 与 camera 同位置
    dolly.add(S.blackOverlay);

    scene.add(S.gridGroup);

    // 3. 切换天空为白天（第三关：白天）
    applySkyTarget('day');

    // 4. 加载魔术师（异步），加载完毕后挂到场景
    S.magician = new THREE.Group();
    scene.add(S.magician);
    loadMagicianModel((magGroup) => {
        // 替换占位
        scene.remove(S.magician);
        S.magician = magGroup;
        scene.add(S.magician);
        window.__log('🎩 魔术师就位', 's');
    });

    // 5. 激光气球暂不创建——由 INTRO 阶段结束后创建

    // 6. 进入开场阶段
    S.phase = 'INTRO';
    S.timer = 0;
    S.elapsed = 0;
    S.failures = 0;
    S.freezeTimer = 0;
    S.animData = {};
    S.groups = [];
    STATE.gameMode = 'laser';
    window.__log('🎩 激光关卡开场！魔术师表演8秒...', 's');
}

// ===================== 创建激光气球（INTRO结束后调用） =====================
function spawnLaserBalloons() {
    const cfg = LASER_CONFIG;
    S.groups = [];
    for (let si = 0; si < 4; si++) {
        const g1 = createLaserBalloon('posX', _balloonColors[si]);
        g1.position.set(cfg.balloonXLeft, cfg.balloonZHeights[si], cfg.startZ);
        g1.userData.baseY = cfg.balloonZHeights[si];
        g1.userData.startZ = cfg.startZ;
        g1.userData.targetZ = cfg.driveTargetZ;
        scene.add(g1);
        S.groups.push(g1);

        const g2 = createLaserBalloon('negX', _balloonColors[si + 4]);
        g2.position.set(cfg.balloonXRight, cfg.balloonZHeights[si], cfg.startZ);
        g2.userData.baseY = cfg.balloonZHeights[si];
        g2.userData.startZ = cfg.startZ;
        g2.userData.targetZ = cfg.driveTargetZ;
        scene.add(g2);
        S.groups.push(g2);
    }
    window.__log('🔦 8个激光气球已登场', 's');
}

// ===================== 每帧更新 =====================
export function updateLaserLevel(dt) {
    if (S.phase === 'INACTIVE') return;
    S.elapsed += dt;
    const cfg = LASER_CONFIG;

    // ── 冻结中：锁定位置 + 黑屏渐退 ──
    if (S.freezeTimer > 0) {
        S.freezeTimer -= dt;
        dolly.position.set(0, 0, cfg.resetZ);
        if (S.blackOverlay) {
            const fade = Math.max(0, S.freezeTimer / cfg.freezeDuration);
            S.blackOverlay.material.opacity = Math.min(1, fade / 0.3);
        }
        if (S.freezeTimer <= 0) {
            if (S.blackOverlay) S.blackOverlay.material.opacity = 0;
            if (S.failures >= cfg.maxFailures) {
                S.phase = 'CLEARED'; onLaserFailed(); return;
            } else {
                S.phase = 'FIGHTING';
                S.invulnTimer = 1.0;
                window.__log('↩️ 剩余次数:' + (cfg.maxFailures - S.failures), 'w');
            }
        }
        return;
    }

    // ── 无敌保护倒计时 ──
    if (S.invulnTimer > 0) S.invulnTimer -= dt;

    switch (S.phase) {

    case 'INTRO':
        S.timer += dt;
        // 魔术师悬浮旋转
        if (S.magician) {
            S.magician.position.y = cfg.magicianY + 0.3 * Math.sin(S.elapsed * 1.5);
            S.magician.rotation.y += dt * 0.3;
        }
        if (S.timer >= cfg.introDuration) {
            // 创建激光气球
            spawnLaserBalloons();
            S.phase = 'ENTER';
            S.timer = 0;
            window.__log('🔦 激光气球登场！准备驱赶...', 's');
        }
        break;

    case 'ENTER':
        S.timer += dt;
        S.groups.forEach(g => {
            g.traverse(child => {
                if (child.isMesh && child.material) {
                    child.material.opacity = Math.min(0.88, S.timer * 0.5);
                }
            });
        });
        if (S.timer >= cfg.pauseDuration) {
            S.phase = 'DRIVE';
            S.timer = 0;
            window.__log('⚡ 驱赶开始！', 's');
        }
        break;

    case 'DRIVE':
        S.timer += dt; {
            const p = Math.min(S.timer / cfg.driveDuration, 1);
            const ep = easeInOut(p);
            S.groups.forEach(g => { g.position.z = g.userData.startZ + (g.userData.targetZ - g.userData.startZ) * ep; });
            if (checkLaserCollision()) {
                S.failures++;
                window.__log('💥 驱赶中命中！剩余:' + (cfg.maxFailures - S.failures), 'e');
                STATE.shipHitFlash = 0.3;
                teleportPlayerToSafe();
            }
            if (p >= 1) { S.phase = 'SETTLE_ROW3'; S.timer = 0; window.__log('🏗️ 第三排落位...', 's'); }
        }
        break;

    // ──────── SETTLE_ROW3：第三排（groups 4-7）散落 ────────
    case 'SETTLE_ROW3':
        S.timer += dt; {
            const p = Math.min(S.timer / cfg.settleDuration, 1);
            const ep = easeInOut(p);
            for (let i = 4; i <= 7; i++) {
                const g = S.groups[i]; if (!g) continue;
                g.position.z = cfg.driveTargetZ + (cfg.row3SettleZ - cfg.driveTargetZ) * ep;
            }
            // Y轴：从原始高度animate到(原始高度+row3HeightOffset)
            for (let i = 4; i <= 7; i++) {
                const g = S.groups[i]; if (!g) continue;
                g.position.y = g.userData.baseY + cfg.row3HeightOffset * ep;
            }
            for (let i = 6; i <= 7; i++) {
                const g = S.groups[i]; if (!g) continue;
                g.rotation.z = -Math.PI / 2 + ep * Math.PI / 2;
            }
            if (checkLaserCollision()) { S.failures++; window.__log('💥 散落中命中！', 'e'); STATE.shipHitFlash = 0.3; teleportPlayerToSafe(); }
            if (p >= 1) {
                for (let i = 6; i <= 7; i++) { const g = S.groups[i]; if (g) g.rotation.z = 0; }
                S.phase = 'SETTLE_ROW12'; S.timer = 0; window.__log('🏗️ 第二排+第一排落位...', 's');
            }
        }
        break;

    // ──────── SETTLE_ROW12：第二排（2-3）+ 第一排（0-1）散落 ────────
    case 'SETTLE_ROW12':
        S.timer += dt; {
            const p = Math.min(S.timer / cfg.settleDuration, 1);
            const ep = easeInOut(p);
            for (let i = 2; i <= 3; i++) {
                const g = S.groups[i]; if (!g) continue;
                g.position.z = cfg.driveTargetZ + (cfg.row2SettleZ - cfg.driveTargetZ) * ep;
                g.rotation.z = (i === 2 ? Math.PI / 2 : -Math.PI / 2) * (1 - ep);
            }
            // Row1 (0,1) +1m 高度 + 1号右球上升0.5m
            for (let i = 0; i <= 1; i++) {
                const g = S.groups[i]; if (!g) continue;
                g.position.z = cfg.driveTargetZ + (cfg.row1SettleZ - cfg.driveTargetZ) * ep;
                g.position.y = (g.userData.baseY || cfg.balloonZHeights[i == 0 ? 0 : 0]) + cfg.row1HeightOffset * ep;
                if (i === 1) {
                    if (!S.animData.r1y1) S.animData.r1y1 = g.position.y;
                    g.position.y = S.animData.r1y1 + 0.5 * ep;
                }
            }
            // Row2 (2,3) +1m 高度
            for (let i = 2; i <= 3; i++) {
                const g = S.groups[i]; if (!g) continue;
                if (!g.userData.baseY) g.userData.baseY = cfg.balloonZHeights[i == 2 ? 1 : 1];
                g.position.y = g.userData.baseY + cfg.row2HeightOffset * ep;
            }
            if (checkLaserCollision()) { S.failures++; window.__log('💥 散落中命中！', 'e'); STATE.shipHitFlash = 0.3; teleportPlayerToSafe(); }
            if (p >= 1) {
                S.phase = 'FIGHTING'; S.timer = 0; S.animData = {};
                window.__log('🔥 闯关开始！走到 Z<' + cfg.winZ + ' 过关', 's');
            }
        }
        break;

    case 'FIGHTING':
        if (checkLaserCollision() && S.freezeTimer <= 0 && S.invulnTimer <= 0) handleLaserHit();
        if (dolly.position.z <= cfg.winZ && S.freezeTimer <= 0) { S.phase = 'CLEARED'; onLaserCleared(); return; }
        break;


    }

    // 气球动画
    updateBalloonAnimations(dt);
}

// ===================== 气球动画 =====================
function updateBalloonAnimations(dt) {
    if (!S.groups.length) return;
    const cfg = LASER_CONFIG;
    const ad = S.animData;
    const pNow = performance.now() * 0.001;
    if (S.phase === 'FIGHTING') S.timer += dt;

    S.groups.forEach((g, i) => {
        const d = g.userData;
        if (S.phase === 'FIGHTING') {
            if (i <= 1) {
                if (!ad.r1Y0) ad.r1Y0 = g.position.y;
                g.position.y = ad.r1Y0 + cfg.oscAmplitude * Math.sin(2 * Math.PI * S.timer / cfg.oscPeriod);
            } else if (i === 2 || i === 3) {
                const px = (S.timer % cfg.aggPeriod) / cfg.aggPeriod;
                const tri = 1 - Math.abs(2 * px - 1);
                g.position.x = (i===2?-cfg.aggRange:cfg.aggRange) + cfg.aggRange * tri * (i===2?1:-1);
            } else if (i === 4 || i === 5) {
                g.position.y = (d.baseY || cfg.balloonZHeights[i-4]) + cfg.oscAmplitude * Math.sin(2 * Math.PI * S.timer / cfg.oscPeriod);
            } else {
                const px = (S.timer % cfg.aggPeriod) / cfg.aggPeriod;
                const tri = 1 - Math.abs(2 * px - 1);
                g.position.x = (i===6?-cfg.aggRange:cfg.aggRange) + cfg.aggRange * tri * (i===6?1:-1);
            }
        } else {
            g.position.y = d.baseY + cfg.floatAmplitude * Math.sin(pNow * cfg.floatFreq + i * 0.5);
        }
        d.balloonMesh.rotation.y = pNow * cfg.spinSpeed + i;
        d.balloonMesh.rotation.z = 0.15 * Math.sin(pNow * 0.3 + i * 0.5);
        const fl = 0.5 + 0.5 * Math.sin(pNow * cfg.coreFreq + i * 1.5);
        d.coreMat.opacity = 0.65 + 0.35 * fl;
        d.glowMat.opacity = 0.15 + 0.25 * (0.5 + 0.5 * Math.sin(pNow * cfg.glowFreq + i * 1.5));
        d.haloMat.opacity = 0.03 + 0.09 * (0.5 + 0.5 * Math.sin(pNow * cfg.haloFreq + i * 1.5));
    });
}

// ===================== 碰撞检测 =====================
function teleportPlayerToSafe() { dolly.position.set(0, 0, LASER_CONFIG.resetZ); }

let _cct = 0;
function checkLaserCollision() {
    if (!S.groups.length) return false;
    const cfg = LASER_CONFIG;
    const pp = dolly.position;
    _cct++;
    if (_cct % 3 !== 0) return false;
    const hs = [0.5, 1.3, 1.6];
    for (let i = 0; i < S.groups.length; i++) {
        const g = S.groups[i];
        const wp = new THREE.Vector3(); g.getWorldPosition(wp);
        const dir = g.userData.dir === 'posX' ? 1 : -1;
        const len = cfg.laserLengthPreScale * cfg.groupScale;
        const sx = wp.x, sy = wp.y, sz = wp.z;
        const ex = sx + dir * len;
        const dx = ex - sx, dy = 0, dz = 0;
        const ls = dx*dx;
        if (ls === 0) continue;
        for (const y of hs) {
            const cx = pp.x - sx, cy = pp.y + y - sy, cz = pp.z - sz;
            let t = (cx*dx + cy*dy + cz*dz) / ls;
            t = Math.max(0, Math.min(1, t));
            const px = sx + dx * t, py = sy + dy * t, pz = sz + dz * t;
            const dist = Math.sqrt((pp.x-px)**2 + (pp.y+y-py)**2 + (pp.z-pz)**2);
            if (dist < cfg.collisionRadius) return true;
        }
    }
    return false;
}

// ===================== 命中/过关/失败 =====================
function handleLaserHit() {
    S.failures++;
    S.freezeTimer = LASER_CONFIG.freezeDuration;
    if (S.blackOverlay) S.blackOverlay.material.opacity = 1;
    teleportPlayerToSafe();
    window.__log('💥 撞到激光！剩余:' + (LASER_CONFIG.maxFailures - S.failures) + '，冻结' + LASER_CONFIG.freezeDuration + '秒', 'e');
}

function onLaserCleared() {
    showShootingScene();
    cleanupLaserLevel();
    STATE.playerStats.gold += 500;
    import('./game.js').then(m => m.spawnChoiceCards());
    window.__log('💰 奖励: 技能选项卡+传说选项卡+500金币', 's');
}

function onLaserFailed() {
    showShootingScene();
    cleanupLaserLevel();
    STATE.waveNumber++;
    import('./game.js').then(m => m.spawnBalloons());
}

// ===================== 清理 =====================
export function cleanupLaserLevel() {
    S.groups.forEach(g => { g.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) { if (Array.isArray(c.material)) c.material.forEach(m=>m.dispose()); else c.material.dispose(); }}); scene.remove(g); });
    S.groups = [];
    if (S.gridGroup) { S.gridGroup.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); }); scene.remove(S.gridGroup); S.gridGroup = null; }
    if (S.magician) { S.magician.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); }); scene.remove(S.magician); S.magician = null; }
    showShootingScene();
    S.phase = 'INACTIVE';
    STATE.gameMode = 'shooting';
    LaserAPI._initialized = false;
}

// ===================== 导出 =====================
export const LaserAPI = { startLaserLevel, updateLaserLevel, cleanupLaserLevel };
