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
  /** Armour: how much of each damage type it turns. Plate stops a cut far better than a thrust. */
  resist?: Resistances;
  armorValue?: number;
  // Consumable effect:
  healAmount?: number;
}

export const ITEMS: Record<string, ItemDef> = {
  rustySword: {
    id: 'rustySword',
    name: 'rusty sword',
    glyph: ')',
    fg: '#c0c0c0',
    category: 'weapon',
    slot: 'weapon',
    maxDurability: 20,
    value: 12,
    stackable: false,
    attackVerb: 'slash',
    accuracyBonus: 0,
    damage: [{ type: 'cut', min: 2, max: 4 }],
    traits: ['decapitates'],
  },
  scrapSpear: {
    id: 'scrapSpear',
    name: 'scrap spear',
    glyph: ')',
    fg: '#9aa0a6',
    category: 'weapon',
    slot: 'weapon',
    maxDurability: 25,
    value: 14,
    stackable: false,
    attackVerb: 'thrust',
    accuracyBonus: 1,
    // Less raw damage than the sword, but piercing: armour and hide turn it far less.
    damage: [{ type: 'pierce', min: 2, max: 5 }],
  },
  leatherArmor: {
    id: 'leatherArmor',
    name: 'leather armor',
    glyph: '[',
    fg: '#8b5a2b',
    category: 'armor',
    slot: 'armor',
    maxDurability: 15,
    value: 20,
    stackable: false,
    armorValue: 2,
    // The example that started this: armour turns a cut well and a thrust poorly.
    resist: { cut: 0.35, pierce: 0.1, bludgeon: 0.1 },
  },
  healingHerb: {
    id: 'healingHerb',
    name: 'healing herb',
    glyph: '!',
    fg: '#ff4444',
    category: 'consumable',
    value: 5,
    stackable: true,
    healAmount: 5,
  },
};
