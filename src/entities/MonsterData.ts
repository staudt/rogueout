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
   * Picks things up off the ground, uses them if they're better than what it has, and drops the
   * lot when it dies. The Wake live by it; a lizard has no pockets.
   */
  scavenges?: boolean;
  /**
   * Whether it breaks and runs once badly hurt. Morale, as data: the Wake are in it for
   * themselves and will not die for it; Restoration troopers are disciplined; the feral don't
   * have the wit to be afraid.
   */
  cowardly?: boolean;
  /**
   * Hunts in a group and takes its nerve from it: how many companions it wants within
   * `PACK_RADIUS` before it will commit.
   *
   * This is what "a pack, but less organised than wolves" comes to mechanically. A stray on its
   * own shadows you and will not close; three of them together come straight in; and thinning the
   * pack breaks the survivors rather than making them desperate. They aren't coordinating — each
   * one is separately deciding whether these odds look good — which is exactly the difference
   * between dogs and a wolf pack.
   */
  pack?: number;
  /**
   * Rooted. It will strike anything that comes within reach and will never take a step toward it.
   *
   * Speed alone could not express this: a very low speed still crawls across the map eventually,
   * and a speed of zero would stop it defending itself too. A mold is a hazard you walk into, not
   * something that finds you, and the difference matters — you should be able to leave one alone.
   */
  sessile?: boolean;
  /**
   * Roughly kilograms. Only knockback reads it: a kicked skink tumbles, a kicked trooper takes
   * one step back, and something heavy enough doesn't move at all. Omitted means human-ish.
   */
  weight?: number;
}

/**
 * The bestiary. Each entry is meant to teach one thing or fill one niche, so the table doubles as
 * a difficulty curve: something free, something that ignores you, something your blade is wrong
 * for, something faster than you, and something that fights back with gear worth taking.
 *
 * Everything here belongs in a dead city rather than a desert — the previous list was written for
 * sand and outlived the setting by a commit.
 */
export const MONSTERS: Record<string, MonsterDef> = {
  /** Free, and everywhere. The one you learn the controls on. */
  alleyRat: {
    id: 'alleyRat',
    weight: 4,
    cowardly: true,
    name: 'alley rat',
    glyph: 'r',
    fg: '#9c7b53',
    maxHp: 5,
    ac: 10,
    strength: 3,
    agility: 6,
    accuracyBonus: 0,
    damage: [{ type: 'pierce', min: 1, max: 2 }],
    tags: ['living', 'beast', 'head', 'legs'],
    faction: 'predators',
    behavior: 'chase',
    awarenessRadius: 5,
  },

  /** Teaches that the glyph is not the creature: same letter, four times the fight. */
  bloatedRat: {
    id: 'bloatedRat',
    weight: 14,
    name: 'bloated rat',
    glyph: 'r',
    fg: '#b9a7a0',
    maxHp: 16,
    ac: 11,
    strength: 5,
    agility: 3,
    accuracyBonus: 0,
    damage: [{ type: 'pierce', min: 2, max: 4 }],
    tags: ['living', 'beast', 'head', 'legs'],
    resist: { rad: 0.5 },
    faction: 'predators',
    speed: 9, // heavy and slow: you can walk away from this one
    behavior: 'chase',
    awarenessRadius: 6,
  },

  /** Teaches that not everything out here is a fight. Too quick to corner, and not interested. */
  feralCat: {
    id: 'feralCat',
    weight: 4,
    name: 'feral cat',
    glyph: 'f',
    fg: '#8d8a84',
    maxHp: 5,
    ac: 14,
    strength: 2,
    agility: 9,
    accuracyBonus: 0,
    damage: [{ type: 'cut', min: 1, max: 2 }],
    tags: ['living', 'beast', 'head', 'legs'],
    faction: 'wildlife',
    speed: 20,
    behavior: 'flee',
    awarenessRadius: 8,
  },

  /** Noise with wings. Harmless, and the first thing that tells you something is moving nearby. */
  carrionCrow: {
    id: 'carrionCrow',
    weight: 2,
    name: 'carrion crow',
    glyph: 'B',
    fg: '#5c5a63',
    maxHp: 3,
    ac: 14,
    strength: 1,
    agility: 8,
    accuracyBonus: 0,
    damage: [{ type: 'pierce', min: 1, max: 1 }],
    tags: ['living', 'beast', 'head'],
    faction: 'wildlife',
    speed: 18,
    behavior: 'flee',
    awarenessRadius: 9,
  },

  /**
   * The pack, and the reason `MonsterDef.pack` exists. One stray keeps its distance; three come
   * straight in; kill two and the rest remember they are dogs rather than wolves.
   */
  strayDog: {
    id: 'strayDog',
    weight: 25,
    pack: 2,
    name: 'stray dog',
    glyph: 'd',
    fg: '#a67c52',
    maxHp: 11,
    ac: 12,
    strength: 5,
    agility: 7,
    accuracyBonus: 1,
    damage: [{ type: 'pierce', min: 2, max: 4 }],
    tags: ['living', 'beast', 'head', 'legs'],
    faction: 'predators',
    speed: 15, // it closes faster than you retreat
    behavior: 'chase',
    awarenessRadius: 9,
  },

  /** The one that doesn't need the others. Slower than a stray, and much harder to see off. */
  junkyardDog: {
    id: 'junkyardDog',
    weight: 50,
    name: 'junkyard dog',
    glyph: 'd',
    fg: '#6b4f3a',
    maxHp: 20,
    ac: 13,
    strength: 7,
    agility: 6,
    accuracyBonus: 2,
    damage: [{ type: 'pierce', min: 3, max: 6 }],
    tags: ['living', 'beast', 'head', 'legs'],
    faction: 'predators',
    speed: 14,
    behavior: 'chase',
    awarenessRadius: 9,
  },

  /**
   * The first time the damage system bites: a carapace turns blades and points alike, and the
   * answer is the blunt weapon you probably didn't buy.
   */
  ironRoach: {
    id: 'ironRoach',
    weight: 12,
    name: 'iron roach',
    glyph: 'a',
    fg: '#6e5a3c',
    maxHp: 12,
    ac: 13,
    strength: 4,
    agility: 5,
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
    cowardly: true,
    scavenges: true,
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
    scavenges: true,
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
  blackMold: {
    id: 'blackMold',
    weight: 25,
    name: 'black mold',
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
    sessile: true, // rooted: it strikes what comes to it and never follows
    speed: 8,
    behavior: 'chase',
    awarenessRadius: 1,
  },
};
