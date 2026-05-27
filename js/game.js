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
                // ---- 爆炸范围伤害 ----
                if (STATE.explosionRadius > 0) {
                    const blastDmg = STATE.playerStats.atk;
                    const blastPos = bullet.position.clone();
                    const blastRadius = STATE.explosionRadius;
                    for (let k = balloons.length - 1; k >= 0; k--) {
                        if (k === j) continue; // 跳过主目标
                        const other = balloons[k];
                        if (!other.userData.active) continue;
                        if (blastPos.distanceTo(other.position) < blastRadius) {
                            other.userData.hp -= blastDmg;
                            if (other.userData.hp <= 0) {
                                other.userData.active = false;
                                if (other.userData.isKnight) {
                                    other.traverse(c => { if (c.isMesh) c.visible = false; });
                                    STATE.playerStats.score += KNIGHT_SCORE;
                                    STATE.playerStats.gold += KNIGHT_SCORE;
                                } else {
                                    other.visible = false;
                                    STATE.playerStats.score += BALLOON_SCORE;
                                    STATE.playerStats.gold += BALLOON_SCORE;
                                }
                                const dColor = other.userData.isKnight ? 0x888888 : (other.material.color ? other.material.color.getHex() : 0xff4444);
                                spawnDebris(other.position.clone(), dColor, 4);
                            }
                        }
                    }
                    spawnParticles(blastPos, 0xff6600, 15); // 橙色爆炸粒子
                }
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
    if (STATE.gameMode !== 'shooting') return;  // intro6/laser 模式不放卡
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

import { RARITIES, RARITIES_BOSS, getLevelType, spawnChoiceCards, clearChoiceCards, updateChoiceCards, checkLeftHandChoiceCardCollision, updateRefreshCardTexture } from './cards.js';
import { attachBuddhaPalmToLeft, resetBuddhaPalm, updateBuddhaPalm, setBuddhaDeps } from './buddha.js';

// 注入神掌需要的运行时依赖（避免循环 import）
setBuddhaDeps(balloons, spawnDebris, spawnParticles, playPop);

// Re-export for vr.js named imports
export { attachBuddhaPalmToLeft };

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
    // 选关跳波次时，神掌模型可能延迟加载 → 每帧重试解锁
    if (STATE.waveNumber >= 1 && STATE.buddhaPalmModel && !STATE.buddhaPalmReady) {
        attachBuddhaPalmToLeft();
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


// ===================== 聚合导出 =====================
export const GameAPI = {
    setAudio, setVR,
    updateCooldowns, updateBullets, updateBalloons, updateWaveSpawning,
    updateChoiceCards, checkBulletBalloonCollisions, checkLeftHandChoiceCardCollision,
    updateDebris, updateParticles, checkVRSkySwitch,
    spawnBalloons, restartLevel, gameOver,
    spawnChoiceCards, clearChoiceCards,
    updateBuddhaPalm, attachBuddhaPalmToLeft, resetBuddhaPalm,
    initTransitionClouds, updateTransitionClouds, startCloudTransition,
    createKnightBalloon,
    balloons, bullets
};
