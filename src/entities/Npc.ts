import type { Entity } from './Entity';
import type { Investigation } from '../ai/Actors';
import type { Combatant } from '../combat/Combatant';
import { type FactionId } from '../world/Factions';
import { NORMAL_SPEED, DEFAULT_WEIGHT } from '../config/constants';
import { ITEMS } from '../items/ItemData';

/**
 * A person: someone you can talk to, trade with — and, if you insist, fight.
 *
 * NPCs are full `Combatant`s rather than scenery. That isn't for the player's benefit so much as
 * the world's: a raider can only sack a settlement if the settlers are things that can be
 * attacked. Until they were, "The Wake is hostile to the townsfolk" was a line in a table that
 * nothing could act on.
 *
 * Civilians are weak on purpose. Hitting one should feel like a decision, not a fight.
 */
export interface Npc extends Entity, Combatant {
  readonly kind: 'npc';
  name: string;
  faction: FactionId;
  dialogue: string;
  /** If present, walking into this NPC opens the named shop instead of just showing dialogue. */
  shopId?: string;
  /**
   * How far they'll drift from where they started, going about their day. 0 (the default) keeps
   * them put — a shopkeeper who wanders off from the counter is not a feature.
   */
  wanderRadius?: number;
  /** Where they belong; drift is measured from here, not from wherever they've got to. */
  home?: { x: number; y: number };
  /** Factions this person has personally fallen out with. See Monster.provokedBy. */
  provokedBy: FactionId[];
  /**
   * Won't fight even when wronged: screams, runs, and leaves the answering to someone else.
   * A Vigil almoner is not a soldier, and pretending otherwise makes every faction feel the same.
   */
  timid?: boolean;
  /** A noise they heard, and what it was about. Cleared on arrival (see resolveInvestigation). */
  investigating?: Investigation | null;
  /** Set once they've raised the alarm, so one incident doesn't produce a scream every turn. */
  hasScreamed?: boolean;
  speed: number;
  energy: number;
  weight: number;
  awarenessRadius: number;
}

export interface NpcOptions {
  /** Walking into them opens this shop instead of a conversation. */
  shopId?: string;
  faction?: FactionId;
  /** What they fight with (an ItemData id). Unarmed if omitted. */
  weapon?: string;
  /** See Npc.timid. */
  timid?: boolean;
  /** How far they drift from home while going about their day. */
  wanderRadius?: number;
  hp?: number;
  ac?: number;
}

export function createNpc(
  id: string,
  name: string,
  glyph: string,
  fg: string,
  x: number,
  y: number,
  dialogue: string,
  options: NpcOptions = {},
): Npc {
  const { shopId, faction = 'restoration', weapon, timid, wanderRadius, hp = 10, ac = 11 } = options;
  const weaponDef = weapon ? ITEMS[weapon] : undefined;
  const npc: Npc = {
    id,
    kind: 'npc',
    name,
    glyph,
    fg,
    x,
    y,
    dialogue,
    faction,
    home: { x, y },

    // A civilian: enough to be worth robbing, not enough to be a fight. Someone carrying
    // something fights with it, which is most of what separates a shopkeeper from a corporal.
    hp,
    maxHp: hp,
    ac,
    strength: 4,
    agility: 5,
    accuracyBonus: weaponDef?.accuracyBonus ?? 0,
    damage: weaponDef?.damage?.map((packet) => ({ ...packet })) ?? [{ type: 'bludgeon', min: 1, max: 3 }],
    resistances: {},
    tags: ['living', 'humanoid', 'head', 'arms', 'legs', 'sentient'],

    provokedBy: [],
    speed: NORMAL_SPEED,
    energy: 0,
    weight: DEFAULT_WEIGHT,
    awarenessRadius: 7,
  };
  if (shopId) npc.shopId = shopId;
  if (timid) npc.timid = true;
  if (wanderRadius !== undefined) npc.wanderRadius = wanderRadius;
  return npc;
}
