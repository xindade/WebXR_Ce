import * as THREE from '../three.module.js';
import {
    scene, camera, choiceCardGroup, STATE,
    CHOICE_CARD_DISTANCE, CHOICE_CARD_WIDTH, CHOICE_CARD_HEIGHT, CHOICE_REFRESH_HEIGHT,
    CHOICE_CARD_SPACING, CHOICE_REFRESH_OFFSET_Y, CHOICE_CARD_Y_OFFSET,
    CHOICE_HIGHLIGHT_PULL, CHOICE_HIGHLIGHT_SCALE, CHOICE_HIGHLIGHT_LERP,
    RAY_PITCH_ANGLE, RAY_CAST_DISTANCE, SHIP_MAX_HP
} from './core.js';

// ===================== 抽卡系统（稀有度版） =====================
// 普通关稀有度（带概率权重）
export const RARITIES = [
    { name: '普通', color: '#ffffff', bgColor: [60,60,60], value: 10, weight: 40 },
    { name: '稀有', color: '#4da6ff', bgColor: [30,80,160], value: 20, weight: 30 },
    { name: '史诗', color: '#b388ff', bgColor: [80,40,160], value: 50, weight: 20 },
    { name: '传说', color: '#ffd700', bgColor: [160,120,0], value: 100, weight: 10 },
];
// Boss关稀有度（追加红色 = 传说2倍）
export const RARITIES_BOSS = [
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
export function getLevelType(waveNumber) {
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
    // 爆炸：增加子弹命中后爆炸范围（m），爆炸伤害 = 子弹伤害
    { id: 'blast', label: '爆炸范围', icon: '💥', apply: (v) => { STATE.explosionRadius += v/100; }, formatValue: (v) => `+${(v/100).toFixed(1)}m` },
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

    // 固定世界坐标基准：(0, 2, -3) 为中心，正面朝向 +Z
    STATE.choiceCardBase = {
        pos: new THREE.Vector3(0, 2, -3),
        forward: new THREE.Vector3(0, 0, 1),  // 正面朝 +Z
        right: new THREE.Vector3(1, 0, 0),
    };
    const base = STATE.choiceCardBase;
    const cardY = base.pos.y;  // 固定高度 y=2

    // 3张属性卡
    const choices = generateRandomChoices(forceLegendary, levelType);
    for (let i = 0; i < 3; i++) {
        const card = createChoiceCard(choices[i].attr, choices[i].rarity, i);
        const offsetX = (i - 1) * CHOICE_CARD_SPACING;
        // 记录局部偏移，每帧用当前相机重算世界坐标
        card.userData.cardOffset = { offsetX, offsetY: 0, offsetZ: 0 };
        _repositionCard(card, base, cardY);
        choiceCardGroup.add(card);
    }

    // 刷新卡（在属性卡下方）
    const refreshCard = createRefreshCard();
    refreshCard.userData.cardOffset = { offsetX: 0, offsetY: CHOICE_REFRESH_OFFSET_Y, offsetZ: 0 };
    _repositionCard(refreshCard, base, cardY);
    choiceCardGroup.add(refreshCard);

    window.__log('🎴 随机抽卡已生成（60秒超时）', 's');
    if (STATE.choiceCardTimeout) clearTimeout(STATE.choiceCardTimeout);
    STATE.choiceCardTimeout = setTimeout(() => {
        if (STATE.choiceCardsActive) {
            window.__log('⏱️ 选择卡超时', 'w');
            clearChoiceCards();
        }
    }, 60000);  // 调试用，正式改为15000
}

// 卡片直接挂在 scene 下，card.position 即世界坐标
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
    const cardY = base.pos.y;  // 固定 y=2

    // ---- 射线检测：左手球指向哪张卡片 ----
    let hitCardIndex = -1;
    if (STATE.leftRaySphere && STATE.leftController) {
        const rayOrigin = new THREE.Vector3();
        STATE.leftRaySphere.getWorldPosition(rayOrigin);
        const ctrlQuat = STATE.leftController.getWorldQuaternion(new THREE.Quaternion());
        // 卡片射线用控制器正前方方向（不加俯仰角偏移，自然指向）
        const rayDir = new THREE.Vector3(0, 0, -1).applyQuaternion(ctrlQuat);
        _raycaster.set(rayOrigin, rayDir.normalize());
        _raycaster.far = RAY_CAST_DISTANCE;
        const hits = _raycaster.intersectObjects(choiceCardGroup.children, false);
        if (hits.length > 0) {
            hitCardIndex = choiceCardGroup.children.indexOf(hits[0].object);
        }
        // 计算射线在 z=-3 平面的命中点（调试用）
        if (Math.abs(rayDir.z) > 0.001) {
            const t = (-3 - rayOrigin.z) / rayDir.z;
            STATE._rayHitX = rayOrigin.x + t * rayDir.x;
            STATE._rayHitY = rayOrigin.y + t * rayDir.y;
        }
    }
    STATE.highlightedCardIndex = hitCardIndex;

    // ---- 更新每张卡片的位置 + 高亮动画 + 锁定朝向 ----
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


export const CardAPI = {
    spawnChoiceCards, clearChoiceCards, updateChoiceCards,
    checkLeftHandChoiceCardCollision, updateRefreshCardTexture,
    RARITIES, RARITIES_BOSS, getLevelType,
};
