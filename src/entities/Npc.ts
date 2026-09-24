import type { Entity } from './Entity';
import { type FactionId } from '../world/Factions';

export interface Npc extends Entity {
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
}

export function createNpc(
  id: string,
  name: string,
  glyph: string,
  fg: string,
  x: number,
  y: number,
  dialogue: string,
  shopId?: string,
  faction: FactionId = 'townsfolk',
): Npc {
  const npc: Npc = { id, kind: 'npc', name, glyph, fg, x, y, dialogue, faction, home: { x, y } };
  if (shopId) npc.shopId = shopId;
  return npc;
}
