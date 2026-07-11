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
    BUDDHA_COOLDOWN, BUDDHA_KILL_RADIUS, BUDDHA_DAMAGE, BUDDHA_FALL_DURATION,
    BUDDHA_HAND_SCALE, BUDDHA_HAND_POS, BUDDHA_HAND_ROT_X,
    BUDDHA_FALL_START_SCALE, BUDDHA_FALL_END_SCALE, BUDDHA_FALL_HEIGHT, BUDDHA_FALL_FORWARD,
    BOUND_X, BOUND_Z, balloonTex, buddhaPalmGroup,
    applySkyTarget, skyCycle, skyBrightness,
    createCloud, clouds,
    TRANSITION_CLOUD_POSITIONS, TRANSITION_CLOUD_Y, TRANSITION_CLOUD_SCALE,
    TRANSITION_SPEED, TRANSITION_DISAPPEAR_Z, TRANSITION_SPAWN_Z,
    // 选项卡气球相关常量
    CHOICE_BALLOON_RADIUS, CHOICE_BALLOON_FLOAT_AMP, CHOICE_BALLOON_FLOAT_FREQ,
    CHOICE_BALLOON_DISTANCE, CHOICE_BALLOON_SPACING, CHOICE_BALLOON_Y,
    CHOICE_SELECT_WINDOW_START, CHOICE_SELECT_WINDOW_END, CHOICE_CLEANUP_DELAY, CHOICE_BALLOON_LIFETIME,
    CHOICE_CARD_SIZE, CHOICE_CARD_OFFSET_Y
} from './core.js';

import { RARITIES, RARITIES_BOSS, getLevelType, pickRarityByWeight, ATTR_TYPES } from './shared.js';
import { roundRect } from './core.js';
import { attachBuddhaPalmToLeft, resetBuddhaPalm, updateBuddhaPalm, setBuddhaDeps } from './buddha.js';

// 属性类型定义（与 cards.js 保持一致）
// ===================== 子弹系统 =====================
export const bullets = [];
const sharedBulletGeom = new THREE.SphereGeometry(0.02, 8, 8);
const sharedBulletMat = new THREE.MeshStandardMaterial({
    color: 0xffaa00, emissive: 0xff4400, emissiveIntensity: 0.8
});
// PC 模式专用：放大子弹便于桌面调试看清
const sharedBulletGeomPC = new THREE.SphereGeometry(0.06, 12, 12);
const sharedBulletMatPC = new THREE.MeshBasicMaterial({ color: 0xffff00 });
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

    // PC 模式下相机水平朝前，不需要 -30° 下倾角；VR 模式下手柄略向上抬，需要 -30°
    const bulletPitch = STATE.pcMode ? 0 : (-30 * Math.PI / 180);
    const localPitchQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(bulletPitch, 0, 0));
    const finalQuat = quat.clone().multiply(localPitchQuat);
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(finalQuat);

    bullet.position.copy(origin);
    bullet.userData.active = true;
    bullet.userData.vel.copy(dir.normalize().multiplyScalar(BULLET_SPEED));
    bullet.userData.life = BULLET_LIFE;
    bullet.visible = true;
    // PC 模式下用更大的子弹几何和明亮材质便于看清
    if (STATE.pcMode) {
        bullet.geometry = sharedBulletGeomPC;
        bullet.material = sharedBulletMatPC;
    } else {
        bullet.geometry = sharedBulletGeom;
        bullet.material = sharedBulletMat;
    }
    bullets.push(bullet);
    
    if (STATE.choiceBalloonsActive) {
        window.__log('🔫 [DEBUG] 发射子弹: pos=(' + origin.x.toFixed(2) + ',' + origin.y.toFixed(2) + ',' + origin.z.toFixed(2) + ')', 'i');
    }
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

// ===================== 选项卡气球系统 =====================

