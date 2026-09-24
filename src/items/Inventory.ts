import type { Item } from './Item';
import { ITEMS } from './ItemData';

export type Inventory = Item[];

export function addItem(inventory: Inventory, item: Item): void {
  const def = ITEMS[item.defId];
  if (def?.stackable) {
    const existing = inventory.find((i) => i.defId === item.defId);
    if (existing) {
      existing.quantity += item.quantity;
      return;
    }
  }
  inventory.push(item);
}

export function removeItem(inventory: Inventory, itemId: string): Item | undefined {
  const idx = inventory.findIndex((i) => i.id === itemId);
  if (idx === -1) return undefined;
  return inventory.splice(idx, 1)[0];
}

/** Decrements a stack by one, removing it entirely once it hits zero. Returns false if not found. */
export function consumeOne(inventory: Inventory, itemId: string): boolean {
  const item = inventory.find((i) => i.id === itemId);
  if (!item) return false;
  item.quantity -= 1;
  if (item.quantity <= 0) {
    removeItem(inventory, itemId);
  }
  return true;
}
