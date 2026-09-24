import type { DamagePacket, Resistances } from '../combat/DamageTypes';

export type MonsterBehavior = 'wander' | 'chase';

export interface MonsterDef {
  id: string;
  name: string;
  glyph: string;
  fg: string;
  maxHp: number;
  ac: number;
  strength: number;
  agility: number;
  accuracyBonus: number;
  damage: DamagePacket[];
  /** What it's made of and what it has: drives resistances, decapitation, telepathy, and more. */
  tags: string[];
  resist?: Resistances;
  behavior: MonsterBehavior;
  /** Simple distance-check "sight" radius for v1 AI (full FOV-based awareness is a roadmap item). */
  awarenessRadius: number;
}

export const MONSTERS: Record<string, MonsterDef> = {
  rat: {
    id: 'rat',
    name: 'giant rat',
    glyph: 'r',
    fg: '#c08552',
    maxHp: 6,
    ac: 10,
    strength: 3,
    agility: 6,
    accuracyBonus: 0,
    damage: [{ type: 'pierce', min: 1, max: 2 }], // teeth
    tags: ['living', 'beast', 'head', 'legs'],
    behavior: 'chase',
    awarenessRadius: 5,
  },
  goblin: {
    id: 'goblin',
    name: 'goblin',
    glyph: 'g',
    fg: '#4caf50',
    maxHp: 12,
    ac: 11,
    strength: 6,
    agility: 5,
    accuracyBonus: 1,
    damage: [{ type: 'cut', min: 2, max: 4 }], // a crude blade
    tags: ['living', 'humanoid', 'head', 'arms', 'legs', 'sentient'],
    resist: { cut: 0.15 }, // scraps of armour, lashed on
    behavior: 'chase',
    awarenessRadius: 6,
  },

  /**
   * The case the tag system exists for. It has no head to take off, no mind to read, and nothing
   * inside worth puncturing — so a spear is useless against it and a torch is devastating. None
   * of that is special-cased anywhere; it all falls out of tags and resistances.
   */
  mold: {
    id: 'mold',
    name: 'crawling mold',
    glyph: 'm',
    fg: '#8bc34a',
    maxHp: 10,
    ac: 8,
    strength: 2,
    agility: 1,
    accuracyBonus: 0,
    damage: [{ type: 'acid', min: 1, max: 3 }],
    tags: ['living', 'mindless', 'amorphous'],
    resist: { pierce: 1, cut: 0.5, bludgeon: 0.25, fire: -1 },
    behavior: 'wander',
    awarenessRadius: 1,
  },
};
