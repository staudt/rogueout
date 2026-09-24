import type { DamagePacket, Resistances } from '../combat/DamageTypes';
import type { FactionId } from '../world/Factions';

export type MonsterBehavior = 'wander' | 'chase' | 'flee';

export interface MonsterDrop {
  defId: string;
  /** 0..1. Rolled once on death. */
  chance: number;
}

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
  faction: FactionId;
  /**
   * Movement points banked per player turn; NORMAL_SPEED (12) is ordinary. Higher means extra
   * actions — a creature at 24 moves twice while you move once, and hits you twice between your
   * own swings. Omitted means normal.
   */
  speed?: number;
  behavior: MonsterBehavior;
  /** Simple distance-check "sight" radius for v1 AI (full FOV-based awareness is a roadmap item). */
  awarenessRadius: number;
  /** What it leaves behind. Humans carry their gear; animals don't.  */
  drops?: MonsterDrop[];
  /**
   * Roughly kilograms. Only knockback reads it: a kicked skink tumbles, a kicked trooper takes
   * one step back, and something heavy enough doesn't move at all. Omitted means human-ish.
   */
  weight?: number;
}

/**
 * The early-game bestiary. Each entry is meant to teach one thing, so the table doubles as a
 * difficulty curve: something free, something that ignores you, something your sword is wrong
 * for, something faster than you, and something that fights back with gear worth taking.
 */
export const MONSTERS: Record<string, MonsterDef> = {
  dustRat: {
    id: 'dustRat',
    weight: 4,
    name: 'dust rat',
    glyph: 'r',
    fg: '#c08552',
    maxHp: 6,
    ac: 10,
    strength: 3,
    agility: 6,
    accuracyBonus: 0,
    damage: [{ type: 'pierce', min: 1, max: 2 }], // teeth
    tags: ['living', 'beast', 'head', 'legs'],
    faction: 'predators',
    behavior: 'chase',
    awarenessRadius: 5,
  },

  /** Teaches that not everything out here is a fight. Quick, and runs rather than swings. */
  sandSkink: {
    id: 'sandSkink',
    weight: 3,
    name: 'sand skink',
    glyph: 'l',
    fg: '#d2b48c',
    maxHp: 4,
    ac: 13,
    strength: 1,
    agility: 9,
    accuracyBonus: 0,
    damage: [{ type: 'pierce', min: 1, max: 1 }],
    tags: ['living', 'beast', 'head', 'legs'],
    faction: 'wildlife',
    speed: 18, // hard to corner
    behavior: 'flee',
    awarenessRadius: 7,
  },

  /** The bigger lizard that does hunt you. Fast enough that open ground stops being safe. */
  duneRunner: {
    id: 'duneRunner',
    weight: 45,
    name: 'dune runner',
    glyph: 'L',
    fg: '#b8860b',
    maxHp: 14,
    ac: 12,
    strength: 6,
    agility: 7,
    accuracyBonus: 1,
    damage: [
      { type: 'pierce', min: 2, max: 4 },
      { type: 'cut', min: 1, max: 2 },
    ],
    tags: ['living', 'beast', 'head', 'legs'],
    faction: 'predators',
    speed: 18,
    behavior: 'chase',
    awarenessRadius: 9,
  },

  /**
   * The first time the damage system bites: a carapace turns blades and points alike, and the
   * answer is the blunt weapon you probably didn't buy.
   */
  paleScorpion: {
    id: 'paleScorpion',
    weight: 15,
    name: 'pale scorpion',
    glyph: 's',
    fg: '#e8e0c0',
    maxHp: 11,
    ac: 13,
    strength: 4,
    agility: 4,
    accuracyBonus: 1,
    damage: [
      { type: 'pierce', min: 1, max: 2 },
      { type: 'acid', min: 1, max: 3 },
    ],
    tags: ['living', 'beast', 'legs', 'carapace'],
    resist: { cut: 0.5, pierce: 0.5, bludgeon: -0.25 },
    faction: 'predators',
    behavior: 'chase',
    awarenessRadius: 5,
  },

  /**
   * The mold's lesson at a difficulty that can kill you: nothing inside worth puncturing, so a
   * spear is close to useless — and fire is the answer, once you have any.
   */
  feralGhoul: {
    id: 'feralGhoul',
    weight: 60,
    name: 'feral ghoul',
    glyph: 'g',
    fg: '#7a8f5a',
    maxHp: 15,
    ac: 11,
    strength: 6,
    agility: 6,
    accuracyBonus: 1,
    damage: [{ type: 'cut', min: 2, max: 4 }], // nails
    tags: ['undead', 'humanoid', 'head', 'arms', 'legs', 'mindless'],
    resist: { pierce: 0.6, rad: 1, fire: -0.5 },
    faction: 'ghouls',
    speed: 18,
    behavior: 'chase',
    awarenessRadius: 9,
  },

  /** Armed, armoured, and carrying the upgrade you're about to be using. */
  wakeRaider: {
    id: 'wakeRaider',
    weight: 75,
    name: 'Wake raider',
    glyph: '@',
    fg: '#d06060',
    maxHp: 14,
    ac: 12,
    strength: 6,
    agility: 5,
    accuracyBonus: 1,
    damage: [{ type: 'cut', min: 2, max: 4 }],
    tags: ['living', 'humanoid', 'head', 'arms', 'legs', 'sentient'],
    resist: { cut: 0.15 }, // scrap plate, lashed on
    faction: 'wake',
    behavior: 'chase',
    awarenessRadius: 8,
    drops: [
      { defId: 'machete', chance: 0.4 },
      { defId: 'paddedVest', chance: 0.25 },
      { defId: 'medPack', chance: 0.3 },
    ],
  },

  /** The other side of the war. Better armoured, and not your problem unless you make it one. */
  restorationTrooper: {
    id: 'restorationTrooper',
    weight: 85,
    name: 'Restoration trooper',
    glyph: '@',
    fg: '#c8b88a',
    maxHp: 16,
    ac: 13,
    strength: 6,
    agility: 5,
    accuracyBonus: 2,
    damage: [{ type: 'cut', min: 2, max: 5 }],
    tags: ['living', 'humanoid', 'head', 'arms', 'legs', 'sentient'],
    resist: { cut: 0.3, pierce: 0.1 },
    faction: 'restoration',
    behavior: 'chase',
    awarenessRadius: 8,
    drops: [
      { defId: 'machete', chance: 0.3 },
      { defId: 'paddedVest', chance: 0.4 },
    ],
  },

  /**
   * The case the tag system exists for. It has no head to take off, no mind to read, and nothing
   * inside worth puncturing — so a spear is useless against it and fire is devastating. None of
   * that is special-cased anywhere; it all falls out of tags and resistances.
   */
  crawlingMold: {
    id: 'crawlingMold',
    weight: 25,
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
    faction: 'predators',
    speed: 4, // barely moves; a hazard you walk into rather than something that finds you
    behavior: 'chase',
    awarenessRadius: 1,
  },
};
