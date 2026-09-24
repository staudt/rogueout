import type { DamagePacket, Resistances } from '../combat/DamageTypes';

export type ItemSlot = 'weapon' | 'armor';
export type ItemCategory = 'weapon' | 'armor' | 'consumable';

export interface ItemDef {
  id: string;
  name: string;
  glyph: string;
  fg: string;
  category: ItemCategory;
  slot?: ItemSlot;
  /** Present only for weapons/armor. Undefined = indestructible (consumables have none). */
  maxDurability?: number;
  value: number;
  stackable: boolean;
  // Weapon/armor combat fields (only relevant for their respective categories):
  /** How this weapon reads in the log ("You slash the goblin"). Defaults to UNARMED_VERB. */
  attackVerb?: string;
  accuracyBonus?: number;
  /** What the weapon does, by type. Several components is normal: a blade cuts and thrusts. */
  damage?: DamagePacket[];
  /** Open-ended weapon properties rules can ask about, e.g. 'decapitates'. */
  traits?: string[];
  /**
   * How well it flies. Added to the throw's to-hit, so a balanced knife lands and a machete
   * mostly doesn't. Omitted means the default clumsiness of throwing something not meant for it.
   */
  throwBonus?: number;
  /** Armour: how much of each damage type it turns. Plate stops a cut far better than a thrust. */
  resist?: Resistances;
  armorValue?: number;
  // Consumable effect:
  healAmount?: number;
}

export const ITEMS: Record<string, ItemDef> = {
  machete: {
    id: 'machete',
    name: 'notched machete',
    glyph: ')',
    fg: '#c0c0c0',
    category: 'weapon',
    slot: 'weapon',
    maxDurability: 22,
    value: 14,
    stackable: false,
    attackVerb: 'cut',
    accuracyBonus: 0,
    damage: [{ type: 'cut', min: 2, max: 4 }],
    traits: ['decapitates'],
    throwBonus: -30, // heavy, unbalanced, and it tumbles
  },

  /** Light, balanced, and meant to leave your hand. */
  throwingKnife: {
    id: 'throwingKnife',
    name: 'throwing knife',
    glyph: ')',
    fg: '#d8d8d8',
    category: 'weapon',
    slot: 'weapon',
    maxDurability: 15,
    value: 9,
    stackable: false,
    attackVerb: 'stab',
    accuracyBonus: 1,
    damage: [
      { type: 'pierce', min: 1, max: 3 },
      { type: 'cut', min: 1, max: 2 },
    ],
    throwBonus: 20,
  },

  /** Barely a weapon in the hand. In the air it's the best thing you own. */
  dart: {
    id: 'dart',
    name: 'dart',
    glyph: '/',
    fg: '#b0c4de',
    category: 'weapon',
    slot: 'weapon',
    maxDurability: 8,
    value: 3,
    stackable: true,
    attackVerb: 'jab',
    accuracyBonus: -1,
    damage: [{ type: 'pierce', min: 1, max: 2 }],
    throwBonus: 30,
  },

  /** Armour turns a cut far better than a thrust, so this beats the machete against people. */
  scrapSpear: {
    id: 'scrapSpear',
    name: 'scrap spear',
    glyph: ')',
    fg: '#9aa0a6',
    category: 'weapon',
    slot: 'weapon',
    maxDurability: 25,
    value: 16,
    stackable: false,
    attackVerb: 'thrust',
    accuracyBonus: 1,
    damage: [{ type: 'pierce', min: 2, max: 5 }],
    throwBonus: 10, // a spear is half a javelin
  },

  /** The answer to a carapace, which turns blades and points alike. Clumsy against everything else. */
  pipeWrench: {
    id: 'pipeWrench',
    name: 'pipe wrench',
    glyph: ')',
    fg: '#8a7f6a',
    category: 'weapon',
    slot: 'weapon',
    maxDurability: 40,
    value: 12,
    stackable: false,
    attackVerb: 'swing',
    accuracyBonus: -1,
    damage: [{ type: 'bludgeon', min: 2, max: 6 }],
    throwBonus: -40, // you may as well drop it on your own foot
  },

  paddedVest: {
    id: 'paddedVest',
    name: 'padded vest',
    glyph: '[',
    fg: '#8b5a2b',
    category: 'armor',
    slot: 'armor',
    maxDurability: 18,
    value: 22,
    stackable: false,
    armorValue: 2,
    resist: { cut: 0.35, pierce: 0.1, bludgeon: 0.1 },
  },

  medPack: {
    id: 'medPack',
    name: 'med pack',
    glyph: '!',
    fg: '#ff4444',
    category: 'consumable',
    value: 6,
    stackable: true,
    healAmount: 6,
  },
};
