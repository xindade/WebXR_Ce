import * as THREE from '../three.module.js';

// 音频模块注入（避免循环依赖，由 index.html 在初始化时设置）
let audioModule = null;
export function setAudio(m) { audioModule = m; }
function playPop() { if (audioModule) audioModule.playBalloonPopSound(); }
// VR 模块注入（由 index.html 在初始化时设置）
let vrModule = null;
export function setVR(m) { vrModule = m; }

import {
    scene, dolly, camera, bulletGroup, balloonGroup, particleGroup, debrisGroup, choiceCardGroup,
    STATE, BULLET_SPEED, BULLET_LIFE, BULLET_POOL_SIZE,
    BALLOON_SPEED, BALLOON_HP, BALLOON_SCORE, BALLOON_RADIUS, BALLOON_COLORS,
    KNIGHT_HP, KNIGHT_SCORE, KNIGHT_SCALE, KNIGHT_RADIUS,
    WAVE_BASE_SPAWN_COUNT, SPAWN_BATCH_INTERVAL, SPAWN_BATCH_SIZE, SPAWN_MAX_ACTIVE, SPAWN_DISTANCE, SPAWN_SPREAD,
    SHIP_MAX_HP, SHIP_COLLISION_RADIUS, BALLOON_REPEL_FORCE, SHIP_REPEL_FORCE, BALLOON_DAMAGE,
    CHOICE_CARD_DISTANCE, CHOICE_CARD_WIDTH, CHOICE_CARD_HEIGHT, CHOICE_REFRESH_HEIGHT,
    CHOICE_CARD_SPACING, CHOICE_REFRESH_OFFSET_Y, CHOICE_CARD_Y_OFFSET,
    CHOICE_HIGHLIGHT_PULL, CHOICE_HIGHLIGHT_SCALE, CHOICE_HIGHLIGHT_LERP,
    RAY_PITCH_ANGLE, RAY_CAST_DISTANCE,
    DEBRIS_COUNT, DEBRIS_LIFE, PARTICLE_COUNT, PARTICLE_LIFE,
    BUDDHA_COOLDOWN, BUDDHA_KILL_RADIUS, BUDDHA_DAMAGE, BUDDHA_FALL_DURATION, BUDDHA_PARTICLE_COUNT,
    BUDDHA_HAND_SCALE, BUDDHA_HAND_POS, BUDDHA_HAND_ROT_X,
    BUDDHA_FALL_START_SCALE, BUDDHA_FALL_END_SCALE, BUDDHA_FALL_HEIGHT, BUDDHA_FALL_FORWARD, BUDDHA_IMPACT_CLEANUP,
    BOUND_X, BOUND_Z, balloonTex, buddhaPalmGroup,
    applySkyTarget, skyCycle, skyBrightness,
    createCloud, clouds,
    TRANSITION_CLOUD_POSITIONS, TRANSITION_CLOUD_Y, TRANSITION_CLOUD_SCALE,
    TRANSITION_SPEED, TRANSITION_DISAPPEAR_Z, TRANSITION_SPAWN_Z
} from './core.js';

// ===================== 子弹系统 =====================
export const bullets = [];
const sharedBulletGeom = new THREE.SphereGeometry(0.02, 8, 8);
const sharedBulletMat = new THREE.MeshStandardMaterial({
    color: 0xffaa00, emissive: 0xff4400, emissiveIntensity: 0.8
});
const bulletPool = [];

export function initBulletPool() {
    for (let i = 0; i < BULLET_POOL_SIZE; i++) {
        const mesh = new THREE.Mesh(sharedBulletGeom, sharedBulletMat);
        mesh.userData = { active: false, vel: new THREE.Vector3(), life: 0 };
        mesh.visible = false;
        bulletGroup.add(mesh);
        bulletPool.push(mesh);
    }
    if (window.__log) window.__log('子弹池初始化 (' + BULLET_POOL_SIZE + ' 个)', 's');
}
initBulletPool();

function acquireBullet() {
    for (let i = 0; i < bulletPool.length; i++) {
        if (!bulletPool[i].userData.active) return bulletPool[i];
    }
    return null;
}

function fireOneBullet(controller) {
    const bullet = acquireBullet();
    if (!bullet) return;

    const muzzleLocal = new THREE.Vector3(0, 0, -0.2);
    const origin = muzzleLocal.clone().applyMatrix4(controller.matrixWorld);
    const quat = controller.getWorldQuaternion(new THREE.Quaternion());

    const bulletPitch = -30 * Math.PI / 180;
    const localPitchQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(bulletPitch, 0, 0));
    const finalQuat = quat.clone().multiply(localPitchQuat);
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(finalQuat);

    bullet.position.copy(origin);
    bullet.userData.active = true;
    bullet.userData.vel.copy(dir.normalize().multiplyScalar(BULLET_SPEED));
    bullet.userData.life = BULLET_LIFE;
    bullet.visible = true;
    bullets.push(bullet);
}

export function shootBullet(controller) {
    fireOneBullet(controller);
    // 多重射击：根据 multiShotChance 概率发射额外子弹
    let remain = STATE.multiShotChance;
    while (remain > 0) {
        if (remain >= 100 || Math.random() * 100 < remain) {
            setTimeout(() => fireOneBullet(controller), 50);
            remain -= 100;
        } else {
            break;
        }
    }
}

export function updateBullets(dt) {
    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.position.x += b.userData.vel.x * dt;
        b.position.y += b.userData.vel.y * dt;
        b.position.z += b.userData.vel.z * dt;
        b.userData.life -= dt;
        if (b.userData.life <= 0 || b.position.y < 0 || b.position.y > 30) {
            b.userData.active = false;
            b.visible = false;
            bullets.splice(i, 1);
        }
    }
}

// ===================== 气球系统 =====================
export const balloons = [];

export function createBalloon(x, y, z) {
    const geom = new THREE.SphereGeometry(BALLOON_RADIUS, 16, 16);
    const color = BALLOON_COLORS[Math.floor(Math.random() * BALLOON_COLORS.length)];
    // 夜间提高 emissiveIntensity，确保笑脸贴图始终清晰可见
    const emissiveI = 0.15 + (1.0 - skyBrightness) * 0.6;
    const mat = new THREE.MeshStandardMaterial({
        map: balloonTex.image ? balloonTex : null,
        color, roughness: 0.3, metalness: 0.1,
        emissive: color, emissiveIntensity: emissiveI
    });
    const balloon = new THREE.Mesh(geom, mat);
    balloon.position.set(x, y, z);
    balloon.castShadow = true;
    balloon.userData = { active: true, hp: BALLOON_HP, maxHp: BALLOON_HP, isKnight: false, radius: BALLOON_RADIUS, baseEmissiveI: emissiveI };
    balloonGroup.add(balloon);
    balloons.push(balloon);
    return balloon;
}