function createChoiceCardTexture(attr, rarity) {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const bg = rarity.bgColor;
    ctx.fillStyle = `rgba(${bg[0]},${bg[1]},${bg[2]},0.92)`;
    roundRect(ctx, 0, 0, 512, 256, 32);
    ctx.fill();
    ctx.strokeStyle = `#${rarity.color.toString(16).padStart(6, '0')}`;
    ctx.lineWidth = 8;
    roundRect(ctx, 4, 4, 504, 248, 28);
    ctx.stroke();

    ctx.fillStyle = `#${rarity.color.toString(16).padStart(6, '0')}`;
    ctx.font = 'bold 52px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(attr.icon + ' ' + attr.label, 256, 80);

    ctx.font = 'bold 68px monospace';
    ctx.fillText(attr.formatValue(rarity.value), 256, 165);

    ctx.font = '24px sans-serif';
    ctx.fillText(rarity.name, 256, 210);

    const texture = new THREE.CanvasTexture(canvas);
    return texture;
}

function createRefreshCardTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 160;
    const ctx = canvas.getContext('2d');
    const fee = 10 * Math.pow(2, STATE.choiceRefreshCount);
    const onCooldown = STATE.choiceRefreshCooldown > 0;
    ctx.fillStyle = onCooldown ? 'rgba(60,60,60,0.9)' : 'rgba(30,120,60,0.9)';
    roundRect(ctx, 0, 0, 512, 160, 24);
    ctx.fill();
    ctx.strokeStyle = onCooldown ? '#666' : '#44dd88';
    ctx.lineWidth = 5;
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
    return texture;
}

export function createChoiceBalloon(x, y, z, attr, rarity, isRefresh = false) {
    const group = new THREE.Group();
    
    // 创建气球
    const balloonGeom = new THREE.SphereGeometry(CHOICE_BALLOON_RADIUS, 16, 16);
    const balloonColor = isRefresh ? 0x44dd88 : rarity.color;
    const balloonMat = new THREE.MeshStandardMaterial({
        color: balloonColor,
        roughness: 0.3,
        metalness: 0.1,
        emissive: balloonColor,
        emissiveIntensity: 0.3
    });
    const balloon = new THREE.Mesh(balloonGeom, balloonMat);
    balloon.position.set(0, 0, 0);
    balloon.castShadow = true;
    group.add(balloon);

    // 创建选项卡卡片（挂在气球下方）
    let cardTexture, cardHeight;
    if (isRefresh) {
        cardTexture = createRefreshCardTexture();
        cardHeight = CHOICE_CARD_SIZE * 0.5;
    } else {
        cardTexture = createChoiceCardTexture(attr, rarity);
        cardHeight = CHOICE_CARD_SIZE;
    }
    
    const cardGeom = new THREE.PlaneGeometry(CHOICE_CARD_SIZE, cardHeight);
    const cardMat = new THREE.MeshBasicMaterial({ 
        map: cardTexture, 
        transparent: true, 
        side: THREE.DoubleSide 
    });
    const card = new THREE.Mesh(cardGeom, cardMat);
    card.position.set(0, CHOICE_CARD_OFFSET_Y, 0);
    card.lookAt(new THREE.Vector3(0, 0, 1));
    group.add(card);

    // 设置位置
    group.position.set(x, y, z);

    // 设置 userData
    group.userData = {
        isChoiceBalloon: true,
        isRefresh: isRefresh,
        attr: attr,
        rarity: rarity,
        active: true,
        selected: false,
        firstHitTime: 0,
        hitCount: 0,
        balloon: balloon,
        card: card,
        cardTexture: cardTexture,
        initialY: y,
        floatOffset: Math.random() * Math.PI * 2,
        spawnTime: performance.now() * 0.001
    };

    scene.add(group);
    STATE.choiceBalloons.push(group);
    
    window.__log('🎈 [DEBUG] ' + (isRefresh ? '🔄刷新' : attr.label) + ' 位置=(' + x.toFixed(2) + ',' + y.toFixed(2) + ',' + z.toFixed(2) + ')', 'i');
    
    return group;
}

