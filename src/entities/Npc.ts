import type { Entity } from './Entity';

export interface Npc extends Entity {
  readonly kind: 'npc';
  name: string;
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
): Npc {
  const npc: Npc = { id, kind: 'npc', name, glyph, fg, x, y, dialogue };
  if (shopId) npc.shopId = shopId;
  return npc;
}
