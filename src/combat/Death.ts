import type { Combatant } from './Combatant';
import type { RegionState } from '../engine/GameState';
import { MONSTERS } from '../entities/MonsterData';
import { createItem } from '../items/Item';
import { ITEMS } from '../items/ItemData';
import { CORPSE_CHANCE, FACTION_LOOT, type LootEntry } from '../world/LootTables';
import { actorLabel, type Provokable } from '../ai/Actors';
import { randomInt, type RNG } from '../utils/RNG';

export function isDead(combatant: Combatant): boolean {
  return combatant.hp <= 0;
}

/**
 * Everything a body leaves behind: what they were holding, what their people carry, and — often
 * enough — the body itself.
 *
 * Gear they were actually using drops outright rather than on a roll. Being killed by someone
 * holding a machete and finding no machete is the kind of small dishonesty that makes a world
 * feel like a slot machine.
 */
export function dropLoot(actor: Provokable, region: RegionState, rng: RNG, killedBy?: string): void {
  for (const defId of carriedGear(actor)) {
    region.groundItems.push({ item: createItem(defId), x: actor.x, y: actor.y });
  }

  const table: LootEntry[] = [
    ...(actor.kind === 'monster' ? (MONSTERS[actor.defId]?.drops ?? []) : []),
    ...(FACTION_LOOT[actor.faction] ?? []),
  ];

  for (const entry of table) {
    if (rng() >= entry.chance) continue;
    const quantity = entry.quantity ? randomInt(rng, entry.quantity[0], entry.quantity[1]) : 1;
    region.groundItems.push({ item: createItem(entry.defId, quantity), x: actor.x, y: actor.y });
  }

  if (killedBy && rng() < CORPSE_CHANCE) leaveCorpse(actor, region, killedBy);
}

/** What they were visibly using, which always drops. */
function carriedGear(actor: Provokable): string[] {
  const gear: string[] = [];
  if (actor.kind === 'npc') {
    if (actor.weaponDefId) gear.push(actor.weaponDefId);
    if (actor.armorDefId) gear.push(actor.armorDefId);
  }
  return gear.filter((defId) => ITEMS[defId] !== undefined);
}

/**
 * Leaves the body, tagged with who it was and whose fault it was.
 *
 * It has no use yet — eating is a roadmap item — but it isn't decoration either: their people
 * react to finding it, which turns a killing done in private into something that can still be
 * discovered later.
 */
function leaveCorpse(actor: Provokable, region: RegionState, killedBy: string): void {
  const item = createItem('corpse');
  item.corpse = { name: actorLabel(actor), faction: actor.faction, killedBy };
  region.groundItems.push({ item, x: actor.x, y: actor.y });
}
