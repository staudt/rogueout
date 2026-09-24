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
  accuracyBonus?: number;
  minDamage?: number;
  maxDamage?: number;
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
    accuracyBonus: 0,
    minDamage: 2,
    maxDamage: 4,
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
