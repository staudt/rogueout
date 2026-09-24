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

/**
 * Flat, untyped damage. Superseded by rollTypedDamage (see combat/DamageTypes.ts) for anything
 * that can be resisted; kept because it's the one place the raw min/max/Strength curve is
 * expressed, and it stays useful for effects that bypass armour entirely.
 */
export function rollDamage(rng: RNG, minDamage: number, maxDamage: number, attackerStrength: number): number {
  return Math.max(1, randomInt(rng, minDamage, maxDamage) + Math.floor(attackerStrength / 3));
}

export function computeCarryCapacity(strength: number): number {
  return 50 + strength * 10;
}

export function computeFovRadius(perception: number): number {
  return 6 + Math.floor(perception / 3);
}

/**
 * How far off a *creature* can be picked out, as opposed to bare terrain.
 *
 * Daylight would otherwise reveal every monster on the map from the first turn, which both kills
 * the point of exploring and quietly disables the danger-interrupt on auto-travel (nothing is
 * ever *newly* seen). Seeing a long way and being able to tell what that speck is are different
 * problems — and this is the job Perception keeps out in the open.
 */
export function computeSpotRadius(perception: number): number {
  return computeFovRadius(perception) * 2;
}
