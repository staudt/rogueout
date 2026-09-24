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
  /** One line on what they want — the shape a quest for them would take. */
  creed?: string;
  /** Used to mark creatures on screen when their standing toward the player is worth showing. */
  color: string;
}

export const FACTIONS: Record<FactionId, FactionDef> = {
  player: { id: 'player', name: 'you', color: '#ffffff' },

  restoration: {
    id: 'restoration',
    name: 'the Restoration',
    creed: 'Order will be restored, by whoever is still holding the rifle.',
    color: '#c8b88a',
  },
  wake: {
    id: 'wake',
    name: 'the Wake',
    creed: 'The world is over. They are throwing it a funeral, and enjoying themselves.',
    color: '#d06060',
  },
  reclamation: {
    id: 'reclamation',
    name: 'the Reclamation',
    creed: 'Everything made before is worth more than anything made since. Bring it back.',
    color: '#7fb3d5',
  },
  vigil: {
    id: 'vigil',
    name: 'the Vigil',
    creed: 'Find water, clean it, give it away. Sit with whoever is dying.',
    color: '#9fd3e0',
  },

  // Not politics, ecology: things that leave you alone, and things that hunt.
  wildlife: { id: 'wildlife', name: 'wildlife', color: '#d2b48c' },
  predators: { id: 'predators', name: 'predators', color: '#b8860b' },
  ghouls: { id: 'ghouls', name: 'the feral', color: '#7a8f5a' },
};

/** The default for any pair not listed: most things have no opinion about most things. */
const DEFAULT_STANDING: Standing = 'neutral';

/**
 * Only the pairs that aren't neutral, listed once each — `standingBetween` is symmetric, so
 * adding a row here sets it in both directions.
 *
 * Deliberate non-entries worth knowing:
 * - **Restoration/Reclamation is neutral**, not hostile: a cold rivalry between two organisations
 *   with confusingly similar names, not open war. Open war would mean they could never share a
 *   settlement, and the player's first town has both.
 * - **Wake/Vigil is neutral**: the Wake preys on everyone, but the Vigil patches up anyone who
 *   comes to them, raiders included, so the Wake leaves them be. It costs the Wake nothing.
 * - **Wake/Reclamation is neutral**: the Wake needs somebody to sell loot to.
 * - **Wildlife is hostile to nobody.** A creature that hunts belongs to `predators` instead;
 *   that's the whole difference between a skink and a dune runner.
 */
const STANDINGS: ReadonlyArray<readonly [FactionId, FactionId, Standing]> = [
  // The feral attack everything that still has a pulse.
  ['ghouls', 'player', 'hostile'],
  ['ghouls', 'restoration', 'hostile'],
  ['ghouls', 'wake', 'hostile'],
  ['ghouls', 'reclamation', 'hostile'],
  ['ghouls', 'vigil', 'hostile'],
  ['ghouls', 'wildlife', 'hostile'],
  ['ghouls', 'predators', 'hostile'],

  // Predators hunt people; they don't care which people.
  ['predators', 'player', 'hostile'],
  ['predators', 'restoration', 'hostile'],
  ['predators', 'wake', 'hostile'],
  ['predators', 'reclamation', 'hostile'],
  ['predators', 'vigil', 'hostile'],

  // The war that makes the desert dangerous.
  ['restoration', 'wake', 'hostile'],
  ['wake', 'player', 'hostile'],

  // The one faction that is glad to see anybody.
  ['vigil', 'player', 'friendly'],
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
