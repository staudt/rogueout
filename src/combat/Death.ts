import type { Combatant } from './Combatant';

export function isDead(combatant: Combatant): boolean {
  return combatant.hp <= 0;
}
