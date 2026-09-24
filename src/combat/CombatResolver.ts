import { randomInt, type RNG } from '../utils/RNG';
import type { Combatant } from './Combatant';
import { computeToHitChance, rollDamage } from './CombatFormulas';

export interface AttackResult {
  hit: boolean;
  damage: number;
}

/** Resolves one melee attack: rolls to-hit, then damage on a hit. Mutates defender.hp in place. */
export function resolveMeleeAttack(rng: RNG, attacker: Combatant, defender: Combatant): AttackResult {
  const toHitChance = computeToHitChance(attacker.agility, attacker.accuracyBonus, defender.ac);
  const roll = randomInt(rng, 1, 100);

  if (roll > toHitChance) {
    return { hit: false, damage: 0 };
  }

  const damage = rollDamage(rng, attacker.minDamage, attacker.maxDamage, attacker.strength);
  defender.hp = Math.max(0, defender.hp - damage);
  return { hit: true, damage };
}
