/**
 * Who gets along with whom.
 *
 * The important design decision here: **standings are relations between factions, not a
 * creature's attitude toward the player.** A creature carrying "hostile to you" can never produce
 * a battle without someone scripting one. Factions that hate *each other* mean a war is content
 * placement — drop two opposed groups in a region and let the AI run. Everything else (quests
 * shifting standing, picking a side, looting the aftermath) hangs off this table.
 */

export type FactionId = string;

export type Standing = 'hostile' | 'neutral' | 'friendly';

export interface FactionDef {
  id: FactionId;
  name: string;
  /** Used to mark creatures on screen when their standing toward the player is worth showing. */
  color: string;
}

export const FACTIONS: Record<FactionId, FactionDef> = {
  player: { id: 'player', name: 'you', color: '#ffffff' },
  townsfolk: { id: 'townsfolk', name: 'the townsfolk', color: '#ffcc66' },
  raiders: { id: 'raiders', name: 'the raiders', color: '#e05252' },
  vermin: { id: 'vermin', name: 'vermin', color: '#c08552' },
};

/** The default for any pair not listed: most things have no opinion about most things. */
const DEFAULT_STANDING: Standing = 'neutral';

/**
 * Only the pairs that aren't neutral, listed once each — `standingBetween` is symmetric, so
 * adding a row here sets it in both directions. Raiders hating townsfolk is what makes an
 * unscripted fight possible the moment both are on the same map.
 */
const STANDINGS: ReadonlyArray<readonly [FactionId, FactionId, Standing]> = [
  ['player', 'raiders', 'hostile'],
  ['player', 'vermin', 'hostile'],
  ['townsfolk', 'raiders', 'hostile'],
  ['townsfolk', 'vermin', 'hostile'],
  ['player', 'townsfolk', 'friendly'],
];

const lookup = new Map<string, Standing>();
for (const [a, b, standing] of STANDINGS) {
  lookup.set(pairKey(a, b), standing);
}

function pairKey(a: FactionId, b: FactionId): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function standingBetween(a: FactionId, b: FactionId): Standing {
  if (a === b) return 'friendly'; // a faction does not fight itself
  return lookup.get(pairKey(a, b)) ?? DEFAULT_STANDING;
}

export function areHostile(a: FactionId, b: FactionId): boolean {
  return standingBetween(a, b) === 'hostile';
}

export const PLAYER_FACTION: FactionId = 'player';
