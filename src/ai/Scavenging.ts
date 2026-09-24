import type { GameState, RegionState } from '../engine/GameState';
import { addMessage } from '../engine/GameState';
import { ITEMS } from '../items/ItemData';
import type { Item } from '../items/Item';
import { MONSTERS } from '../entities/MonsterData';
import { isVisible } from '../fov/VisibilityState';
import { actorLabel, type Provokable } from './Actors';

/**
 * Picking things up off the ground, and using them.
 *
 * The Wake are scavengers by definition, and it matters mechanically rather than as flavour: a
 * raider who has been through a battlefield is carrying the battlefield, so killing one late is
 * worth more than killing one early. It also closes a loop that otherwise leaks — every weapon
 * dropped in a fight used to lie there forever.
 */

export function scavenges(actor: Provokable): boolean {
  return actor.kind === 'monster' && (MONSTERS[actor.defId]?.scavenges ?? false);
}

/** Not worth carrying: money you can't spend, and bodies. */
function worthTaking(item: Item): boolean {
  const def = ITEMS[item.defId];
  return def !== undefined && def.category !== 'corpse';
}

/**
 * Takes whatever is underfoot. Returns true if that used up the action — picking something up is
 * a turn's work, which is also what stops a scavenger hoovering a battlefield in one step.
 */
export function scavengeHere(state: GameState, region: RegionState, actor: Provokable): boolean {
  const index = region.groundItems.findIndex((g) => g.x === actor.x && g.y === actor.y && worthTaking(g.item));
  if (index === -1) return false;

  const [ground] = region.groundItems.splice(index, 1);
  if (!ground) return false;

  actor.carried = [...(actor.carried ?? []), ground.item];
  equipIfBetter(actor, ground.item);

  if (isVisible(region.visibility, actor.x, actor.y)) {
    const name = ITEMS[ground.item.defId]?.name ?? 'something';
    addMessage(state, `${actorLabel(actor)} picks up the ${name}.`.replace(/^./, (c) => c.toUpperCase()));
  }

  return true;
}

/**
 * Uses a find if it beats what they're swinging now.
 *
 * Compared on best-case damage, which is crude but honest: a scavenger judging a weapon by
 * hefting it is exactly that crude, and it means the machete you dropped can come back at you.
 */
function equipIfBetter(actor: Provokable, item: Item): void {
  const def = ITEMS[item.defId];
  if (!def?.damage || def.damage.length === 0) return;

  const best = (packets: readonly { max: number }[]) => packets.reduce((sum, p) => sum + p.max, 0);
  if (best(def.damage) <= best(actor.damage)) return;

  actor.damage = def.damage.map((packet) => ({ ...packet }));
  actor.accuracyBonus = def.accuracyBonus ?? actor.accuracyBonus;
}

/** Where a scavenger would go next, if anywhere: the nearest thing worth picking up. */
export function nearestLoot(region: RegionState, actor: Provokable, radius: number): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestDistance = radius;

  for (const ground of region.groundItems) {
    if (!worthTaking(ground.item)) continue;
    const distance = Math.max(Math.abs(ground.x - actor.x), Math.abs(ground.y - actor.y));
    if (distance <= bestDistance) {
      bestDistance = distance;
      best = { x: ground.x, y: ground.y };
    }
  }

  return best;
}
