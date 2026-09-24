import type { Item } from './Item';

export interface DurabilityResult {
  broke: boolean;
}

/** Pure: decrements an item's durability, clamping at 0. No-op for items with no durability field. */
export function applyDurabilityLoss(item: Item, amount: number = 1): DurabilityResult {
  if (item.durability === undefined) return { broke: false };

  item.durability -= amount;
  if (item.durability <= 0) {
    item.durability = 0;
    return { broke: true };
  }
  return { broke: false };
}
