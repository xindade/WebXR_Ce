import * as THREE from '../three.module.js';

// 音频模块注入（避免循环依赖，由 index.html 在初始化时设置）
let audioModule = null;
export function setAudio(m) { audioModule = m; }
function playPop() { if (audioModule) audioModule.playBalloonPopSound(); }

// VR 模块注入（避免循环依赖）
let vrModule = null;
export function setVR(m) { vrModule = m; }

import {
    scene, dolly, camera, bulletGroup, balloonGroup, particleGroup, debrisGroup, choiceCardGroup,
    STATE, BULLET_SPEED, BULLET_LIFE, BULLET_POOL_SIZE,
    BALLOON_SPEED, BALLOON_HP, BALLOON_SCORE, BALLOON_RADIUS, BALLOON_COLORS,
    KNIGHT_HP, KNIGHT_SCORE, KNIGHT_SCALE, KNIGHT_RADIUS,
    WAVE_BASE_SPAWN_COUNT, SPAWN_BATCH_INTERVAL, SPAWN_BATCH_SIZE, SPAWN_MAX_ACTIVE, SPAWN_DISTANCE, SPAWN_SPREAD,
    SHIP_MAX_HP, SHIP_COLLISION_RADIUS, BALLOON_REPEL_FORCE, SHIP_REPEL_FORCE, BALLOON_DAMAGE,
    CHOICE_CARD_DISTANCE,
    BUDDHA_COOLDOWN, AIM_TIMEOUT,
    DEBRIS_COUNT, DEBRIS_LIFE, PARTICLE_COUNT, PARTICLE_LIFE,
    BOUND_X, BOUND_Z, balloonTex,
    applySkyTarget, skyCycle
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
    const mat = new THREE.MeshStandardMaterial({
        map: balloonTex.image ? balloonTex : null,
        color, roughness: 0.3, metalness: 0.1,
        emissive: color, emissiveIntensity: 0.15
    });
    const balloon = new THREE.Mesh(geom, mat);
    balloon.position.set(x, y, z);
    balloon.castShadow = true;
    balloon.userData = { active: true, hp: BALLOON_HP, maxHp: BALLOON_HP, isKnight: false, radius: BALLOON_RADIUS };
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
    // 添加血条背景
    const barBg = new THREE.Mesh(
        new THREE.PlaneGeometry(1.0, 0.08),
        new THREE.MeshBasicMaterial({ color: 0x333333, depthTest: false })
    );
    barBg.position.set(0, 1.3, 0);
    barBg.name = 'hpBarBg';
    knight.add(barBg);
    // 血条填充
    const barFill = new THREE.Mesh(
        new THREE.PlaneGeometry(0.96, 0.06),
        new THREE.MeshBasicMaterial({ color: 0x44ff44, depthTest: false })
    );
    barFill.position.set(0, 1.3, 0.001);
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

    if (isKnight) createKnightBalloon(x, y, z);
    else createBalloon(x, y, z);
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

        const bx = Math.abs(b.position.x);
        const bz = Math.abs(b.position.z);
        if (bx <= BOUND_X && bz <= BOUND_Z) {
            b.userData.active = false;
            b.visible = false;
            STATE.shipHp -= BALLOON_DAMAGE;
            STATE.shipHitFlash = 0.3;
            const debrisColor = b.userData.isKnight ? 0x888888 : (b.material.color ? b.material.color.getHex() : 0xff4444);
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
                        if (balloon.userData) balloon.material.emissiveIntensity = 0.15;
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
        spawnChoiceCards();
    }
}

// ===================== 抽卡系统（稀有度版） =====================
const RARITIES = [
    { name: '普通', color: '#ffffff', bgColor: [60,60,60], value: 10 },
    { name: '稀有', color: '#4da6ff', bgColor: [30,80,160], value: 20 },
    { name: '史诗', color: '#b388ff', bgColor: [80,40,160], value: 50 },
    { name: '传说', color: '#ffd700', bgColor: [160,120,0], value: 100 },
];