export function spawnChoiceBalloons() {
    if (STATE.choiceBalloonsActive) { window.__log('[DIAG] spawnChoiceBalloons 跳过: choiceBalloonsActive 已为 true', 'w'); return; }
    window.__log('[DIAG] spawnChoiceBalloons 被调用! wave=' + STATE.waveNumber, 's');
    clearChoiceBalloons();
    // 清理原有的卡片系统
    clearChoiceBalloons();
    
    STATE.choiceBalloonsActive = true;
    STATE.choiceRefreshCooldown = 0;

    const playerPos = dolly.position.clone();
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    forward.y = 0;
    forward.normalize();

    const spawnBase = playerPos.clone().add(forward.clone().multiplyScalar(CHOICE_BALLOON_DISTANCE));
    
    window.__log('🎈 [DEBUG] 选项卡气球生成: count=' + (shuffledAttrs.length + 1), 'i');

    const levelType = getLevelType(STATE.waveNumber);
    const rarities = levelType === 'boss' ? RARITIES_BOSS : RARITIES;

    // 随机选择3个不同的属性
    const shuffledAttrs = [...ATTR_TYPES].sort(() => Math.random() - 0.5);
    
    // 生成3个选项卡气球
    for (let i = 0; i < 3; i++) {
        const rarity = pickRarityByWeight(rarities);
        const offsetX = (i - 1) * CHOICE_BALLOON_SPACING;
        createChoiceBalloon(
            spawnBase.x + offsetX,
            CHOICE_BALLOON_Y,
            spawnBase.z,
            shuffledAttrs[i],
            rarity,
            false
        );
    }

    // 生成刷新气球（在最右边）
    createChoiceBalloon(
        spawnBase.x + CHOICE_BALLOON_SPACING * 1.5,
        CHOICE_BALLOON_Y,
        spawnBase.z,
        null,
        null,
        true
    );

    window.__log('🎈 选项卡气球生成完成', 's');
}

export function updateChoiceBalloons(dt) {
    if (!STATE.choiceBalloonsActive) return;

    const now = performance.now() * 0.001;

    STATE.choiceBalloons.forEach(balloon => {
        if (!balloon.userData.active) return;

        // 悬浮飘动效果
        const floatY = balloon.userData.initialY + Math.sin(now * CHOICE_BALLOON_FLOAT_FREQ + balloon.userData.floatOffset) * CHOICE_BALLOON_FLOAT_AMP;
        balloon.position.y = floatY;

        // 全局超时：存活超过 CHOICE_BALLOON_LIFETIME 秒自动清理
        const aliveTime = now - (balloon.userData.spawnTime || 0);
        if (aliveTime > CHOICE_BALLOON_LIFETIME) {
            window.__log('⏰ 选项卡气球超时（' + aliveTime.toFixed(1) + '秒），自动清理进入下一波', 'w');
            explodeChoiceBalloon(balloon);
            setTimeout(() => {
                STATE.choiceBalloons.forEach(b => {
                    if (b !== balloon && b.userData.active) explodeChoiceBalloon(b);
                });
                clearChoiceBalloons();
                STATE.nextWaveTimer = 1.0;
            }, 300);
            return;
        }

        // 更新选中检测窗口
        if (balloon.userData.firstHitTime > 0) {
            const elapsed = now - balloon.userData.firstHitTime;

            // 窗口超时 → 重置计数器，允许玩家重新尝试
            if (elapsed > CHOICE_SELECT_WINDOW_END) {
                balloon.userData.firstHitTime = 0;
                balloon.userData.hitCount = 0;
                window.__log('⏰ 选择窗口超时（' + elapsed.toFixed(1) + '秒），已重置', 'i');
            }
            // 在检测窗口内达到2次命中 → 选中该气球
            else if (balloon.userData.hitCount >= 2 && 
                elapsed >= CHOICE_SELECT_WINDOW_START) {
                selectChoiceBalloon(balloon);
            }
        }
    });
}

