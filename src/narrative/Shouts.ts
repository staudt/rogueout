import { FACTIONS, type FactionId } from '../world/Factions';
import { pickPhrase } from './Narration';
import type { Point } from '../utils/geometry';

/**
 * What people shout when they see the enemy.
 *
 * "The Wake raider shouts a warning." told you nothing and wore out in three fights. A shout is a
 * good place to put a faction's character, because it's the only line most of them ever get: the
 * Restoration bark orders they have no authority to give, the Wake are simply delighted, the
 * Reclamation are worried about their stock, and the Vigil are begging everyone to stop.
 *
 * When the shouter has someone specific in their sights the line names them, because a directed
 * challenge reads completely differently from a general alarm.
 */

const DIRECTED: Partial<Record<FactionId, readonly string[]>> = {
  restoration: [
    '"{enemy}! On the road! Form up!"',
    '"You there — stand where you are!"',
    '"Contact — {enemy}, in the open!"',
    '"By order of the Restoration, put it down!"',
  ],
  wake: [
    '"Company!" Someone starts laughing and does not stop.',
    'A ragged cheer goes up.',
    '"Look what the road brought us!"',
    'Somebody whoops, high and delighted.',
  ],
  reclamation: [
    '"Trouble — get the crates in!"',
    '"{enemy}. We are not paid for this."',
    '"Hands off the stock!"',
  ],
  vigil: ['"Stop — there is no need for this!"', '"Please. Put it down."', '"Someone help them!"'],
  settlers: ['"{enemy}! Get inside!"', '"They are coming — bar it!"', '"Run!"'],
};

const GENERIC: readonly string[] = ['Someone shouts.', 'A shout goes up.', 'Somebody calls out.'];

/** What the player hears when they can see who's shouting. */
export function narrateShout(shouterFaction: FactionId, enemyFaction: FactionId, seed: number): string {
  const table = DIRECTED[shouterFaction];
  if (!table) return pickPhrase(GENERIC, seed);

  const enemy = FACTIONS[enemyFaction]?.name ?? 'trouble';
  // Faction names read as "the Wake"; capitalised mid-shout it would look like a surname.
  return pickPhrase(table, seed).replace(/\{enemy\}/g, enemy);
}

/**
 * What the player hears when they *can't*. Sound carries further than sight, so a fight over the
 * ridge should register as a fight over the ridge — not as blow-by-blow they have no way to see.
 */
export function narrateDistantShout(from: Point, to: Point, seed: number): string {
  // The phrases are whole sentences on their own; the direction replaces the full stop.
  const voice = pickPhrase(GENERIC, seed).replace(/\.$/, '');
  return `${voice} ${towards(from, to)}`;
}

export function narrateDistantFighting(from: Point, to: Point): string {
  return `You hear fighting ${towards(from, to)}`;
}

/** "to the north-east." — rough is right; you're going on noise. */
export function towards(from: Point, to: Point): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const vertical = Math.abs(dy) > Math.abs(dx) / 2 ? (dy < 0 ? 'north' : 'south') : '';
  const horizontal = Math.abs(dx) > Math.abs(dy) / 2 ? (dx < 0 ? 'west' : 'east') : '';
  const compass = [vertical, horizontal].filter(Boolean).join('-');
  return compass ? `to the ${compass}.` : 'nearby.';
}
