import { randomInt, type RNG } from '../utils/RNG';

/** SPECIAL -> combat math. Pure, tunable, no RNG except where explicitly passed in. */

export function computeMaxHP(endurance: number): number {
  return 10 + endurance * 3;
}

export function computeAC(agility: number, armorValue: number = 0): number {
  return 10 + Math.floor(agility / 2) + armorValue;
}

export function computeToHitChance(attackerAgility: number, accuracyBonus: number, targetAC: number): number {
  const raw = 50 + (attackerAgility - 5) * 5 + accuracyBonus - targetAC * 2;
  return Math.max(5, Math.min(95, raw));
}

export function rollDamage(
  rng: RNG,
  minDamage: number,
  maxDamage: number,
  attackerStrength: number,
  damageResist: number = 0,
): number {
  const base = randomInt(rng, minDamage, maxDamage) + Math.floor(attackerStrength / 3) - damageResist;
  return Math.max(1, base);
}

export function computeCarryCapacity(strength: number): number {
  return 50 + strength * 10;
}

export function computeFovRadius(perception: number): number {
  return 6 + Math.floor(perception / 3);
}