export function createKnightBalloon(x, y, z) {
    if (!STATE.knightModel) return createBalloon(x, y, z);
    const knight = STATE.knightModel.clone();
    knight.scale.setScalar(KNIGHT_SCALE);
    knight.position.set(x, y, z);
    knight.traverse(child => { if (child.isMesh) child.castShadow = true; });
    knight.userData = { active: true, hp: KNIGHT_HP, maxHp: KNIGHT_HP, isKnight: true, radius: KNIGHT_RADIUS };
    // 血条背景（居中）
    const barBg = new THREE.Mesh(
        new THREE.PlaneGeometry(1.0, 0.08),
        new THREE.MeshBasicMaterial({ color: 0x333333, depthTest: false })
    );
    barBg.position.set(0, 1.3, 0);
    barBg.name = 'hpBarBg';
    knight.add(barBg);
    // 血条填充（几何体左移使左侧为锚点，position 对齐背景左边缘）
    const fillGeom = new THREE.PlaneGeometry(0.96, 0.06);
    fillGeom.translate(0.48, 0, 0); // 左边缘在 x=0
    const barFill = new THREE.Mesh(
        fillGeom,
        new THREE.MeshBasicMaterial({ color: 0x44ff44, depthTest: false })
    );
    barFill.position.set(-0.5, 1.3, 0.001);
    barFill.name = 'hpBarFill';
    knight.add(barFill);
    // 存储引用方便更新
    knight.userData.hpBarFill = barFill;
    balloonGroup.add(knight);
    balloons.push(knight);
    return knight;
}

export function disposeBalloon(b) {
    if (b.userData.isKnight) {
        b.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
                else child.material.dispose();
            }
        });
        // 清除子元素中的血条引用
        if (b.userData.hpBarFill) b.userData.hpBarFill = null;
    } else {
        b.geometry.dispose();
        b.material.dispose();
    }
    balloonGroup.remove(b);
}

export function spawnBalloons() {
    balloons.forEach(b => disposeBalloon(b));
    balloons.length = 0;

    const totalSpawns = WAVE_BASE_SPAWN_COUNT + STATE.waveNumber * 5;
    STATE.waveSpawnRemaining = totalSpawns;
    STATE.waveSpawned = 0;
    STATE.wavePhaseTimer = 0;
    STATE.wavePhase = 1;
    STATE.spawnBatchTimer = 0;

    // 按波次设置天空和云朵
    if (STATE.waveNumber === 0) {
        applySkyTarget('dusk');
        clouds.forEach(c => c.visible = true);
        window.__log('🌅 第一关：黄昏', 's');
    } else if (STATE.waveNumber === 1) {
        applySkyTarget('night');
        clouds.forEach(c => c.visible = false);
        window.__log('🌙 第二关：夜晚（云朵消散）', 's');
    } else {
        // 激光关卡失败后恢复射击时
        applySkyTarget('day');
        clouds.forEach(c => c.visible = true);
        window.__log('☀️ 后续波次：白天', 's');
    }

    window.__log('🎈 第' + STATE.waveNumber + '波开始，目标生成 ' + totalSpawns + ' 个气球', 's');
    console.log(`🎈 第${STATE.waveNumber}波开始，目标生成 ${totalSpawns} 个气球`);
}

function spawnOneBalloon() {
    const playerPos = dolly.position.clone();
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    forward.y = 0; forward.normalize();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    right.y = 0; right.normalize();

    let dirs = [];
    dirs.push(playerPos.clone().add(forward.clone().multiplyScalar(SPAWN_DISTANCE)));
    if (STATE.wavePhase >= 2) {
        dirs.push(playerPos.clone().add(right.clone().multiplyScalar(SPAWN_DISTANCE)));
        dirs.push(playerPos.clone().sub(right.clone().multiplyScalar(SPAWN_DISTANCE)));
    }
    if (STATE.wavePhase >= 3) {
        dirs.push(playerPos.clone().sub(forward.clone().multiplyScalar(SPAWN_DISTANCE)));
    }

    const basePos = dirs[Math.floor(Math.random() * dirs.length)];
    const x = basePos.x + (Math.random() - 0.5) * SPAWN_SPREAD;
    const z = basePos.z + (Math.random() - 0.5) * SPAWN_SPREAD;
    const y = 1.5 + Math.random() * 3;

    const knightChance = (STATE.waveNumber >= 1) ? Math.min(0.35, 0.08 + STATE.waveNumber * 0.025) : 0;
    const isKnight = Math.random() < knightChance;

    if (isKnight) {
        createKnightBalloon(x, y, z);
        const offsetDist = 1.2;
        createBalloon(x - offsetDist, y, z);
        createBalloon(x + offsetDist, y, z);
    } else {
        createBalloon(x, y, z);
    }
}

export function updateWaveSpawning(dt) {
    if (STATE.waveSpawnRemaining <= 0) return;
    STATE.wavePhaseTimer += dt;

    if (STATE.wavePhase === 1 && STATE.wavePhaseTimer >= 15) {
        STATE.wavePhase = 2;
        console.log('🎈 左右方向开始生成气球');
    } else if (STATE.wavePhase === 2 && STATE.wavePhaseTimer >= 30) {
        STATE.wavePhase = 3;
        console.log('🎈 后方也开始生成气球');
    }

    STATE.spawnBatchTimer += dt;
    if (STATE.spawnBatchTimer >= SPAWN_BATCH_INTERVAL) {
        STATE.spawnBatchTimer -= SPAWN_BATCH_INTERVAL;
        const activeCount = balloons.filter(b => b.userData.active).length;
        const canSpawn = Math.min(SPAWN_BATCH_SIZE, SPAWN_MAX_ACTIVE - activeCount, STATE.waveSpawnRemaining);
        for (let i = 0; i < canSpawn; i++) {
            spawnOneBalloon();
            STATE.waveSpawnRemaining--;
            STATE.waveSpawned++;
        }
    }
}

