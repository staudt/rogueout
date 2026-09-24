import { ITEMS } from './ItemData';
import type { Item } from './Item';
import type { Inventory } from './Inventory';
import { removeItem } from './Inventory';
import { applyDurabilityLoss } from './Durability';

export interface Equipment {
  weapon: Item | null;
  armor: Item | null;
}

export function createEmptyEquipment(): Equipment {
  return { weapon: null, armor: null };
}

export interface EquipmentDamageResult {
  broke: boolean;
  itemName: string;
}

function damageSlot(
  equipment: Equipment,
  inventory: Inventory,
  slot: 'weapon' | 'armor',
): EquipmentDamageResult | null {
  const item = equipment[slot];
  if (!item) return null;

  const def = ITEMS[item.defId];
  const { broke } = applyDurabilityLoss(item, 1);
  if (broke) {
    removeItem(inventory, item.id);
    equipment[slot] = null;
  }
  return { broke, itemName: def?.name ?? slot };
}

/** Weapon durability loses 1 per successful hit landed. Call after the attacker's hit connects. */
export function damageEquippedWeapon(equipment: Equipment, inventory: Inventory): EquipmentDamageResult | null {
  return damageSlot(equipment, inventory, 'weapon');
}

/** Armor durability loses 1 per hit taken while equipped. Call after the defender is hit. */
export function damageEquippedArmor(equipment: Equipment, inventory: Inventory): EquipmentDamageResult | null {
  return damageSlot(equipment, inventory, 'armor');
}
