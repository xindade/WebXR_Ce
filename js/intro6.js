// intro6.js — 第六关红蓝对决逻辑
import * as THREE from '../three.module.js';
import { scene, STATE, createShootingGrid, destroyShootingGrid } from './core.js';
import { GameAPI as game } from './game.js';

let intro6 = { phase: 'idle', timer: 0, grid: null, enemies: 0, killed: 0, _cardsTriggered: false };

export function startIntro6() {
    intro6.phase = 'wait';
    intro6.timer = 0;
    intro6.enemies = 0;
    intro6.killed = 0;
    intro6._cardsTriggered = false;
    if (STATE.cloudGroup) STATE.cloudGroup.visible = false;
    if (STATE.shipModel) STATE.shipModel.visible = false;
    game.balloons.forEach(b => b.visible = false);
    if (intro6.grid) { scene.remove(intro6.grid); }
    intro6.grid = new THREE.Group();
    const w = 0.5, cellsX = 8, cellsZ = 4;
    for (let ix = 0; ix < cellsX; ix++) {
        for (let iz = 0; iz < cellsZ; iz++) {
            const isRed = ix < cellsX / 2;
            const mat = new THREE.MeshBasicMaterial({ color: isRed ? 0xcc3333 : 0x3366cc, side: THREE.DoubleSide, transparent: true, opacity: 0.6 });
            const geo = new THREE.PlaneGeometry(w * 0.95, w * 0.95);
            const cell = new THREE.Mesh(geo, mat);
            cell.position.set((ix - cellsX/2 + 0.5) * w, 0.01, (iz - cellsZ/2 + 0.5) * w);
            cell.rotation.x = -Math.PI / 2;
            intro6.grid.add(cell);
        }
    }
    scene.add(intro6.grid);
    createShootingGrid();
    window.__log('🔥 第六关开场：红蓝对决 10秒后敌人生成', 's');
}

export function updateIntro6(dt) {
    if (STATE.gameMode !== 'intro6') return;
    if (intro6.phase === 'wait') {
        intro6.timer += dt;
        if (intro6.timer >= 10) {
            intro6.phase = 'fight';
            intro6.timer = 0;
            intro6.enemies = 20;
            intro6.killed = 0;
            STATE.waveSpawnRemaining = 20;
            STATE.waveKilled = 0;
            game.spawnBalloons();
            window.__log('⚔️ 20个敌人出现！', 's');
        }
    } else if (intro6.phase === 'fight') {
        const alive = game.balloons.filter(b => b.userData.active).length;
        const totalSpawned = intro6.enemies;
        if (alive === 0 && totalSpawned > 0 && !STATE.choiceCardsActive) {
            if (!intro6._cardsTriggered) {
                intro6._cardsTriggered = true;
                game.spawnChoiceBalloons();
            } else if (!STATE.choiceCardsActive) {
                cleanUpIntro6();
            }
        }
    }
}

export function cleanUpIntro6() {
    intro6.phase = 'done';
    if (intro6.grid) { scene.remove(intro6.grid); intro6.grid = null; }
    if (STATE.cloudGroup) STATE.cloudGroup.visible = true;
    if (STATE.shipModel) STATE.shipModel.visible = true;
    destroyShootingGrid();
    STATE.waveNumber = 5;
    STATE.gameMode = 'shooting';
    window.__log('🔥 红蓝对决完成！进入 Boss 关 wave=5', 's');
}

export function isIntro6Fighting() {
    return intro6.phase === 'fight';
}