import type { Monster } from '../entities/Monster';
import type { Npc } from '../entities/Npc';
import type { Player } from '../entities/Player';
import type { GameState, RegionState } from '../engine/GameState';
import { addMessage } from '../engine/GameState';
import { MONSTERS } from '../entities/MonsterData';
import { chebyshevDistance, type Point } from '../utils/geometry';
import { FACTIONS, standingBetween, type FactionId } from '../world/Factions';
import { ALERT_RADIUS, ALARM_RADIUS } from '../config/constants';

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
 * Word gets around. When someone is attacked, those who'd take their side take it personally too.
 *
 * "Their side" is anyone their faction is *friendly* with, not merely their own colours — which
 * is how the Reclamation ends up defending the Vigil without either of them being told to.
 * Scoped by distance rather than applied faction-wide, so a grudge stays local to the people who
 * could plausibly have seen it: attacking a lone scout in the desert doesn't make you an enemy of
 * everyone wearing the same badge.
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
    if (ally.faction === offender) continue;
    if (standingBetween(ally.faction, victim.faction) !== 'friendly') continue;
    if (chebyshevDistance(ally, victim) > radius) continue;
    if (provoke(ally, offender)) alerted++;
  }

  return alerted;
}

/**
 * A shout, and what everyone within earshot makes of it.
 *
 * Three reactions, which is what makes a settlement feel populated rather than scripted:
 * - **Those on the screamer's side** know whose voice it was and whose fault it is, so they turn
 *   on the offender without needing to have seen anything.
 * - **Everyone else** doesn't know what happened — only that something did. They go and look,
 *   and what they do when they arrive depends on what they find.
 * - **The offender's own faction** hears it and doesn't care.
 *
 * Distance is the only gate. Walls don't stop sound, which is deliberate: hearing round a corner
 * is the point of a scream.
 */
export function raiseAlarm(
  region: RegionState,
  at: Point,
  screamerFaction: FactionId,
  offender: FactionId,
  radius: number = ALARM_RADIUS,
): void {
  // Carried with the errand so that whoever turns up knows what they're looking at. Deciding on
  // arrival rather than from earshot is the difference between a witness and a telepath.
  const context = { x: at.x, y: at.y, offender, victimFaction: screamerFaction };
  for (const listener of [...region.monsters, ...region.npcs]) {
    if (listener.hp <= 0) continue;
    if (listener.faction === offender) continue;
    if (chebyshevDistance(listener, at) > radius) continue;

    if (standingBetween(listener.faction, screamerFaction) === 'friendly') {
      provoke(listener, offender);
      listener.investigating = { ...context };
    } else if (!listener.investigating) {
      // Curious, not committed. They'll form an opinion when they get there.
      listener.investigating = { ...context };
    }
  }
}

/** Whether this actor is the sort to shout when something happens to it. */
export function canRaiseAlarm(actor: Provokable): boolean {
  return actor.tags.includes('sentient');
}

/** Removes a dead actor from whichever list it lives in. */
export function removeActor(region: RegionState, actor: Actor): void {
  if (actor.kind === 'monster') region.monsters = region.monsters.filter((m) => m !== actor);
  else if (actor.kind === 'npc') region.npcs = region.npcs.filter((n) => n !== actor);
}

/**
 * Everything that follows from the player starting on someone: they take it personally, anyone
 * on their side does too, and — if they have a voice — they use it.
 *
 * One place, because it has to happen identically whether the player used a blade, a boot or a
 * thrown bottle, and forgetting one of those is how a world stops feeling consistent.
 */
export function reactToAttack(
  state: GameState,
  region: RegionState,
  victim: Provokable,
  offender: FactionId,
): void {
  const firstTime = provoke(victim, offender);
  if (!firstTime) return;

  alertAllies(region, victim, offender);

  if (!canRaiseAlarm(victim) || victim.hasScreamed) return;
  victim.hasScreamed = true;
  raiseAlarm(region, victim, victim.faction, offender);

  if (chebyshevDistance(state.player, victim) <= ALARM_RADIUS) {
    addMessage(state, `${actorLabel(victim)} shouts for help.`.replace(/^./, (c) => c.toUpperCase()));
  }
}

/**
 * What a witness makes of the scene once they reach it.
 *
 * Most people look, find nothing that concerns them, and go back to what they were doing. An
 * order-keeping faction is different: someone they have no quarrel with was attacked in front of
 * them, and dealing with that is the entire claim they make about themselves.
 *
 * Returns true if they took it up, so the caller can say so.
 */
export function resolveInvestigation(actor: Provokable): boolean {
  const scene = actor.investigating;
  actor.investigating = null;
  if (!scene?.offender || !scene.victimFaction) return false;

  if (!FACTIONS[actor.faction]?.keepsOrder) return false;
  // Not a crime if the victim was already an enemy, and not their business if the culprit is a friend.
  if (standingBetween(actor.faction, scene.victimFaction) === 'hostile') return false;
  if (standingBetween(actor.faction, scene.offender) === 'friendly') return false;

  return provoke(actor, scene.offender);
}

/** A noise worth walking to, and enough context to judge it on arrival. */
export interface Investigation {
  x: number;
  y: number;
  /** Whose fault it was. */
  offender: FactionId;
  /** Who was on the receiving end. */
  victimFaction: FactionId;
}
