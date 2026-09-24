import { setTileId, type GameMapData } from '../GameMap';
import { createOpenRoom } from './mapBuilder';

/**
 * The inside of the Reclamation post — the first interior reached through a `door` rather than a
 * staircase, and the thing the door machinery is proven on before a city depends on it.
 *
 * Small on purpose. It exists to demonstrate that a region with no entry in `REGIONS` can be built
 * from a recipe on demand, kept across visits, and rebuilt identically after a reload even if the
 * player never opened the door. None of that needs a big room to show.
 */
const WIDTH = 9;
const HEIGHT = 7;

/** Where you arrive, just inside the door. */
export const STORE_INTERIOR_ENTRY = { x: 4, y: HEIGHT - 2 };

/** The way out, in the south wall, directly below the entry. */
export const STORE_INTERIOR_DOOR = { x: 4, y: HEIGHT - 1 };

/** Behind the counter. */
export const STORE_INTERIOR_COUNTER = { x: 4, y: 2 };

export function createStoreInteriorMap(): GameMapData {
  const map = createOpenRoom(WIDTH, HEIGHT);

  // The counter: a run of wall with a gap, so Maren stands behind it and you stand in front.
  for (let x = 2; x <= 6; x++) {
    setTileId(map, x, 3, 'wall');
  }
  setTileId(map, 4, 3, 'floor');

  setTileId(map, STORE_INTERIOR_DOOR.x, STORE_INTERIOR_DOOR.y, 'door');

  return map;
}