export function updateBalloons(dt) {
    const playerPos = dolly.position.clone();
    playerPos.y += 1.6;

    // 气球-气球排斥
    for (let i = 0; i < balloons.length; i++) {
        const a = balloons[i];
        if (!a.userData.active) continue;
        for (let j = i + 1; j < balloons.length; j++) {
            const b = balloons[j];
            if (!b.userData.active) continue;
            const dx = a.position.x - b.position.x;
            const dz = a.position.z - b.position.z;
            const dy = a.position.y - b.position.y;
            const distSq = dx*dx + dy*dy + dz*dz;
            const minDist = a.userData.radius + b.userData.radius;
            if (distSq < minDist * minDist && distSq > 0.0001) {
                const dist = Math.sqrt(distSq);
                const overlap = minDist - dist;
                const pushX = (dx / dist) * overlap * BALLOON_REPEL_FORCE * dt;
                const pushY = (dy / dist) * overlap * BALLOON_REPEL_FORCE * dt * 0.3;
                const pushZ = (dz / dist) * overlap * BALLOON_REPEL_FORCE * dt;
                a.position.x += pushX; a.position.y += pushY; a.position.z += pushZ;
                b.position.x -= pushX; b.position.y -= pushY; b.position.z -= pushZ;
            }
        }
    }

    // 气球-船碰撞
    const shipCenter = STATE.shipModel ? STATE.shipModel.position.clone() : new THREE.Vector3(0, 1, 0);
    shipCenter.y += 1.0;
    for (let i = 0; i < balloons.length; i++) {
        const b = balloons[i];
        if (!b.userData.active) continue;
        const dx = b.position.x - shipCenter.x;
        const dy = b.position.y - shipCenter.y;
        const dz = b.position.z - shipCenter.z;
        const distSq = dx*dx + dy*dy + dz*dz;
        const minDist = b.userData.radius + SHIP_COLLISION_RADIUS;
        if (distSq < minDist * minDist && distSq > 0.0001) {
            const dist = Math.sqrt(distSq);
            const overlap = minDist - dist;
            const pushX = (dx / dist) * overlap * SHIP_REPEL_FORCE;
            const pushZ = (dz / dist) * overlap * SHIP_REPEL_FORCE;
            b.position.x += pushX;
            b.position.z += pushZ;
        }
    }

    for (let i = balloons.length - 1; i >= 0; i--) {
        const b = balloons[i];
        if (!b.userData.active) continue;

        const dir = new THREE.Vector3().subVectors(playerPos, b.position).normalize();
        b.position.x += dir.x * BALLOON_SPEED * dt;
        b.position.y += dir.y * BALLOON_SPEED * dt;
        b.position.z += dir.z * BALLOON_SPEED * dt;

        if (!b.userData.isKnight) {
            b.lookAt(playerPos);
            b.rotateY(-Math.PI / 2);
        } else {
            b.lookAt(playerPos);
            // 更新骑士血条
            if (b.userData.hpBarFill) {
                const ratio = Math.max(0, b.userData.hp / b.userData.maxHp);
                b.userData.hpBarFill.scale.x = ratio;
                // 颜色：绿→黄→红
                const color = ratio > 0.5 ? 0x44ff44 : ratio > 0.25 ? 0xffaa00 : 0xff3333;
                b.userData.hpBarFill.material.color.setHex(color);
            }
        }

        b.position.y += Math.sin(performance.now() * 0.003 + i) * 0.002;

        // 动态同步天空亮度到气球自发光强度
        if (!b.userData.isKnight && b.material.emissiveIntensity !== undefined) {
            const targetI = 0.15 + (1.0 - skyBrightness) * 0.6;
            b.material.emissiveIntensity += (targetI - b.material.emissiveIntensity) * 0.05;
        }

        const bx = Math.abs(b.position.x);
        const bz = Math.abs(b.position.z);
        if (bx <= BOUND_X && bz <= BOUND_Z) {
            b.userData.active = false;
            b.visible = false;
            STATE.shipHp -= BALLOON_DAMAGE;
            STATE.shipHitFlash = 0.3;
            const debrisColor = b.userData.isKnight ? 0x888888 : 0xff4444;
            spawnDebris(b.position.clone(), debrisColor, b.userData.isKnight ? 12 : 8);
            spawnParticles(b.position.clone(), 0xff4444, 15);
            playPop();
            console.log(`💥 气球撞船！船HP: ${STATE.shipHp}/${SHIP_MAX_HP}`);
            checkAllBalloonsDestroyed();
            if (STATE.shipHp <= 0) {
                STATE.shipHp = 0;
                gameOver();
            }
        }
    }
    // 安全兜底：波次完成后自动推进（仅游戏进行中且无过渡计时器时）
    if (STATE.gameStarted && STATE.nextWaveTimer === 0) {
        checkAllBalloonsDestroyed();
    }
}

export function checkBulletBalloonCollisions() {
    for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        for (let j = balloons.length - 1; j >= 0; j--) {
            const balloon = balloons[j];
            if (!balloon.userData.active) continue;
            const hitRadius = balloon.userData.radius || BALLOON_RADIUS;
            const dist = bullet.position.distanceTo(balloon.position);
            if (dist < hitRadius + 0.05) {
                balloon.userData.hp -= STATE.playerStats.atk;
                if (!balloon.userData.isKnight && balloon.material.emissiveIntensity !== undefined) {
                    balloon.material.emissiveIntensity = 0.5;
                    setTimeout(() => {
                        if (balloon.userData) {
                            balloon.material.emissiveIntensity = 0.15 + (1.0 - skyBrightness) * 0.6;
                        }
                    }, 100);
                }
                if (balloon.userData.hp <= 0) {
                    balloon.userData.active = false;
                    if (balloon.userData.isKnight) {
                        balloon.traverse(c => { if (c.isMesh) c.visible = false; });
                        STATE.playerStats.score += KNIGHT_SCORE;
                        STATE.playerStats.gold += KNIGHT_SCORE;
                    } else {
                        balloon.visible = false;
                        STATE.playerStats.score += BALLOON_SCORE;
                        STATE.playerStats.gold += BALLOON_SCORE;
                    }
                    const debrisColor = balloon.userData.isKnight ? 0x888888 : (balloon.material.color ? balloon.material.color.getHex() : 0xff4444);
                    spawnDebris(balloon.position.clone(), debrisColor, balloon.userData.isKnight ? 12 : 8);
                    spawnParticles(balloon.position.clone(), debrisColor, 20);
                    playPop();
                }
                bullet.userData.active = false;
                bullet.visible = false;
                bullets.splice(i, 1);
                checkAllBalloonsDestroyed();
                break;
            }
        }
    }
}

export function checkAllBalloonsDestroyed() {
    const activeBalloons = balloons.filter(b => b.userData.active);
    if (activeBalloons.length === 0 && STATE.waveSpawnRemaining <= 0 && !STATE.choiceCardsActive) {
        // 触发云朵转场
        if (!STATE.transitionCloudActive) {
            startCloudTransition();
        }
        const lvlType = getLevelType(STATE.waveNumber);
        if (lvlType === 'final') {
            window.__log('🎉 恭喜通关！游戏胜利', 's');
            return;
        }
        spawnChoiceCards(false, lvlType);
    }
}

// ===================== 云朵转场系统 =====================
// 5朵云：4个角 + 正前方15m，打完一关后向玩家后方移动（转场效果）

export function initTransitionClouds() {
    if (STATE.transitionCloudGroup) {
        scene.remove(STATE.transitionCloudGroup);
        STATE.transitionCloudGroup.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); });
    }
    const group = new THREE.Group();
    TRANSITION_CLOUD_POSITIONS.forEach((pos, i) => {
        const cloud = createCloud(pos[0], TRANSITION_CLOUD_Y, pos[1], TRANSITION_CLOUD_SCALE);
        cloud.userData.transitionIdx = i;
        cloud.userData.targetZ = pos[1]; // 目标Z位置
        group.add(cloud);
    });
    scene.add(group);
    STATE.transitionCloudGroup = group;
    STATE.transitionCloudActive = false;
    STATE.transitionCloudPhase = 0;
    window.__log('☁️ 转场云朵初始化完成', 's');
}

