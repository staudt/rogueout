import type { GameState } from '../engine/GameState';
import { reserveItemInstanceIds } from '../items/Item';
import { reserveMonsterInstanceIds } from '../entities/Monster';
import type { SaveStorage } from './LocalStorageAdapter';
import { fromSaveData, migrate, toSaveData, type SaveData } from './SaveSchema';

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
    // Storage full or blocked, or serialization itself failing (a cycle sneaking into state,
    // which would be a bug). Either way it must not end the run — the player keeps playing,
    // unsaved. Returning false rather than throwing is what lets the caller say so honestly;
    // the one thing this must never do is report a success that didn't happen.
    return false;
  }
}

/** The stored run, or null if there isn't a usable one (see migrate()). */
export function loadGame(storage: SaveStorage): GameState | null {
  const save = migrate(storage.read());
  if (!save) return null;

  // Decoding can still fail on input that passed migrate's structural checks — a grid whose
  // run lengths don't add up to its own width x height. Same answer as any other unusable save.
  const state = fromSaveData(save);
  if (!state) return null;

  reserveInstanceIds(save);
  return state;
}

export function clearSave(storage: SaveStorage): void {
  storage.clear();
}

/**
 * Whether Continue should be offered.
 *
 * Deliberately the *full* load rather than just a shape check: a save can pass validation and
 * still fail to decode (a grid whose runs don't add up), and offering Continue for a run that
 * then refuses to load is the one outcome worse than not offering it. Called once while building
 * the title screen, so paying for a decode to be sure is easily affordable.
 */
export function hasSave(storage: SaveStorage): boolean {
  return loadGame(storage) !== null;
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
