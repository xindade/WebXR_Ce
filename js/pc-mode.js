// ===================== PC 键鼠操作模式 =====================
// 用于桌面调试：WASD 移动、鼠标视角、左键射击
// 复用 vr.js 的 handleShooting + updateGunRecoil 保证与 VR 一致
import * as THREE from '../three.module.js';
import { scene, dolly, camera, STATE, BOUND_X, BOUND_Z, MOVE_SPEED, applySkyTarget } from './core.js';
import { attachAK48, handleShooting, updateGunRecoil } from './vr.js';

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
    // 放在相机前方下方一点（FPS 标准"枪在右下"位置）
    ctrl.position.set(0.18, -0.18, -0.4);
    camera.add(ctrl);
    return ctrl;
}

function createFakeGrip() {
    const grip = new THREE.Group();
    grip.position.set(0.18, -0.18, -0.4);
    camera.add(grip);
    return grip;
}

// 主动挂载 AK48：清除上一轮残留的枪模型，再重新挂到当前虚拟 grip
function ensureAK48Attached() {
    // 清除可能残留的旧枪
    if (STATE.ak48Mesh && STATE.ak48Mesh.parent) {
        STATE.ak48Mesh.parent.remove(STATE.ak48Mesh);
    }
    STATE.ak48Attached = false;
    STATE.ak48Mesh = null;
    STATE.ak48BasePos = null;
    STATE.ak48BaseRot = null;
    // 调用 vr.js 的挂载函数
    try {
        attachAK48();
        // PC 模式下重新校正枪的局部位置和朝向
        // ⚠️ 必须同时修改 ak48BasePos/BaseRot，否则 updateGunRecoil 每帧会覆盖回去
        if (STATE.ak48Mesh) {
            // VR 模式下 rotation.x=-20 弧度, rotation.y=π/2 是给 XR 手柄 pose 用的
            // PC 模式下虚拟 grip 没有自身旋转，直接保留 rotation.y=π/2 让枪管朝 -Z 即可
            const basePos = new THREE.Vector3(0, -0.1, 0.01);  // 保留 VR 默认位置
            const baseRot = new THREE.Euler(0, Math.PI / 2, 0); // 只保留 Y 旋转，去掉 X 旋转
            STATE.ak48Mesh.position.copy(basePos);
            STATE.ak48Mesh.rotation.copy(baseRot);
            STATE.ak48BasePos = basePos;
            STATE.ak48BaseRot = baseRot;
            if (window.__log) window.__log('PC AK48 已挂载 (PC 朝向: rot.y=π/2)', 's');
        }
    } catch (e) {
        if (window.__log) window.__log('PC 挂载 AK48 失败: ' + e.message, 'e');
    }
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
    if (!STATE.rightController || !STATE.rightController.parent) {
        STATE.rightController = createFakeController();
    }
    if (!STATE.rightGrip || !STATE.rightGrip.parent) {
        STATE.rightGrip = createFakeGrip();
    }
    if (!STATE.leftGrip || !STATE.leftGrip.parent) {
        STATE.leftGrip = createFakeGrip();
        STATE.leftGrip.position.set(-0.18, -0.18, -0.4);
    }
    PC.fakeGun = STATE.rightController;
    PC.fakeGrip = STATE.rightGrip;

    // 主动挂载 AK48（解决模型已加载但未挂载到虚拟 grip 的问题）
    ensureAK48Attached();

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
    STATE.rightTrigger = false;  // 清除射击状态
    PC.fireHeld = false;

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
    if (e.button === 0) {
        PC.fireHeld = true;
        STATE.rightTrigger = true;  // 让 vr.handleShooting 检测到射击
        if (window.__log) window.__log('🖱️ 鼠标左键按下 fireHeld=true', 'i');
    }
    // 第一次点击如果没锁定，先锁定
    if (!PC.mouseLocked) requestPointerLock();
}

function onMouseUp(e) {
    if (e.button === 0) {
        PC.fireHeld = false;
        STATE.rightTrigger = false;
    }
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

    // 应用相机旋转：yaw 给 dolly，pitch 给 camera
    dolly.rotation.y = PC.yaw;
    camera.rotation.x = PC.pitch;
    camera.rotation.y = 0;
    camera.rotation.z = 0;
    // PC 模式下相机挂在 dolly 下，position 相对 dolly 设置即可（dolly.position 已为 0）
    camera.position.set(0, 1.6, 0);

    // 强制更新世界矩阵（shootBullet 依赖 controller.matrixWorld）
    dolly.updateMatrixWorld(true);

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

    // 3. 射击：复用 vr.handleShooting（与 VR 完全一致的射击逻辑）
    try {
        handleShooting();
    } catch (e) {
        if (window.__log) window.__log('PC handleShooting 错误: ' + e.message, 'e');
    }

    // 4. 后坐力更新（与 VR 一致，避免 ak48Mesh 位置不同步）
    try {
        updateGunRecoil();
    } catch (e) {
        if (window.__log) window.__log('PC updateGunRecoil 错误: ' + e.message, 'e');
    }
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
