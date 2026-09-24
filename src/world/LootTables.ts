import type { FactionId } from './Factions';

/**
 * What people are carrying when they die, by who they were.
 *
 * Kept as faction tables rather than per-creature lists because that's how it actually reads in
 * the fiction: a Restoration trooper is carrying military kit because the Restoration issues it,
 * not because that particular trooper is special. Creature-specific oddities still go on the
 * definition (`MonsterDef.drops`); this is what they'd have on them either way.
 */
export interface LootEntry {
  defId: string;
  /** 0..1, rolled once. */
  chance: number;
  /** For stackables. Omitted means one. */
  quantity?: readonly [min: number, max: number];
}

export const FACTION_LOOT: Partial<Record<FactionId, readonly LootEntry[]>> = {
  /** Issued kit: they're an army, or say they are. */
  restoration: [
    { defId: 'machete', chance: 0.35 },
    { defId: 'paddedVest', chance: 0.3 },
    { defId: 'medPack', chance: 0.3 },
    { defId: 'caps', chance: 0.7, quantity: [6, 20] },
  ],

  /** Whatever they found and sharpened. Rich in nothing but nerve. */
  wake: [
    { defId: 'pipeWrench', chance: 0.3 },
    { defId: 'scrapSpear', chance: 0.2 },
    { defId: 'throwingKnife', chance: 0.2 },
    { defId: 'caps', chance: 0.5, quantity: [2, 10] },
  ],

  /** They deal in the stuff, so they're carrying some of it — and the takings. */
  reclamation: [
    { defId: 'dart', chance: 0.4, quantity: [2, 5] },
    { defId: 'pipeWrench', chance: 0.25 },
    { defId: 'caps', chance: 0.85, quantity: [10, 30] },
  ],

  /** They give everything away. Medicine and almost no money, which is the point of them. */
  vigil: [
    { defId: 'medPack', chance: 0.65 },
    { defId: 'caps', chance: 0.25, quantity: [1, 5] },
  ],

  settlers: [
    { defId: 'caps', chance: 0.45, quantity: [1, 8] },
    { defId: 'medPack', chance: 0.15 },
  ],
};

/** How often a body is left behind at all, rather than the fight simply ending. */
export const CORPSE_CHANCE = 0.6;
