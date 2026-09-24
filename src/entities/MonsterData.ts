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
  minDamage: number;
  maxDamage: number;
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
    minDamage: 1,
    maxDamage: 2,
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
    minDamage: 2,
    maxDamage: 4,
    behavior: 'chase',
    awarenessRadius: 6,
  },
};
