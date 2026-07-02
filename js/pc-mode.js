// ===================== PC 键鼠操作模式 =====================
// 用于桌面调试：WASD 移动、鼠标视角、左键射击
// 与 vr.js 的接口兼容：复用 shootBullet / handleMovement / handleShooting
import * as THREE from '../three.module.js';
import { scene, dolly, camera, STATE, BOUND_X, BOUND_Z, MOVE_SPEED, skyCycle } from './core.js';
import { shootBullet, checkVRSkySwitch } from './game.js';
import { applySkyTarget } from './core.js';

// PC 模式状态
const PC = {
    active: false,
    keys: new Set(),                // 当前按下的键
    mouseLocked: false,
    yaw: 0,                         // dolly Y 轴旋转（左右看）
    pitch: 0,                       // camera X 轴旋转（上下看）
    fireHeld: false,                // 鼠标左键按下
    lastShotTime: 0,
    // 虚拟"枪"对象：挂在 camera 下，position 在相机前下方，跟随相机视角
    fakeGun: null,
    fakeGrip: null,
};

// 创建虚拟控制器，shootBullet 会从 controller.matrixWorld 取枪口位置
function createFakeController() {
    const ctrl = new THREE.Object3D();
    // 把它放在相机正前方一点的位置（模拟"枪在手里"）
    ctrl.position.set(0.15, -0.15, -0.25);
    camera.add(ctrl);
    return ctrl;
}

function createFakeGrip() {
    const grip = new THREE.Group();
    grip.position.set(0.15, -0.15, -0.25);
    camera.add(grip);
    return grip;
}

// ===================== 启动 / 退出 =====================
export function startPCMode() {
    if (PC.active) return;
    PC.active = true;
    STATE.pcMode = true;

    // 重置相机：dolly 走到地面附近，相机高度 1.6m
    dolly.position.set(0, 0, 0);
    dolly.rotation.set(0, 0, 0);
    camera.position.set(0, 1.6, 0);
    PC.yaw = 0;
    PC.pitch = 0;
    camera.rotation.set(0, 0, 0);

    // 创建虚拟 controller / grip（让 vr.js 的 shootBullet / attachAK48 能用）
    if (!STATE.rightController) {
        STATE.rightController = createFakeController();
    }
    if (!STATE.rightGrip) {
        STATE.rightGrip = createFakeGrip();
    }
    if (!STATE.leftGrip) {
        STATE.leftGrip = createFakeGrip();
        STATE.leftGrip.position.set(-0.15, -0.15, -0.25);
    }
    PC.fakeGun = STATE.rightController;
    PC.fakeGrip = STATE.rightGrip;

    // 监听
    document.addEventListener('keydown', onKeyDown, false);
    document.addEventListener('keyup', onKeyUp, false);
    document.addEventListener('mousedown', onMouseDown, false);
    document.addEventListener('mouseup', onMouseUp, false);
    document.addEventListener('mousemove', onMouseMove, false);
    document.addEventListener('pointerlockchange', onPointerLockChange, false);
    document.addEventListener('wheel', onWheel, false);

    // 请求指针锁定
    requestPointerLock();

    if (window.__log) window.__log('⌨️ PC 键鼠模式启动', 's');
    if (window.__log) window.__log('控制：WASD 移动 / 鼠标视角 / 左键射击 / Q 神掌 / 1-3 切天空 / ESC 退出', 'i');
}

export function exitPCMode() {
    if (!PC.active) return;
    PC.active = false;
    STATE.pcMode = false;

    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup', onKeyUp);
    document.removeEventListener('mousedown', onMouseDown);
    document.removeEventListener('mouseup', onMouseUp);
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('pointerlockchange', onPointerLockChange);
    document.removeEventListener('wheel', onWheel);

    if (document.pointerLockElement) document.exitPointerLock();

    if (window.__log) window.__log('⌨️ PC 键鼠模式退出', 'w');
}

export function isPCMode() { return PC.active; }

// ===================== 输入处理 =====================
function onKeyDown(e) {
    PC.keys.add(e.code);
    if (e.code === 'Escape') {
        exitPCMode();
        if (typeof window.__onExitPCMode === 'function') window.__onExitPCMode();
        return;
    }
    // Q 键：模拟左手 grip（如来神掌）
    if (e.code === 'KeyQ') {
        STATE.leftBtnState.grip = true;
    }
    // 1/2/3 键切换天空
    if (e.code === 'Digit1') { applySkyTarget('dusk'); }
    if (e.code === 'Digit2') { applySkyTarget('day'); }
    if (e.code === 'Digit3') { applySkyTarget('night'); }
}