export function startCloudTransition() {
    if (!STATE.transitionCloudGroup) return;
    STATE.transitionCloudActive = true;
    STATE.transitionCloudPhase = 1; // 移出阶段
    // 记录每个云的起始Z位置（当前Z）
    STATE.transitionCloudGroup.children.forEach(cloud => {
        cloud.userData.startZ = cloud.position.z;
        cloud.userData.phase = 'out';
    });
    // 记录静态装饰云的起始位置，用于转场移动
    clouds.forEach((cloud, i) => {
        if (!cloud.userData.origPos) {
            cloud.userData.origPos = cloud.position.clone();
        }
    });
    window.__log('☁️ 云朵转场开始（含' + clouds.length + '朵装饰云）', 's');
}

export function updateTransitionClouds(dt) {
    if (!STATE.transitionCloudActive || !STATE.transitionCloudGroup) return;
    const children = STATE.transitionCloudGroup.children;
    let allDone = true;

    if (STATE.transitionCloudPhase === 1) {
        // 移出阶段：所有云向 +Z 方向移动
        children.forEach(cloud => {
            cloud.position.z += TRANSITION_SPEED * dt;
            cloud.position.x += Math.sin(performance.now() * 0.001 + cloud.userData.transitionIdx) * 0.3 * dt; // 轻微横漂
            if (cloud.position.z < TRANSITION_DISAPPEAR_Z) allDone = false;
        });
        // 静态装饰云同步向 +Z 移动
        clouds.forEach(cloud => {
            cloud.position.z += TRANSITION_SPEED * dt * 1.2; // 稍快一点，增强流动感
        });
        if (allDone) {
            STATE.transitionCloudPhase = 2; // 进入移入阶段
            // 重置转场云位置到远处
            children.forEach(cloud => {
                const pos = TRANSITION_CLOUD_POSITIONS[cloud.userData.transitionIdx];
                cloud.position.set(pos[0], TRANSITION_CLOUD_Y, TRANSITION_SPAWN_Z);
            });
            // 重置静态装饰云到原始位置
            clouds.forEach(cloud => {
                if (cloud.userData.origPos) {
                    cloud.position.copy(cloud.userData.origPos);
                }
            });
            window.__log('☁️ 新云朵移入中', 's');
        }
    }

    if (STATE.transitionCloudPhase === 2) {
        // 移入阶段：云朵从远处移到目标位置
        allDone = true;
        children.forEach(cloud => {
            const targetZ = cloud.userData.targetZ;
            const diff = targetZ - cloud.position.z;
            if (Math.abs(diff) > 0.3) {
                cloud.position.z += Math.sign(diff) * TRANSITION_SPEED * dt;
                cloud.position.x += Math.sin(performance.now() * 0.0012 + cloud.userData.transitionIdx * 2) * 0.2 * dt;
                allDone = false;
            } else {
                cloud.position.z = targetZ;
            }
        });
        if (allDone) {
            STATE.transitionCloudActive = false;
            STATE.transitionCloudPhase = 0;
            window.__log('☁️ 云朵转场完成', 's');
        }
    }
}

// ===================== 抽卡系统（稀有度版） =====================
// 普通关稀有度（带概率权重）
const RARITIES = [
    { name: '普通', color: '#ffffff', bgColor: [60,60,60], value: 10, weight: 40 },
    { name: '稀有', color: '#4da6ff', bgColor: [30,80,160], value: 20, weight: 30 },
    { name: '史诗', color: '#b388ff', bgColor: [80,40,160], value: 50, weight: 20 },
    { name: '传说', color: '#ffd700', bgColor: [160,120,0], value: 100, weight: 10 },
];
// Boss关稀有度（追加红色 = 传说2倍）
const RARITIES_BOSS = [
    ...RARITIES,
    { name: '红色', color: '#ff2222', bgColor: [160,30,30], value: 200, weight: 5 },
];

// 按权重随机选择稀有度
function pickRarityByWeight(rarities) {
    const total = rarities.reduce((s, r) => s + r.weight, 0);
    let roll = Math.random() * total;
    for (const r of rarities) {
        roll -= r.weight;
        if (roll <= 0) return r;
    }
    return rarities[rarities.length - 1];
}

// 关卡类型判定
function getLevelType(waveNumber) {
    if (waveNumber === 18) return 'final';   // 通关
    if (waveNumber === 6 || waveNumber === 12) return 'boss';
    if (waveNumber === 2) return 'mech';     // 激光关
    return 'normal';
}

const ATTR_TYPES = [
    { id: 'atk', label: '攻击力', icon: '⚔️', apply: (v) => { STATE.playerStats.atk += v; }, formatValue: (v) => `+${v}` },
    { id: 'hp', label: '生命值', icon: '❤️', apply: (v) => { STATE.shipHp = Math.min(SHIP_MAX_HP, STATE.shipHp + v); }, formatValue: (v) => `+${v}` },
    { id: 'fireRate', label: '射速', icon: '🎯', apply: (v) => { STATE.fireRate += v/100; }, formatValue: (v) => `+${(v/100).toFixed(1)}x` },
    { id: 'multiShot', label: '多重射击', icon: '🔫', apply: (v) => { STATE.multiShotChance += v; }, formatValue: (v) => `+${v}%` },
];

function createChoiceCard(chosenAttr, rarity, index) {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const bg = rarity.bgColor;
    ctx.fillStyle = `rgba(${bg[0]},${bg[1]},${bg[2]},0.92)`;
    roundRect(ctx, 0, 0, 512, 256, 32);
    ctx.fill();
    ctx.strokeStyle = rarity.color; ctx.lineWidth = 8;
    roundRect(ctx, 4, 4, 504, 248, 28);
    ctx.stroke();

    ctx.fillStyle = rarity.color;
    ctx.font = 'bold 52px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(chosenAttr.icon + ' ' + chosenAttr.label, 256, 80);

    ctx.font = 'bold 68px monospace';
    ctx.fillText(chosenAttr.formatValue(rarity.value), 256, 165);

    ctx.font = '24px sans-serif';
    ctx.fillText(rarity.name, 256, 210);

    const texture = new THREE.CanvasTexture(canvas);
    const geom = new THREE.PlaneGeometry(CHOICE_CARD_WIDTH, CHOICE_CARD_HEIGHT);
    const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide });
    const card = new THREE.Mesh(geom, mat);
    card.userData = { isChoiceCard: true, chosenAttr, rarity, index, canvas, ctx, texture };
    return card;
}