export function hitChoiceBalloon(balloon) {
    if (!balloon.userData.active || balloon.userData.selected) return;

    const now = performance.now() * 0.001;

    // ---- 视觉反馈：闪白 + 粒子 ----
    const balloonMesh = balloon.userData.balloon;
    if (balloonMesh && balloonMesh.material) {
        const origEmissive = balloonMesh.material.emissiveIntensity;
        balloonMesh.material.emissiveIntensity = 1.5;
        balloonMesh.material.emissive = new THREE.Color(0xffffff);
        setTimeout(() => {
            if (balloonMesh.material && balloon.userData.active) {
                balloonMesh.material.emissiveIntensity = origEmissive;
                balloonMesh.material.emissive.set(balloonMesh.material.color);
            }
        }, 120);
    }
    // spawnParticles removed (particle system disabled)
    playPop();

    if (balloon.userData.firstHitTime === 0) {
        // 第一次被击中
        balloon.userData.firstHitTime = now;
        balloon.userData.hitCount = 1;
        window.__log('🎯 选项卡气球首次被击中: ' + 
            'attr=' + (balloon.userData.attr ? balloon.userData.attr.label : 'refresh') +
            ' pos=(' + balloon.position.x.toFixed(2) + ',' + balloon.position.y.toFixed(2) + ',' + balloon.position.z.toFixed(2) + ')', 'i');
    } else {
        balloon.userData.hitCount++;
        window.__log('🔄 选项卡气球再次被击中: hitCount=' + balloon.userData.hitCount, 'i');
    }
}

export function selectChoiceBalloon(selectedBalloon) {
    if (!selectedBalloon.userData.active) return;

    selectedBalloon.userData.selected = true;

    if (selectedBalloon.userData.isRefresh) {
        // 刷新气球：检查金币和冷却
        if (STATE.choiceRefreshCooldown > 0) {
            window.__log('⏳ 刷新冷却中', 'w');
            return;
        }
        const fee = 10 * Math.pow(2, STATE.choiceRefreshCount);
        if (STATE.playerStats.gold < fee) {
            window.__log('💰 金币不足，刷新需 ' + fee + ' 金币', 'w');
            return;
        }
        STATE.playerStats.gold -= fee;
        STATE.choiceRefreshCount++;
        STATE.choiceRefreshCooldown = 2;
        window.__log('🔄 刷新选项卡气球', 's');
        
        // 重新生成选项卡气球
        STATE.choiceBalloonsActive = false;
        setTimeout(() => spawnChoiceBalloons(), 100);
        return;
    }

    // 属性气球：应用属性
    const attr = selectedBalloon.userData.attr;
    const rarity = selectedBalloon.userData.rarity;
    attr.apply(rarity.value);
    window.__log('✅ 选择: ' + attr.label + ' ' + attr.formatValue(rarity.value) + ' (' + rarity.name + ')', 's');

    // 选中的气球先爆炸
    explodeChoiceBalloon(selectedBalloon);

    // 延迟后清除其他气球
    setTimeout(() => {
        STATE.choiceBalloons.forEach(balloon => {
            if (balloon !== selectedBalloon && balloon.userData.active) {
                explodeChoiceBalloon(balloon);
            }
        });
        clearChoiceBalloons();
        STATE.nextWaveTimer = 1.0;
    }, CHOICE_CLEANUP_DELAY * 1000);
}

function explodeChoiceBalloon(balloon) {
    if (!balloon.userData.active) return;

    balloon.userData.active = false;

    // 创建爆炸粒子效果
    const pos = balloon.position.clone();
    // spawnParticles removed (particle system disabled)
    // spawnDebris removed (debris system disabled)

    // 移除气球
    scene.remove(balloon);
    
    // 清理资源
    balloon.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
            if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
            else child.material.dispose();
        }
    });

    playPop();
}

