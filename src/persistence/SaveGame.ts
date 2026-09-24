import type { GameState } from '../engine/GameState';
import { reserveItemInstanceIds } from '../items/Item';
import { reserveMonsterInstanceIds } from '../entities/Monster';
import type { SaveStorage } from './LocalStorageAdapter';
import { fromSaveData, migrate, toSaveData, type SaveData } from './SaveSchema';
import { REGIONS } from '../world/regions/RegionRegistry';

/**
 * Single-slot save/load.
 *
 * The game is permadeath, so a save is a *suspend*, not a checkpoint: it exists so you can stop
 * playing and pick the same run up later, and it is deleted the moment the character dies. That
 * rule is enforced here (saveGame refuses to write a dead run; clearSave is called on death)
 * rather than left to call sites, because it's the one property the whole design rests on.
 */

export function saveGame(storage: SaveStorage, state: GameState): boolean {
  if (state.gameOver) return false; // dead characters don't get saved. That's the whole point.

  try {
    storage.write(JSON.stringify(toSaveData(state)));
    return true;
  } catch {
    // Serialization itself failing (a cycle sneaking into state) would be a bug, but it must not
    // end the run — the player keeps playing, unsaved.
    return false;
  }
}

/** The stored run, or null if there isn't a usable one (see migrate()). */
export function loadGame(storage: SaveStorage): GameState | null {
  const save = migrate(storage.read());
  if (!save) return null;

  const state = fromSaveData(save);
  reserveInstanceIds(save);

  // Saves written before regions knew about daylight would otherwise load the overworld as if it
  // were underground. Cheaper and safer than a schema bump for a field the region table owns.
  for (const [id, region] of Object.entries(state.regions)) {
    region.daylight ??= REGIONS[id]?.daylight ?? false;
  }

  return state;
}

export function clearSave(storage: SaveStorage): void {
  storage.clear();
}

/** Whether Continue should be offered. Cheap enough to call while building the title screen. */
export function hasSave(storage: SaveStorage): boolean {
  return migrate(storage.read()) !== null;
}

function reserveInstanceIds(save: SaveData): void {
  const itemIds: string[] = save.player.inventory.map((item) => item.id);
  const monsterIds: string[] = [];

  for (const region of Object.values(save.regions)) {
    for (const ground of region.groundItems) itemIds.push(ground.item.id);
    for (const monster of region.monsters) monsterIds.push(monster.id);
  }

  reserveItemInstanceIds(itemIds);
  reserveMonsterInstanceIds(monsterIds);
}