function createRefreshCard() {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 160;
    const ctx = canvas.getContext('2d');
    const fee = 10 * Math.pow(2, STATE.choiceRefreshCount);
    const onCooldown = STATE.choiceRefreshCooldown > 0;
    ctx.fillStyle = onCooldown ? 'rgba(60,60,60,0.9)' : 'rgba(30,120,60,0.9)';
    roundRect(ctx, 0, 0, 512, 160, 24);
    ctx.fill();
    ctx.strokeStyle = onCooldown ? '#666' : '#44dd88'; ctx.lineWidth = 5;
    roundRect(ctx, 3, 3, 506, 154, 21);
    ctx.stroke();

    ctx.fillStyle = onCooldown ? '#888' : '#ffffff';
    ctx.textAlign = 'center';
    if (onCooldown) {
        ctx.font = 'bold 40px monospace';
        ctx.fillText('⏳ 冷却中', 256, 80);
    } else {
        ctx.font = 'bold 44px monospace';
        ctx.fillText('🔄 刷新', 256, 70);
        ctx.font = '28px sans-serif';
        ctx.fillStyle = '#ffd700';
        ctx.fillText('费用: ' + fee + '金币', 256, 120);
    }

    const texture = new THREE.CanvasTexture(canvas);
    const geom = new THREE.PlaneGeometry(CHOICE_CARD_WIDTH, CHOICE_REFRESH_HEIGHT);
    const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide });
    const card = new THREE.Mesh(geom, mat);
    card.userData = { isRefreshCard: true, canvas, ctx, texture, mat };
    return card;
}

export function updateRefreshCardTexture() {
    for (let i = 0; i < choiceCardGroup.children.length; i++) {
        const card = choiceCardGroup.children[i];
        if (!card.userData.isRefreshCard) continue;
        const { canvas, ctx, texture, mat } = card.userData;
        if (!ctx) return;
        const fee = 10 * Math.pow(2, STATE.choiceRefreshCount);
        const onCooldown = STATE.choiceRefreshCooldown > 0;
        ctx.clearRect(0, 0, 512, 160);
        ctx.fillStyle = onCooldown ? 'rgba(60,60,60,0.9)' : 'rgba(30,120,60,0.9)';
        roundRect(ctx, 0, 0, 512, 160, 24);
        ctx.fill();
        ctx.strokeStyle = onCooldown ? '#666' : '#44dd88'; ctx.lineWidth = 5;
        roundRect(ctx, 3, 3, 506, 154, 21);
        ctx.stroke();
        ctx.fillStyle = onCooldown ? '#888' : '#ffffff';
        ctx.textAlign = 'center';
        if (onCooldown) {
            const remainSec = Math.max(0, STATE.choiceRefreshCooldown).toFixed(1);
            ctx.font = 'bold 36px monospace';
            ctx.fillText('⏳ 冷却 ' + remainSec + 's', 256, 80);
        } else {
            ctx.font = 'bold 44px monospace';
            ctx.fillText('🔄 刷新', 256, 70);
            ctx.font = '28px sans-serif';
            ctx.fillStyle = '#ffd700';
            ctx.fillText('费用: ' + fee + '金币', 256, 120);
        }
        texture.needsUpdate = true;
        break;
    }
}

function generateRandomChoices(forceLegendary, levelType) {
    // 随机选3个不同的属性
    const shuffled = [...ATTR_TYPES].sort(() => Math.random() - 0.5);
    const choices = [];
    for (let i = 0; i < 3; i++) {
        let rarity;
        if (forceLegendary) {
            rarity = RARITIES[3]; // 传说
        } else if (levelType === 'boss') {
            rarity = pickRarityByWeight(RARITIES_BOSS);
        } else {
            rarity = pickRarityByWeight(RARITIES);
        }
        choices.push({ attr: shuffled[i], rarity });
    }
    return choices;
}

export function spawnChoiceCards(forceLegendary, levelType) {
    if (STATE.choiceCardsActive) return;
    STATE.choiceCardsActive = true;
    // choiceRefreshCount 和 choiceRefreshCooldown 不在此重置，由外部调用方或 clearChoiceCards 控制
    STATE.selectedCardIndex = -1;
    STATE.cardHighlightTime = 0;

    // 清除旧卡片
    while (choiceCardGroup.children.length > 0) {
        const child = choiceCardGroup.children[0];
        if (child.material && child.material.map) child.material.map.dispose();
        if (child.material) child.material.dispose();
        if (child.geometry) child.geometry.dispose();
        choiceCardGroup.remove(child);
    }

    // 记录出生点基准（固定位置，不随头显旋转）
    const spawnAnchor = dolly.position.clone();
    STATE.choiceCardBase = {
        pos: spawnAnchor.clone(),
        forward: new THREE.Vector3(0, 0, -1), // 固定朝-Z（出生点正前方）
        right: new THREE.Vector3(1, 0, 0),
    };
    const base = STATE.choiceCardBase;
    const cardY = spawnAnchor.y + 1.6 + CHOICE_CARD_Y_OFFSET; // 眼高+偏移

    // 记录选择卡期间的活动限制（出生点往后1米）
    STATE.choiceCardSpawnZ = spawnAnchor.z;

    // faceTarget 用相机位置（卡片始终面向玩家）
    const faceTarget = camera.position.clone();

    // 3张属性卡
    const choices = generateRandomChoices(forceLegendary);
    for (let i = 0; i < 3; i++) {
        const card = createChoiceCard(choices[i].attr, choices[i].rarity, i);
        const offsetX = (i - 1) * CHOICE_CARD_SPACING;
        // 记录局部偏移，每帧用当前相机重算世界坐标
        card.userData.cardOffset = { offsetX, offsetY: 0, offsetZ: CHOICE_CARD_DISTANCE };
        _repositionCard(card, base, cardY);
        card.lookAt(faceTarget);
        choiceCardGroup.add(card);
    }

    // 刷新卡（在属性卡下方）
    const refreshCard = createRefreshCard();
    refreshCard.userData.cardOffset = { offsetX: 0, offsetY: CHOICE_REFRESH_OFFSET_Y, offsetZ: CHOICE_CARD_DISTANCE };
    _repositionCard(refreshCard, base, cardY);
    refreshCard.lookAt(faceTarget);
    choiceCardGroup.add(refreshCard);

    window.__log('🎴 随机抽卡已生成（跟随头显）', 's');
    if (STATE.choiceCardTimeout) clearTimeout(STATE.choiceCardTimeout);
    STATE.choiceCardTimeout = setTimeout(() => {
        if (STATE.choiceCardsActive) {
            window.__log('⏱️ 选择卡超时', 'w');
            clearChoiceCards();
        }
    }, 15000);
}

// 根据相机基准+局部偏移计算卡片世界坐标
function _repositionCard(card, base, camY) {
    const o = card.userData.cardOffset;
    if (!o) return;
    const worldX = base.pos.x + base.forward.x * o.offsetZ + base.right.x * o.offsetX;
    const worldZ = base.pos.z + base.forward.z * o.offsetZ + base.right.z * o.offsetX;
    card.position.set(worldX, camY + o.offsetY, worldZ);
}