const ATTR_TYPES = [
    { id: 'atk', label: '攻击力', icon: '⚔️', apply: (v) => { STATE.playerStats.atk += v; }, formatValue: (v) => `+${v}` },
    { id: 'hp', label: '生命值', icon: '❤️', apply: (v) => { STATE.playerStats.hp += v; }, formatValue: (v) => `+${v}` },
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
    const geom = new THREE.PlaneGeometry(0.5, 0.3);
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
    const geom = new THREE.PlaneGeometry(0.5, 0.16);
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

function generateRandomChoices() {
    // 随机选3个不同的属性
    const shuffled = [...ATTR_TYPES].sort(() => Math.random() - 0.5);
    const choices = [];
    for (let i = 0; i < 3; i++) {
        const rarity = RARITIES[Math.floor(Math.random() * RARITIES.length)];
        choices.push({ attr: shuffled[i], rarity });
    }
    return choices;
}

export function spawnChoiceCards() {
    if (STATE.choiceCardsActive) return;
    STATE.choiceCardsActive = true;
    STATE.choiceRefreshCount = 0;
    STATE.choiceRefreshCooldown = 0;
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

    const camLocalPos = camera.position.clone();
    const camLocalDir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    camLocalDir.y = 0;
    if (camLocalDir.lengthSq() < 0.001) camLocalDir.set(0, 0, -1);
    camLocalDir.normalize();

    const basePos = camLocalPos.clone().add(camLocalDir.clone().multiplyScalar(CHOICE_CARD_DISTANCE));
    basePos.y = camLocalPos.y - 0.1;
    const camLocalRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    camLocalRight.y = 0; camLocalRight.normalize();
    const faceTarget = camLocalPos.clone();

    // 3张属性卡
    const choices = generateRandomChoices();
    for (let i = 0; i < 3; i++) {
        const card = createChoiceCard(choices[i].attr, choices[i].rarity, i);
        const offset = (i - 1) * 0.55;
        card.position.copy(basePos).addScaledVector(camLocalRight, offset);
        card.lookAt(faceTarget);
        choiceCardGroup.add(card);
    }

    // 刷新卡（在属性卡下方）
    const refreshCard = createRefreshCard();
    refreshCard.position.copy(basePos);
    refreshCard.position.y -= 0.25;
    refreshCard.lookAt(faceTarget);
    choiceCardGroup.add(refreshCard);

    window.__log('🎴 随机抽卡已生成', 's');
    if (STATE.choiceCardTimeout) clearTimeout(STATE.choiceCardTimeout);
    STATE.choiceCardTimeout = setTimeout(() => {
        if (STATE.choiceCardsActive) {
            window.__log('⏱️ 选择卡超时', 'w');
            clearChoiceCards();
        }
    }, 15000);
}

export function clearChoiceCards() {
    STATE.choiceCardsActive = false;
    STATE.choiceRefreshCooldown = 0;
    if (STATE.choiceCardTimeout) { clearTimeout(STATE.choiceCardTimeout); STATE.choiceCardTimeout = null; }
    while (choiceCardGroup.children.length > 0) {
        const child = choiceCardGroup.children[0];
        if (child.material && child.material.map) child.material.map.dispose();
        child.material.dispose();
        child.geometry.dispose();
        choiceCardGroup.remove(child);
    }
    setTimeout(() => {
        STATE.waveNumber++;
        if (STATE.waveNumber >= 1 && !STATE.buddhaPalmReady) {
            STATE.buddhaPalmReady = true;
            if (vrModule && vrModule.attachBuddhaPalmToLeft) {
                setTimeout(() => vrModule.attachBuddhaPalmToLeft(), 500);
            }
            console.log('🖐️ 如来神掌已解锁！左手握柄侧键释放');
        }
        spawnBalloons();
        console.log('🎈 第' + STATE.waveNumber + '波气球已生成（含骑士:' + (STATE.waveNumber >= 1 ? '是' : '否') + '）');
    }, 1000);
}

export function checkLeftHandChoiceCardCollision() {
    if (!STATE.choiceCardsActive || !STATE.leftController) return;
    const leftPos = new THREE.Vector3();
    STATE.leftController.getWorldPosition(leftPos);
    for (let j = choiceCardGroup.children.length - 1; j >= 0; j--) {
        const card = choiceCardGroup.children[j];
        const cardWorldPos = new THREE.Vector3();
        card.getWorldPosition(cardWorldPos);
        const dist = leftPos.distanceTo(cardWorldPos);
        if (dist < 0.4) {
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
                // 重新生成卡片
                if (STATE.choiceCardTimeout) clearTimeout(STATE.choiceCardTimeout);
                while (choiceCardGroup.children.length > 0) {
                    const c = choiceCardGroup.children[0];
                    if (c.material && c.material.map) c.material.map.dispose();
                    if (c.material) c.material.dispose();
                    if (c.geometry) c.geometry.dispose();
                    choiceCardGroup.remove(c);
                }
                const camLocalPos = camera.position.clone();
                const camLocalDir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
                camLocalDir.y = 0;
                if (camLocalDir.lengthSq() < 0.001) camLocalDir.set(0, 0, -1);
                camLocalDir.normalize();
                const basePos = camLocalPos.clone().add(camLocalDir.clone().multiplyScalar(CHOICE_CARD_DISTANCE));
                basePos.y = camLocalPos.y - 0.1;
                const camLocalRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
                camLocalRight.y = 0; camLocalRight.normalize();
                const faceTarget = camLocalPos.clone();
                const choices = generateRandomChoices();
                for (let i = 0; i < 3; i++) {
                    const c = createChoiceCard(choices[i].attr, choices[i].rarity, i);
                    const offset = (i - 1) * 0.55;
                    c.position.copy(basePos).addScaledVector(camLocalRight, offset);
                    c.lookAt(faceTarget);
                    choiceCardGroup.add(c);
                }
                const rc = createRefreshCard();
                rc.position.copy(basePos);
                rc.position.y -= 0.25;
                rc.lookAt(faceTarget);
                choiceCardGroup.add(rc);
                STATE.choiceCardTimeout = setTimeout(() => {
                    if (STATE.choiceCardsActive) { window.__log('⏱️ 选择卡超时', 'w'); clearChoiceCards(); }
                }, 15000);
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
        spawnChoiceCards();
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

// ===================== 如来神掌 =====================
export const buddhaPalmSkills = [];
let previewPalm = null;
let aimDirection = new THREE.Vector3();

export function createPromptSprite() {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 36px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🖐️ 再按握柄释放如来神掌', 256, 55);
    ctx.fillStyle = '#aaa';
    ctx.font = '24px "Microsoft YaHei", sans-serif';
    ctx.fillText('或 5 秒后自动释放', 256, 95);
    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
    const s = new THREE.Sprite(mat);
    s.scale.set(2, 0.5, 1);
    s.visible = false;
    return s;
}

export function attachBuddhaPalmToLeft() {
    if (!STATE.buddhaPalmModel || !STATE.leftGrip || STATE.buddhaPalmAttached) return;
    const palm = STATE.buddhaPalmModel.clone();
    palm.scale.setScalar(0.2);
    palm.position.set(0, -0.08, 0.03);
    palm.rotation.set(-90, 0, 0);
    palm.traverse(c => { if (c.isMesh) c.castShadow = true; });
    palm.userData = { isBuddhaPalm: true };
    STATE.leftGrip.add(palm);
    STATE.buddhaPalmAttached = true;
    const promptSprite = createPromptSprite();
    promptSprite.position.set(0, 1.8, -1.5);
    dolly.add(promptSprite);
    console.log('🖐️ 如来神掌已装备到左手');
}

export function enterAimingMode() {
    STATE.buddhaPalmState = 'AIMING';
    STATE.buddhaPalmTimer = AIM_TIMEOUT;
    aimDirection.set(0, 0, -1).applyQuaternion(camera.quaternion);
    aimDirection.y = 0; aimDirection.normalize();
    if (STATE.buddhaPalmModel && !previewPalm) {
        previewPalm = STATE.buddhaPalmModel.clone();
        previewPalm.scale.setScalar(2.0);
        previewPalm.rotation.set(-Math.PI / 2, 0, 0);
        previewPalm.traverse(c => { if (c.isMesh) c.castShadow = true; });
        previewPalm.userData = { isPreview: true };
        dolly.add(previewPalm);
    }
    if (previewPalm) {
        previewPalm.visible = true;
        previewPalm.position.set(0, 0.5, -4);
    }
    console.log('🎯 瞄准：再按握柄释放，或' + AIM_TIMEOUT + '秒自动');
}

export function releaseBuddhaPalm() {
    if (!STATE.buddhaPalmModel) return;
    if (previewPalm) previewPalm.visible = false;
    STATE.buddhaPalmState = 'SLAMMING';
    STATE.buddhaPalmCooldown = BUDDHA_COOLDOWN;

    const palm = STATE.buddhaPalmModel.clone();
    palm.scale.setScalar(20.0);
    palm.rotation.set(-Math.PI / 2, 0, 0);
    palm.traverse(c => { if (c.isMesh) c.castShadow = true; });
    const camWorld = new THREE.Vector3();
    camera.getWorldPosition(camWorld);
    palm.position.copy(camWorld).addScaledVector(aimDirection, 3);
    palm.position.y += 20;
    palm.userData = {
        isBuddhaSkill: true, elapsed: 0,
        startY: palm.position.y, targetY: camWorld.y,
        fallDuration: 0.5, killRadius: 10, damage: 1000
    };
    scene.add(palm);
    buddhaPalmSkills.push(palm);
    console.log('🖐 如来神掌释放！20x从' + palm.position.y.toFixed(1) + 'm落下');
}

export function updateBuddhaPalmSkills(dt) {
    if (STATE.buddhaPalmCooldown > 0) STATE.buddhaPalmCooldown -= dt;
    const prevCd = STATE.choiceRefreshCooldown;
    if (STATE.choiceRefreshCooldown > 0) {
        STATE.choiceRefreshCooldown -= dt;
        if (STATE.choiceCardsActive) updateRefreshCardTexture();
    }
    // 冷却结束瞬间刷新贴图（显示"刷新"而非"冷却0s"）
    if (prevCd > 0 && STATE.choiceRefreshCooldown <= 0 && STATE.choiceCardsActive) {
        updateRefreshCardTexture();
    }

    if (STATE.buddhaPalmState === 'AIMING') {
        STATE.buddhaPalmTimer -= dt;
        if (previewPalm && previewPalm.visible) {
            const offset = aimDirection.clone().multiplyScalar(4);
            offset.y = 0.5;
            previewPalm.position.copy(offset);
        }
        if (STATE.buddhaPalmTimer <= 0) releaseBuddhaPalm();
    }

    for (let i = buddhaPalmSkills.length - 1; i >= 0; i--) {
        const palm = buddhaPalmSkills[i];
        const ud = palm.userData;
        ud.elapsed += dt;
        const t = Math.min(1, ud.elapsed / ud.fallDuration);
        palm.position.y = ud.startY + (ud.targetY - ud.startY) * t;

        if (t >= 1 && !ud.landed) {
            ud.landed = true;
            palm.position.y = ud.targetY;
            const pw = new THREE.Vector3(); palm.getWorldPosition(pw);
            let killed = 0;
            balloons.forEach(b => {
                if (!b.userData.active) return;
                if (b.position.distanceTo(pw) < ud.killRadius) {
                    b.userData.hp -= ud.damage;
                    if (b.userData.hp <= 0) {
                        b.userData.active = false;
                        if (b.userData.isKnight) { b.traverse(c => { if (c.isMesh) c.visible = false; }); STATE.playerStats.score += KNIGHT_SCORE; }
                        else { b.visible = false; STATE.playerStats.score += BALLOON_SCORE; }
                        killed++;
                    }
                }
            });
            console.log('🖐 神掌击杀 ' + killed + '（20x, 半径10, 伤害1000）');
            spawnParticles(pw, 0xffdd44, 80);
            playPop();
            checkAllBalloonsDestroyed();
            ud.cleanupDelay = 0.3;
        }

        if (ud.cleanupDelay !== undefined) {
            ud.cleanupDelay -= dt;
            if (ud.cleanupDelay <= 0) {
                palm.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); });
                scene.remove(palm);
                buddhaPalmSkills.splice(i, 1);
                STATE.buddhaPalmState = 'IDLE';
            }
        }
    }
}

export function checkBuddhaPalmTrigger() {
    if (!STATE.buddhaPalmReady || STATE.buddhaPalmCooldown > 0) return;
    if (STATE.leftBtnState.grip && !STATE.prevLeftGrip) {
        if (STATE.buddhaPalmState === 'IDLE') enterAimingMode();
        else if (STATE.buddhaPalmState === 'AIMING') releaseBuddhaPalm();
    }
    STATE.prevLeftGrip = STATE.leftBtnState.grip;
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

// 聚合导出（避免 PICO 4 浏览器 import * as 兼容性问题）
export const GameAPI = {
    setAudio, setVR,
    updateBuddhaPalmSkills, updateBullets, updateBalloons, updateWaveSpawning,
    checkBulletBalloonCollisions, checkLeftHandChoiceCardCollision,
    updateDebris, updateParticles, checkVRSkySwitch, checkBuddhaPalmTrigger,
    spawnBalloons, restartLevel, gameOver,
    balloons, buddhaPalmSkills, bullets
};
