import { describe, expect, it } from 'vitest';
import { applyDurabilityLoss } from '../src/items/Durability';
import { damageEquippedArmor, damageEquippedWeapon, createEmptyEquipment } from '../src/items/Equipment';
import { createItem } from '../src/items/Item';
import { ITEMS } from '../src/items/ItemData';
import type { Inventory } from '../src/items/Inventory';

describe('applyDurabilityLoss', () => {
  it('decrements durability and reports no break while above zero', () => {
    const item = createItem('machete');
    const result = applyDurabilityLoss(item, 1);

    expect(result.broke).toBe(false);
    expect(item.durability).toBe(ITEMS['machete']!.maxDurability! - 1);
  });

  it('breaks and clamps at exactly zero', () => {
    const item = createItem('machete');
    item.durability = 1;

    const result = applyDurabilityLoss(item, 1);

    expect(result.broke).toBe(true);
    expect(item.durability).toBe(0);
  });

  it('never goes negative even if amount overshoots', () => {
    const item = createItem('machete');
    item.durability = 2;

    const result = applyDurabilityLoss(item, 10);

    expect(result.broke).toBe(true);
    expect(item.durability).toBe(0);
  });

  it('is a no-op for items with no durability field (consumables)', () => {
    const item = createItem('medPack', 3);
    expect(item.durability).toBeUndefined();

    const result = applyDurabilityLoss(item, 1);

    expect(result.broke).toBe(false);
    expect(item.durability).toBeUndefined();
  });
});

describe('damageEquippedWeapon / damageEquippedArmor', () => {
  it('returns null when nothing is equipped in that slot', () => {
    const equipment = createEmptyEquipment();
    const inventory: Inventory = [];

    expect(damageEquippedWeapon(equipment, inventory)).toBeNull();
    expect(damageEquippedArmor(equipment, inventory)).toBeNull();
  });

  it('destroys and unequips a weapon that breaks, removing it from inventory', () => {
    const sword = createItem('machete');
    sword.durability = 1;
    const equipment = createEmptyEquipment();
    equipment.weapon = sword;
    const inventory: Inventory = [sword];

    const result = damageEquippedWeapon(equipment, inventory);

    expect(result).toEqual({ broke: true, itemName: ITEMS['machete']!.name });
    expect(equipment.weapon).toBeNull();
    expect(inventory).toHaveLength(0);
  });

  it('leaves armor equipped and in inventory when it merely takes damage', () => {
    const armor = createItem('paddedVest');
    const equipment = createEmptyEquipment();
    equipment.armor = armor;
    const inventory: Inventory = [armor];

    const result = damageEquippedArmor(equipment, inventory);

    expect(result?.broke).toBe(false);
    expect(equipment.armor).toBe(armor);
    expect(inventory).toHaveLength(1);
    expect(armor.durability).toBe(ITEMS['paddedVest']!.maxDurability! - 1);
  });
});