const _raycaster = new THREE.Raycaster();

export function updateChoiceCards(dt) {
    if (!STATE.choiceCardsActive || choiceCardGroup.children.length === 0) return;
    // 使用固定锚点（出生点），不随头显旋转
    const base = STATE.choiceCardBase;
    if (!base) return;
    // 不更新 base.pos/forward/right — 卡位固定
    const cardY = base.pos.y + 1.6 + CHOICE_CARD_Y_OFFSET;
    const faceTarget = camera.position.clone();

    // ---- 射线检测：左手球指向哪张卡片 ----
    let hitCardIndex = -1;
    if (STATE.leftRaySphere && STATE.leftController) {
        const rayOrigin = new THREE.Vector3();
        STATE.leftRaySphere.getWorldPosition(rayOrigin);
        const ctrlQuat = STATE.leftController.getWorldQuaternion(new THREE.Quaternion());
        // 与子弹相同的俯仰角
        const pitchQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(RAY_PITCH_ANGLE * Math.PI / 180, 0, 0));
        const finalQuat = ctrlQuat.clone().multiply(pitchQuat);
        const rayDir = new THREE.Vector3(0, 0, -1).applyQuaternion(finalQuat);
        _raycaster.set(rayOrigin, rayDir.normalize());
        _raycaster.far = RAY_CAST_DISTANCE;
        const hits = _raycaster.intersectObjects(choiceCardGroup.children, false);
        if (hits.length > 0) {
            hitCardIndex = choiceCardGroup.children.indexOf(hits[0].object);
        }
    }
    STATE.highlightedCardIndex = hitCardIndex;

    // ---- 更新每张卡片的位置 + 高亮动画 ----
    choiceCardGroup.children.forEach((card, idx) => {
        _repositionCard(card, base, cardY);

        // 高亮处理：被射线指向的卡片向玩家靠近并放大（属性卡+刷新卡）
        const isHighlighted = (idx === hitCardIndex && (card.userData.isChoiceCard || card.userData.isRefreshCard));
        const targetScale = isHighlighted ? CHOICE_HIGHLIGHT_SCALE : 1.0;
        // 平滑插值缩放
        const curScale = card.scale.x;
        const newScale = curScale + (targetScale - curScale) * Math.min(1, dt * CHOICE_HIGHLIGHT_LERP);
        card.scale.setScalar(newScale);

        if (isHighlighted) {
            // 向玩家方向移近
            card.position.x -= base.forward.x * CHOICE_HIGHLIGHT_PULL;
            card.position.z -= base.forward.z * CHOICE_HIGHLIGHT_PULL;
        }
    });
}

export function clearChoiceCards() {
    STATE.choiceCardsActive = false;
    STATE.choiceRefreshCount = 0;
    STATE.choiceRefreshCooldown = 0;
    if (STATE.choiceCardTimeout) { clearTimeout(STATE.choiceCardTimeout); STATE.choiceCardTimeout = null; }
    while (choiceCardGroup.children.length > 0) {
        const child = choiceCardGroup.children[0];
        if (child.material && child.material.map) child.material.map.dispose();
        child.material.dispose();
        child.geometry.dispose();
        choiceCardGroup.remove(child);
    }
    // 用游戏循环计时替代 setTimeout（更可靠）
    STATE.nextWaveTimer = 1.0;
    window.__log('⏱️ 下一波将在1秒后开始', 'i');
}

export function checkLeftHandChoiceCardCollision() {
    if (!STATE.choiceCardsActive || !STATE.leftController) return;
    // 扳机上升沿检测（只在按下瞬间触发一次）
    const triggerRising = STATE.leftTrigger && !STATE.prevLeftTrigger;
    STATE.prevLeftTrigger = STATE.leftTrigger;
    if (!triggerRising) return;
    const idx = STATE.highlightedCardIndex;
    if (idx < 0 || idx >= choiceCardGroup.children.length) return;
    const card = choiceCardGroup.children[idx];

    if (card.userData.isRefreshCard) {
        // 触碰刷新卡
        if (STATE.choiceRefreshCooldown > 0) return;
        const fee = 10 * Math.pow(2, STATE.choiceRefreshCount);
        if (STATE.playerStats.gold < fee) {
            window.__log('💰 金币不足，刷新需 ' + fee + ' 金币', 'w');
            return;
        }
        STATE.playerStats.gold -= fee;
        STATE.choiceRefreshCount++;
        STATE.choiceRefreshCooldown = 2; // 2秒冷却
        window.__log('🔄 刷新 (费用:' + fee + ', 下次:' + (10*Math.pow(2, STATE.choiceRefreshCount)) + ')', 's');
        // 重新生成卡片（复用 spawnChoiceCards 的偏移系统）
        STATE.choiceCardsActive = false;
        spawnChoiceCards(false, getLevelType(STATE.waveNumber));
        return;
    }
    if (card.userData.isChoiceCard) {
        // 触碰属性卡
        const c = card.userData;
        c.chosenAttr.apply(c.rarity.value);
        window.__log('✅ 选择: ' + c.chosenAttr.label + ' ' + c.chosenAttr.formatValue(c.rarity.value) + ' (' + c.rarity.name + ')', 's');
        clearChoiceCards();
        return;
    }
}

// ===================== 死亡与重开 =====================
export function gameOver() {
    if (STATE.gameOverState) return;
    STATE.gameOverState = true;
    console.log('💀 气球船被摧毁！即将重开当前关卡...');
    balloons.forEach(b => {
        b.userData.active = false;
        b.visible = false;
        if (b.userData.isKnight) b.traverse(c => { if (c.isMesh) c.visible = false; });
    });
    setTimeout(() => restartLevel(), 1500);
}

export function restartLevel() {
    console.log('🔄 重开第' + STATE.waveNumber + '波，船血恢复满');
    STATE.shipHp = SHIP_MAX_HP;
    STATE.shipHitFlash = 0;
    STATE.gameOverState = false;
    balloons.forEach(b => disposeBalloon(b));
    balloons.length = 0;
    STATE.waveSpawnRemaining = 0;
    STATE.waveSpawned = 0;
    STATE.wavePhaseTimer = 0;
    STATE.wavePhase = 0;
    STATE.spawnBatchTimer = 0;
    setTimeout(() => {
        spawnChoiceCards(false, getLevelType(STATE.waveNumber));
        console.log('🎁 死亡补偿：赠送一次抽卡机会');
    }, 500);
}

