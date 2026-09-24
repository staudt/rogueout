import { ITEMS } from './ItemData';

export interface Item {
  id: string;
  defId: string;
  quantity: number;
  /** Present only when the def has maxDurability (weapons/armor); absent for consumables. */
  durability?: number;
}

/** An item instance sitting on the map, outside any inventory. */
export interface GroundItem {
  item: Item;
  x: number;
  y: number;
}

let nextItemInstanceId = 0;

const ID_PREFIX = 'item-';

/**
 * Pushes the id counter past every id in a restored save.
 *
 * The counter is module state that resets on reload, so without this a loaded game whose sword is
 * `item-4` would hand the very next created item that same id — and inventory/equipment lookups
 * are by id, so the two would be indistinguishable. Call once, right after loading.
 */
export function reserveItemInstanceIds(ids: Iterable<string>): void {
  for (const id of ids) {
    if (!id.startsWith(ID_PREFIX)) continue;
    const n = Number.parseInt(id.slice(ID_PREFIX.length), 10);
    if (Number.isFinite(n) && n > nextItemInstanceId) nextItemInstanceId = n;
  }
}

export function createItem(defId: string, quantity: number = 1): Item {
  nextItemInstanceId += 1;
  const def = ITEMS[defId];
  const item: Item = { id: `${ID_PREFIX}${nextItemInstanceId}`, defId, quantity };
  if (def?.maxDurability !== undefined) {
    item.durability = def.maxDurability;
  }
  return item;
}