function onKeyUp(e) {
    PC.keys.delete(e.code);
    if (e.code === 'KeyQ') {
        STATE.leftBtnState.grip = false;
    }
}

function onMouseDown(e) {
    if (!PC.active) return;
    if (e.button === 0) PC.fireHeld = true;
    // 第一次点击如果没锁定，先锁定
    if (!PC.mouseLocked) requestPointerLock();
}

function onMouseUp(e) {
    if (e.button === 0) PC.fireHeld = false;
}

function onMouseMove(e) {
    if (!PC.active || !PC.mouseLocked) return;
    const sens = 0.0025;
    PC.yaw -= e.movementX * sens;
    PC.pitch -= e.movementY * sens;
    // 限制俯仰角
    const lim = Math.PI / 2 - 0.1;
    PC.pitch = Math.max(-lim, Math.min(lim, PC.pitch));
}

function onWheel(e) {
    // 滚轮可调整俯仰（可选）
    PC.pitch -= e.deltaY * 0.0005;
    const lim = Math.PI / 2 - 0.1;
    PC.pitch = Math.max(-lim, Math.min(lim, PC.pitch));
}

function onPointerLockChange() {
    PC.mouseLocked = (document.pointerLockElement === document.body);
    if (window.__log) window.__log('指针锁定: ' + (PC.mouseLocked ? 'ON' : 'OFF'), 'i');
}

function requestPointerLock() {
    try {
        document.body.requestPointerLock();
    } catch (e) {
        if (window.__log) window.__log('指针锁定失败: ' + e.message, 'w');
    }
}

// ===================== 每帧更新（由 index.html 调用） =====================
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();

export function updatePCMode(dt) {
    if (!PC.active) return;

    // 1. 应用相机旋转：yaw 给 dolly，pitch 给 camera
    dolly.rotation.y = PC.yaw;
    camera.rotation.x = PC.pitch;
    camera.rotation.y = 0;
    camera.rotation.z = 0;

    // 2. 键盘移动
    let mx = 0, mz = 0;
    if (PC.keys.has('KeyW')) mz -= 1;
    if (PC.keys.has('KeyS')) mz += 1;
    if (PC.keys.has('KeyA')) mx -= 1;
    if (PC.keys.has('KeyD')) mx += 1;
    if (mx !== 0 || mz !== 0) {
        // 相对相机朝向（仅水平面）
        _forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
        _forward.y = 0; _forward.normalize();
        _right.set(1, 0, 0).applyQuaternion(camera.quaternion);
        _right.y = 0; _right.normalize();
        const speed = MOVE_SPEED * dt;
        const dx = (_forward.x * (-mz) + _right.x * mx) * speed;
        const dz = (_forward.z * (-mz) + _right.z * mx) * speed;
        dolly.position.x = Math.max(-BOUND_X, Math.min(BOUND_X, dolly.position.x + dx));
        dolly.position.z = Math.max(-BOUND_Z, Math.min(BOUND_Z, dolly.position.z + dz));
    }

    // 3. 射击：左键按下 + 冷却
    if (PC.fireHeld && STATE.rightController) {
        const now = performance.now();
        const SHOOT_COOLDOWN = 150;
        const cooldown = SHOOT_COOLDOWN / Math.max(0.1, STATE.fireRate);
        if (now - PC.lastShotTime > cooldown) {
            try {
                shootBullet(STATE.rightController);
                PC.lastShotTime = now;
            } catch (e) {
                if (window.__log) window.__log('PC 射击错误: ' + e.message, 'e');
            }
        }
    }

    // 4. 调用 sky switch 检查（让数字键在游戏内也能切）
    // 这里直接由 keydown 处理，不需要再调用
}

// ===================== 入口（启动游戏并选关）=====================
// 由 index.html 的 PC 模式按钮调用
export function startPCGame(selectedLevel) {
    startPCMode();
    // 应用关卡选择
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
            if (window.__log) window.__log('🎆 第三关：激光关卡启动 wave=2', 's');
        } else if (selectedLevel === 6) {
            STATE.waveNumber = 5;
            STATE.gameMode = 'shooting';
            STATE.buddhaPalmUnlocked = true;
            if (window.__log) window.__log('👑 第六关：Boss关 wave=5', 's');
        } else {
            STATE.waveNumber = selectedLevel - 1;
            STATE.buddhaPalmUnlocked = true;
            if (window.__log) window.__log('关卡' + selectedLevel + ' 生效: gold=1000 atk=100 wave=' + STATE.waveNumber, 's');
        }
    }
}

export const PCModeAPI = {
    startPCMode, exitPCMode, isPCMode, updatePCMode, startPCGame
};
