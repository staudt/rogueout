import type { Monster } from '../entities/Monster';
import type { Npc } from '../entities/Npc';
import type { Player } from '../entities/Player';
import type { GameState, RegionState } from '../engine/GameState';
import { MONSTERS } from '../entities/MonsterData';
import { chebyshevDistance } from '../utils/geometry';
import type { FactionId } from '../world/Factions';
import { ALERT_RADIUS } from '../config/constants';

/**
 * Everything that can be hit, hunted, or take a turn — the player, creatures, and people.
 *
 * Keeping these under one type is what lets the world act on its own standings: a raider hunting
 * "the nearest thing my faction is hostile to" finds a shopkeeper exactly as readily as it finds
 * you, which is the difference between a faction table and a faction war.
 */
export type Actor = Monster | Npc | Player;

/** Actors that can hold a grudge. The player's grudges are the player's business. */
export type Provokable = Monster | Npc;

export function isProvokable(actor: Actor): actor is Provokable {
  return actor.kind === 'monster' || actor.kind === 'npc';
}

/**
 * How to refer to something mid-sentence: "the giant rat", but "Corporal Vance".
 *
 * Creatures are a kind; people are a person. Phrase tables therefore hold `{target}` rather than
 * `the {target}`, and the caller decides — otherwise every line reads "the Corporal Vance".
 */
export function actorLabel(actor: Actor): string {
  if (actor.kind === 'npc') return actor.name; // a proper name takes no article
  if (actor.kind === 'player') return 'you';
  return `the ${actorName(actor)}`;
}

export function actorName(actor: Actor): string {
  if (actor.kind === 'monster') return MONSTERS[actor.defId]?.name ?? 'creature';
  if (actor.kind === 'npc') return actor.name;
  return 'you';
}

/** Everyone still standing, in one list, with the player included. */
export function livingActors(state: GameState, region: RegionState): Actor[] {
  return [
    state.player,
    ...region.monsters.filter((m) => m.hp > 0),
    ...region.npcs.filter((n) => n.hp > 0),
  ];
}

export function provoke(target: Provokable, faction: FactionId): boolean {
  if (target.provokedBy.includes(faction)) return false;
  target.provokedBy.push(faction);
  return true;
}

/**
 * Word gets around. When someone is attacked, their nearby faction-mates take it personally too.
 *
 * This is what stops a settlement being a queue: hit one Restoration trooper in the street and
 * the rest don't stand about waiting their turn to notice. Scoped by distance rather than applied
 * faction-wide, so a grudge stays local to the people who could plausibly have seen it — attacking
 * a lone scout in the desert doesn't make you an enemy of everyone wearing the same colours.
 */
export function alertAllies(
  region: RegionState,
  victim: Provokable,
  offender: FactionId,
  radius: number = ALERT_RADIUS,
): number {
  let alerted = 0;

  for (const ally of [...region.monsters, ...region.npcs]) {
    if (ally === victim || ally.hp <= 0) continue;
    if (ally.faction !== victim.faction) continue;
    if (chebyshevDistance(ally, victim) > radius) continue;
    if (provoke(ally, offender)) alerted++;
  }

  return alerted;
}

/** Removes a dead actor from whichever list it lives in. */
export function removeActor(region: RegionState, actor: Actor): void {
  if (actor.kind === 'monster') region.monsters = region.monsters.filter((m) => m !== actor);
  else if (actor.kind === 'npc') region.npcs = region.npcs.filter((n) => n !== actor);
}
