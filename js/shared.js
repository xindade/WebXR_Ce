// shared.js — Shared utilities and data extracted from cards.js
// This module contains only pure data and utility functions with no THREE.js scene dependencies.
import * as THREE from '../three.module.js';
import { STATE, SHIP_MAX_HP } from './core.js';

// ===================== Rarity System =====================
export const RARITIES = [
    { name: '普通', color: '#ffffff', bgColor: [60,60,60], value: 10, weight: 40 },
    { name: '稀有', color: '#4da6ff', bgColor: [30,80,160], value: 20, weight: 30 },
    { name: '史诗', color: '#b388ff', bgColor: [80,40,160], value: 50, weight: 20 },
    { name: '传说', color: '#ffd700', bgColor: [160,120,0], value: 100, weight: 10 },
];

export const RARITIES_BOSS = [
    ...RARITIES,
    { name: '红色', color: '#ff2222', bgColor: [160,30,30], value: 200, weight: 5 },
];

// ===================== Level Type =====================
export function getLevelType(waveNumber) {
    if (waveNumber === 18) return 'final';
    if (waveNumber === 5 || waveNumber === 11) return 'boss';
    if (waveNumber === 2) return 'mech';
    return 'normal';
}

// ===================== Rarity Picker =====================
export function pickRarityByWeight(rarities) {
    const total = rarities.reduce((s, r) => s + r.weight, 0);
    let roll = Math.random() * total;
    for (const r of rarities) {
        roll -= r.weight;
        if (roll <= 0) return r;
    }
    return rarities[rarities.length - 1];
}

// ===================== Attribute Types =====================
export const ATTR_TYPES = [
    { id: 'atk', label: '攻击力', icon: '⚔', apply: (v) => { STATE.playerStats.atk += v; }, formatValue: (v) => '+' + v },
    { id: 'hp', label: '生命值', icon: '❤', apply: (v) => { STATE.shipHp = Math.min(SHIP_MAX_HP, STATE.shipHp + v); }, formatValue: (v) => '+' + v },
    { id: 'fireRate', label: '射速', icon: '⚡', apply: (v) => { STATE.fireRate += v/100; }, formatValue: (v) => '+' + (v/100).toFixed(1) + 'x' },
    { id: 'multiShot', label: '多重射击', icon: '◎', apply: (v) => { STATE.multiShotChance += v; }, formatValue: (v) => '+' + v + '%' },
    { id: 'blast', label: '爆炸范围', icon: '💥', apply: (v) => { STATE.explosionRadius += v/100; }, formatValue: (v) => '+' + (v/100).toFixed(1) + 'm' },
];