export function clearChoiceBalloons() {
    STATE.choiceBalloons.forEach(balloon => {
        if (balloon.userData.active) {
            scene.remove(balloon);
            balloon.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
                    else child.material.dispose();
                }
            });
        }
    });
    STATE.choiceBalloons = [];
    STATE.choiceBalloonsActive = false;
}

export function updateChoiceCooldowns(dt) {
    if (STATE.choiceRefreshCooldown > 0) {
        STATE.choiceRefreshCooldown = Math.max(0, STATE.choiceRefreshCooldown - dt);
    }
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
    if (!updateBalloons._diagCount) updateBalloons._diagCount = 0;
    updateBalloons._diagCount++;
    if (updateBalloons._diagCount === 1) {
        window.__log('[DIAG] updateBalloons 兜底首次: gameStarted=' + STATE.gameStarted + ' gameMode=' + STATE.gameMode + ' wave=' + STATE.waveNumber, 's');
    }
    if (STATE.gameStarted && STATE.nextWaveTimer === 0) {
        checkAllBalloonsDestroyed();
    }
}

export function checkBulletBalloonCollisions() {
    // 调试日志：每60帧输出一次选项卡气球状态
    if (!checkBulletBalloonCollisions._frameCount) checkBulletBalloonCollisions._frameCount = 0;
    if (checkBulletBalloonCollisions._frameCount === 1) {
        window.__log('[DIAG] checkBulletBalloonCollisions 首次调用: gameMode=' + STATE.gameMode + ' bullets=' + bullets.length + ' balloons=' + balloons.length, 's');
    }
    checkBulletBalloonCollisions._frameCount++;
    const showDebug = checkBulletBalloonCollisions._frameCount % 60 === 1;
    
    if (showDebug && STATE.choiceBalloonsActive) {
        const count = STATE.choiceBalloons.filter(b => b.userData.active).length;
        if (count > 0) {
            window.__log('🔍 [DEBUG] 选项卡气球状态: active=' + count + ', bullets=' + bullets.length, 'i');
        }
    }
    
    for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        if (!bullet.userData.active) continue;
        
        let hitSomething = false;
        
        // 先检测选项卡气球
        for (let j = STATE.choiceBalloons.length - 1; j >= 0; j--) {
            const choiceBalloon = STATE.choiceBalloons[j];
            if (!choiceBalloon.userData.active) continue;
            
            // 检测子弹与选项卡气球的碰撞（气球部分）
            const balloonMesh = choiceBalloon.userData.balloon;
            // 获取balloonMesh在世界坐标系中的实际位置
            const balloonWorldPos = new THREE.Vector3();
            balloonMesh.getWorldPosition(balloonWorldPos);
            const dist = bullet.position.distanceTo(balloonWorldPos);
            
            if (showDebug && dist < 10) {
                const attrName = choiceBalloon.userData.isRefresh ? 'refresh' : (choiceBalloon.userData.attr ? choiceBalloon.userData.attr.label : '?');
                window.__log('🔍 [DEBUG] 子弹→' + attrName + ': dist=' + dist.toFixed(3) + 
                    ', bullet=(' + bullet.position.x.toFixed(3) + ',' + bullet.position.y.toFixed(3) + ',' + bullet.position.z.toFixed(3) + ')' +
                    ', balloonLocal=(' + balloonMesh.position.x.toFixed(3) + ',' + balloonMesh.position.y.toFixed(3) + ',' + balloonMesh.position.z.toFixed(3) + ')' +
                    ', balloonWorld=(' + balloonWorldPos.x.toFixed(3) + ',' + balloonWorldPos.y.toFixed(3) + ',' + balloonWorldPos.z.toFixed(3) + ')', 'i');
            }
            
            if (dist < CHOICE_BALLOON_RADIUS + 0.05) {
                hitChoiceBalloon(choiceBalloon);
                hitSomething = true;
                window.__log('🎯 [HIT] 子弹击中选项卡气球! dist=' + dist.toFixed(3) + ', radius=' + CHOICE_BALLOON_RADIUS, 'i');
                break;
            }
        }
        
        if (hitSomething) {
            bullet.userData.active = false;
            bullet.visible = false;
            bullets.splice(i, 1);
            continue;
        }
        
        // 检测普通气球
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
    if (STATE.gameMode !== 'shooting') { window.__log('[DIAG] checkAllBalloonsDestroyed 跳过: gameMode=' + STATE.gameMode, 'w'); return; }

    const activeBalloons = balloons.filter(b => b.userData.active);
    const remaining = STATE.waveSpawnRemaining;
    const choiceActive = STATE.choiceBalloonsActive;
    window.__log('[DIAG] 检测波次结束: active=' + activeBalloons.length + ' remaining=' + remaining + ' choiceActive=' + choiceActive + ' wave=' + STATE.waveNumber, 'i');
    if (activeBalloons.length === 0 && remaining <= 0 && !choiceActive) {
        if (!STATE.transitionCloudActive) {
            startCloudTransition();
        }
        const lvlType = getLevelType(STATE.waveNumber);
        if (lvlType === 'final') {
            window.__log('🎉 恭喜通关！游戏胜利', 's');
            return;
        }
        window.__log('[DIAG] 触发 spawnChoiceBalloons! wave=' + STATE.waveNumber + ' lvlType=' + lvlType, 's');
        spawnChoiceBalloons();

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
        spawnChoiceBalloons();

        console.log('🎁 死亡补偿：赠送一次抽卡机会');
    }, 500);
}

