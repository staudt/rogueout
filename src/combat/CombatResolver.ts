import type { RNG } from '../utils/RNG';
import { randomInt } from '../utils/RNG';
import type { Combatant } from './Combatant';
import { computeToHitChance } from './CombatFormulas';
import { dominantType, rollTypedDamage, type DamageType } from './DamageTypes';

/** Half the blow turned away is enough to be worth a word in the log. */
const RESISTED_ENOUGH_TO_MENTION = 0.4;

export interface AttackResult {
  hit: boolean;
  damage: number;
  /** Which damage type did the most, for the log. Null on a miss or a fully resisted blow. */
  type: DamageType | null;
  /** The blow landed and the defender didn't care: fully resisted, not merely reduced. */
  shrugged: boolean;
  /** Most of the blow was turned. The player is using the wrong tool and should hear about it. */
  resisted: boolean;
}

/** Resolves one melee attack: rolls to-hit, then typed damage. Mutates defender.hp in place. */
export function resolveMeleeAttack(rng: RNG, attacker: Combatant, defender: Combatant): AttackResult {
  const toHitChance = computeToHitChance(attacker.agility, attacker.accuracyBonus, defender.ac);
  const roll = randomInt(rng, 1, 100);

  if (roll > toHitChance) {
    return { hit: false, damage: 0, type: null, shrugged: false, resisted: false };
  }

  const damage = rollTypedDamage(rng, attacker.damage, attacker.strength, defender.resistances);
  defender.hp = Math.max(0, defender.hp - damage.total);

  return {
    hit: true,
    damage: damage.total,
    type: dominantType(damage),
    shrugged: damage.shrugged,
    resisted: !damage.shrugged && damage.resistedFraction >= RESISTED_ENOUGH_TO_MENTION,
  };
}
