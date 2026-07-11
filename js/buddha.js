import * as THREE from '../three.module.js';
import {
    scene, dolly, camera, STATE, buddhaPalmGroup,
    BUDDHA_COOLDOWN, BUDDHA_KILL_RADIUS, BUDDHA_DAMAGE, BUDDHA_FALL_DURATION,
    BUDDHA_HAND_SCALE, BUDDHA_HAND_POS, BUDDHA_HAND_ROT_X,
    BUDDHA_FALL_START_SCALE, BUDDHA_FALL_END_SCALE, BUDDHA_FALL_HEIGHT, BUDDHA_FALL_FORWARD,
    BALLOON_SCORE, KNIGHT_SCORE
} from './core.js';

// 运行时注入：避免与 game.js 循环依赖
let _balloons = null, _playPop = null;
export function setBuddhaDeps(balloonsRef, playPopFn) {
    _balloons = balloonsRef; _playPop = playPopFn;
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
                for (let j = _balloons.length - 1; j >= 0; j--) {
                    const b = _balloons[j];
                    if (!b.userData.active) continue;
                    // 神掌杀伤半径 = 基础半径 + 爆炸范围加成
                    const effectiveRadius = BUDDHA_KILL_RADIUS + STATE.explosionRadius;
                    if (b.position.distanceTo(palmPos) < effectiveRadius) {
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
                            _playPop();
                            killed++;
                        }
                    }
                }
                window.__log('🖐️ 如来神掌命中！击杀 ' + killed + ' 个气球', 's');
            }
        } else if (palmData.phase === 'impact') {
            // 落地后 1 秒内缩放从 FALL_END_SCALE → 1.0，然后消失
            const t = Math.min(palmData.timer / 1.0, 1);
            const s = BUDDHA_FALL_END_SCALE + (1.0 - BUDDHA_FALL_END_SCALE) * t * t * (3 - 2 * t);
            palmData.mesh.scale.setScalar(s);
            if (t >= 1) {
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

export const BuddhaAPI = {
    attachBuddhaPalmToLeft, resetBuddhaPalm, updateBuddhaPalm,
    setBuddhaDeps,
};