// ===================== 刷新冷却管理 =====================
export function updateCooldowns(dt) {
    const prevCd = STATE.choiceRefreshCooldown;
    if (STATE.choiceRefreshCooldown > 0) {
        STATE.choiceRefreshCooldown -= dt;
        if (STATE.choiceCardsActive) updateChoiceBalloons(dt);
    }
    // 冷却结束瞬间刷新贴图（显示"刷新"而非"冷却0s"）
    if (prevCd > 0 && STATE.choiceRefreshCooldown <= 0 && STATE.choiceCardsActive) {
        // updateRefreshCardTexture removed — old card system deprecated
    }
    // 波次过渡倒计时
    if (STATE.nextWaveTimer > 0) {
        STATE.nextWaveTimer -= dt;
        if (STATE.nextWaveTimer <= 0) {
            STATE.nextWaveTimer = 0;
            STATE.waveNumber++;
            // 波次1清空后（waveNumber === 2）→ 进入激光关卡（跳过波次2射击）
            if (STATE.waveNumber === 2) {
                STATE.gameMode = 'laser';
                window.__log('🎆 进入激光关卡！', 's');
                balloons.forEach(b => disposeBalloon(b));
                balloons.length = 0;
                return;
            }
            if (STATE.waveNumber >= 1 && !STATE.buddhaPalmReady) {
                attachBuddhaPalmToLeft();
            }
            spawnBalloons();
            window.__log('🎈 第' + STATE.waveNumber + '波气球已生成', 's');
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

// ===================== 聚合导出 =====================
// 聚合导出（避免 PICO 4 浏览器 import * as 兼容性问题）
export const GameAPI = {
    setAudio, setVR,
    updateCooldowns, updateBullets, updateBalloons, updateWaveSpawning,
    checkBulletBalloonCollisions,
    checkVRSkySwitch,
    spawnBalloons, restartLevel, gameOver,
    updateBuddhaPalm, attachBuddhaPalmToLeft, resetBuddhaPalm,
    initTransitionClouds, updateTransitionClouds, startCloudTransition,
    createKnightBalloon,
    balloons, bullets,
    // 选项卡气球相关
    spawnChoiceBalloons, updateChoiceBalloons, clearChoiceBalloons, updateChoiceCooldowns

};