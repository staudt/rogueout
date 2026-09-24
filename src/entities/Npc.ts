import type { Entity } from './Entity';
import { type FactionId } from '../world/Factions';

export interface Npc extends Entity {
  readonly kind: 'npc';
  name: string;
  faction: FactionId;
  dialogue: string;
  /** If present, walking into this NPC opens the named shop instead of just showing dialogue. */
  shopId?: string;
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
  const npc: Npc = { id, kind: 'npc', name, glyph, fg, x, y, dialogue, faction };
  if (shopId) npc.shopId = shopId;
  return npc;
}
