import type { Combatant } from './Combatant';
import type { Monster } from '../entities/Monster';
import type { RegionState } from '../engine/GameState';
import { MONSTERS } from '../entities/MonsterData';
import { createItem } from '../items/Item';
import type { RNG } from '../utils/RNG';

export function isDead(combatant: Combatant): boolean {
  return combatant.hp <= 0;
}

/**
 * Leaves behind whatever the creature was carrying.
 *
 * Drops are per-creature data (`MonsterDef.drops`), so a raider can hand you the machete that
 * was just being used on you while a lizard leaves nothing. That's what makes fighting people
 * worth the risk, and it's the early game's only source of gear besides the shop.
 *
 * Items land on the creature's own tile; several drops stack on the same tile, which the ground
 * item list already allows.
 */
export function dropLoot(monster: Monster, region: RegionState, rng: RNG): void {
  const drops = MONSTERS[monster.defId]?.drops;
  if (!drops) return;

  for (const drop of drops) {
    if (rng() >= drop.chance) continue;
    region.groundItems.push({ item: createItem(drop.defId), x: monster.x, y: monster.y });
  }
}