// ===================== 特效系统 =====================
// 粒子
const particlePool = [];
export function initParticlePool() {
    for (let i = 0; i < PARTICLE_COUNT; i++) {
        const geom = new THREE.SphereGeometry(0.01, 4, 4);
        const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1.0 });
        const mesh = new THREE.Mesh(geom, mat);
        mesh.userData = { active: false, vel: new THREE.Vector3(), life: 0 };
        mesh.visible = false;
        particleGroup.add(mesh);
        particlePool.push(mesh);
    }
    if (window.__log) window.__log('粒子池初始化 (' + PARTICLE_COUNT + ' 个)', 's');
}
initParticlePool();

export function spawnParticles(position, color, count = 30) {
    for (let i = 0; i < count; i++) {
        const p = particlePool.find(p => !p.userData.active);
        if (!p) break;
        p.position.copy(position);
        p.userData.active = true;
        p.userData.life = PARTICLE_LIFE;
        p.userData.vel.set((Math.random()-0.5)*2, (Math.random()-0.5)*2, (Math.random()-0.5)*2);
        p.material.color.setHex(color);
        p.material.opacity = 1.0;
        p.visible = true;
    }
}

export function updateParticles(dt) {
    for (let i = 0; i < particlePool.length; i++) {
        const p = particlePool[i];
        if (!p.userData.active) continue;
        p.position.addScaledVector(p.userData.vel, dt);
        p.userData.vel.multiplyScalar(0.98);
        p.userData.life -= dt;
        p.material.opacity = Math.max(0, p.userData.life / PARTICLE_LIFE);
        if (p.userData.life <= 0) { p.userData.active = false; p.visible = false; }
    }
}

// 碎片
const debrisPool = [];
export function initDebrisPool() {
    const geom = new THREE.TetrahedronGeometry(0.04, 0);
    for (let i = 0; i < DEBRIS_COUNT; i++) {
        const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1.0, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(geom, mat);
        mesh.userData = { active: false, vel: new THREE.Vector3(), rotVel: new THREE.Vector3(), life: 0 };
        mesh.visible = false;
        debrisGroup.add(mesh);
        debrisPool.push(mesh);
    }
    if (window.__log) window.__log('碎片池初始化 (' + DEBRIS_COUNT + ' 个)', 's');
}
initDebrisPool();

export function spawnDebris(position, color, count = 8) {
    for (let i = 0; i < count; i++) {
        const d = debrisPool.find(d => !d.userData.active);
        if (!d) break;
        d.position.copy(position);
        const angle = Math.random() * Math.PI * 2;
        const speed = 1.5 + Math.random() * 2.5;
        const upBias = Math.random() * 1.5;
        d.userData.vel.set(Math.cos(angle)*speed, upBias+Math.random()*2, Math.sin(angle)*speed);
        d.userData.rotVel.set((Math.random()-0.5)*10, (Math.random()-0.5)*10, (Math.random()-0.5)*10);
        d.userData.active = true;
        d.userData.life = DEBRIS_LIFE;
        d.material.color.setHex(color);
        d.material.opacity = 1.0;
        d.visible = true;
    }
}

export function updateDebris(dt) {
    for (let i = 0; i < debrisPool.length; i++) {
        const d = debrisPool[i];
        if (!d.userData.active) continue;
        d.position.addScaledVector(d.userData.vel, dt);
        d.userData.vel.y -= 4.0 * dt;
        d.userData.vel.multiplyScalar(0.98);
        d.rotation.x += d.userData.rotVel.x * dt;
        d.rotation.y += d.userData.rotVel.y * dt;
        d.rotation.z += d.userData.rotVel.z * dt;
        d.userData.life -= dt;
        d.material.opacity = Math.max(0, d.userData.life / DEBRIS_LIFE);
        if (d.userData.life <= 0 || d.position.y < -2) { d.userData.active = false; d.visible = false; }
    }
}

// ===================== 刷新冷却管理 =====================
export function updateCooldowns(dt) {
    const prevCd = STATE.choiceRefreshCooldown;
    if (STATE.choiceRefreshCooldown > 0) {
        STATE.choiceRefreshCooldown -= dt;
        if (STATE.choiceCardsActive) updateRefreshCardTexture();
    }
    // 冷却结束瞬间刷新贴图（显示"刷新"而非"冷却0s"）
    if (prevCd > 0 && STATE.choiceRefreshCooldown <= 0 && STATE.choiceCardsActive) {
        updateRefreshCardTexture();
    }
    // 波次过渡倒计时
    if (STATE.nextWaveTimer > 0) {
        STATE.nextWaveTimer -= dt;
        if (STATE.nextWaveTimer <= 0) {
            STATE.nextWaveTimer = 0;
            STATE.waveNumber++;
            // 神掌解锁（必须放在激光触发之前，避免选关2时被截胡）
            if (STATE.waveNumber >= 1 && !STATE.buddhaPalmReady) {
                attachBuddhaPalmToLeft();
            }
            // 波次1清空后（waveNumber === 2）→ 进入激光关卡（跳过波次2射击）
            if (STATE.waveNumber === 2) {
                STATE.gameMode = 'laser';
                window.__log('🎆 进入激光关卡！', 's');
                balloons.forEach(b => disposeBalloon(b));
                balloons.length = 0;
                return;
            }
            // Boss关：生成2个骑士气球
            if (getLevelType(STATE.waveNumber) === 'boss') {
                window.__log('👑 第' + STATE.waveNumber + '波：Boss关！2个骑士气球', 's');
                const knight1 = createKnightBalloon(-1.5, 2, -4);
                const knight2 = createKnightBalloon(1.5, 2, -4);
                // 不设波次生成定时器
                // 击破后由 checkAllBalloonsDestroyed 处理抽卡
            } else {
                spawnBalloons();
                window.__log('🎈 第' + STATE.waveNumber + '波气球已生成', 's');
            }
        }
    }
}

export function checkVRSkySwitch() {
    if (STATE.leftBtnState.btnX && !STATE.prevLeftX) cycleSky(1);
    if (STATE.leftBtnState.btnY && !STATE.prevLeftY) cycleSky(-1);
    STATE.prevLeftX = STATE.leftBtnState.btnX;
    STATE.prevLeftY = STATE.leftBtnState.btnY;
}

function cycleSky(direction = 1) {
    const idx = skyCycle.indexOf(STATE.skyTarget);
    const next = skyCycle[(idx + direction + 3) % 3];
    applySkyTarget(next);
}

// roundRect 在 core 中，但 createChoiceCard 需要异步 import，这里改用内联
function roundRect(ctx, x, y, w, h, r) {
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

// ===================== 如来神掌系统 =====================
export function attachBuddhaPalmToLeft() {
    if (!STATE.buddhaPalmModel || !STATE.leftGrip || STATE.buddhaPalmReady) return;
    const palm = STATE.buddhaPalmModel.clone();
    palm.scale.setScalar(BUDDHA_HAND_SCALE);
    palm.position.set(BUDDHA_HAND_POS[0], BUDDHA_HAND_POS[1], BUDDHA_HAND_POS[2]);
    palm.rotation.x = BUDDHA_HAND_ROT_X;
    palm.visible = true;
    STATE.leftGrip.add(palm);
    STATE.buddhaPalmReady = true;
    STATE.buddhaPalmState = 'IDLE';
    STATE.buddhaPalmCooldown = 0;
    window.__log('🖐️ 如来神掌已装备到左手', 's');
}

export function updateBuddhaPalm(dt) {
    if (!STATE.buddhaPalmReady) return;

    // 冷却倒计时
    if (STATE.buddhaPalmCooldown > 0) {
        STATE.buddhaPalmCooldown -= dt;
        if (STATE.buddhaPalmCooldown < 0) STATE.buddhaPalmCooldown = 0;
    }

    const gripNow = STATE.leftBtnState.grip;
    const gripRising = gripNow && !STATE.buddhaPrevGrip;
    STATE.buddhaPrevGrip = gripNow;

    if (STATE.buddhaPalmState === 'IDLE') {
        if (gripRising && STATE.buddhaPalmCooldown <= 0) {
            // 直接释放，无预览无倒计时
            releaseBuddhaPalm();
        }
    }

    // 更新飞行中的神掌
    for (let i = STATE.buddhaPalmActiveList.length - 1; i >= 0; i--) {
        const palmData = STATE.buddhaPalmActiveList[i];
        palmData.timer += dt;

        if (palmData.phase === 'falling') {
            const t = Math.min(palmData.timer / BUDDHA_FALL_DURATION, 1);
            palmData.mesh.position.y = palmData.startY + (palmData.targetY - palmData.startY) * t;
            // 放大效果
            const scale = BUDDHA_FALL_START_SCALE + (BUDDHA_FALL_END_SCALE - BUDDHA_FALL_START_SCALE) * t;
            palmData.mesh.scale.setScalar(scale);

            if (t >= 1) {
                // 落地！
                palmData.phase = 'impact';
                palmData.timer = 0;
                // 碰撞检测：半径内气球扣1000 HP
                const palmPos = palmData.mesh.position.clone();
                let killed = 0;
                for (let j = balloons.length - 1; j >= 0; j--) {
                    const b = balloons[j];
                    if (!b.userData.active) continue;
                    if (b.position.distanceTo(palmPos) < BUDDHA_KILL_RADIUS) {
                        b.userData.hp -= BUDDHA_DAMAGE;
                        if (b.userData.hp <= 0) {
                            b.userData.active = false;
                            if (b.userData.isKnight) {
                                b.traverse(c => { if (c.isMesh) c.visible = false; });
                                STATE.playerStats.score += KNIGHT_SCORE;
                                STATE.playerStats.gold += KNIGHT_SCORE;
                            } else {
                                b.visible = false;
                                STATE.playerStats.score += BALLOON_SCORE;
                                STATE.playerStats.gold += BALLOON_SCORE;
                            }
                            const debrisColor = b.userData.isKnight ? 0x888888 : (b.material.color ? b.material.color.getHex() : 0xff4444);
                            spawnDebris(b.position.clone(), debrisColor, b.userData.isKnight ? 12 : 8);
                            spawnParticles(b.position.clone(), debrisColor, 20);
                            playPop();
                            killed++;
                        }
                    }
                }
                window.__log('🖐️ 如来神掌命中！击杀 ' + killed + ' 个气球', 's');
                // 金色粒子爆炸
                spawnParticles(palmPos, 0xffd700, BUDDHA_PARTICLE_COUNT);
            }
        } else if (palmData.phase === 'impact') {
            // 延迟后清理
            if (palmData.timer > BUDDHA_IMPACT_CLEANUP) {
                palmData.mesh.traverse(c => {
                    if (c.geometry) c.geometry.dispose();
                    if (c.material) {
                        if (Array.isArray(c.material)) c.material.forEach(m => m.dispose());
                        else c.material.dispose();
                    }
                });
                buddhaPalmGroup.remove(palmData.mesh);
                STATE.buddhaPalmActiveList.splice(i, 1);
            }
        }
    }
}

function releaseBuddhaPalm() {
    STATE.buddhaPalmState = 'IDLE';
    STATE.buddhaPalmCooldown = BUDDHA_COOLDOWN;
    window.__log('🖐️ 如来神掌释放！', 's');

    if (!STATE.buddhaPalmModel) return;

    // 创建飞行神掌
    const palm = STATE.buddhaPalmModel.clone();
    palm.rotation.x = BUDDHA_HAND_ROT_X;  // 平放角度
    const camPos = camera.position.clone();
    camera.getWorldPosition(camPos);
    const aimDir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    aimDir.y = 0;
    if (aimDir.lengthSq() < 0.001) aimDir.set(0, 0, -1);
    aimDir.normalize();
    STATE.buddhaAimDirection.copy(aimDir);
    const startPos = camPos.clone().addScaledVector(aimDir, BUDDHA_FALL_FORWARD);
    startPos.y += BUDDHA_FALL_HEIGHT;
    const targetPos = camPos.clone().addScaledVector(aimDir, BUDDHA_FALL_FORWARD);
    targetPos.y = camPos.y;

    palm.position.copy(startPos);
    palm.scale.setScalar(BUDDHA_FALL_START_SCALE);
    palm.visible = true;
    palm.traverse(c => { if (c.isMesh) c.castShadow = false; });
    buddhaPalmGroup.add(palm);

    STATE.buddhaPalmActiveList.push({
        mesh: palm,
        timer: 0,
        phase: 'falling',
        startY: startPos.y,
        targetY: targetPos.y
    });
}

export function resetBuddhaPalm() {
    // 清除所有飞行中的神掌
    for (let i = STATE.buddhaPalmActiveList.length - 1; i >= 0; i--) {
        const palmData = STATE.buddhaPalmActiveList[i];
        palmData.mesh.traverse(c => {
            if (c.geometry) c.geometry.dispose();
            if (c.material) {
                if (Array.isArray(c.material)) c.material.forEach(m => m.dispose());
                else c.material.dispose();
            }
        });
        buddhaPalmGroup.remove(palmData.mesh);
    }
    STATE.buddhaPalmActiveList.length = 0;
    STATE.buddhaPalmState = 'IDLE';
    STATE.buddhaPalmCooldown = 0;
    STATE.buddhaPrevGrip = false;
}

// ===================== 聚合导出 =====================
// 聚合导出（避免 PICO 4 浏览器 import * as 兼容性问题）
export const GameAPI = {
    setAudio, setVR,
    updateCooldowns, updateBullets, updateBalloons, updateWaveSpawning,
    updateChoiceCards,
    checkBulletBalloonCollisions, checkLeftHandChoiceCardCollision,
    updateDebris, updateParticles, checkVRSkySwitch,
    spawnBalloons, restartLevel, gameOver,
    updateBuddhaPalm, attachBuddhaPalmToLeft, resetBuddhaPalm,
    initTransitionClouds, updateTransitionClouds, startCloudTransition,
    balloons, bullets
};
