import { setTileId, type GameMapData } from '../GameMap';
import { createOpenRoom } from '../maps/mapBuilder';
import { createItem } from '../../items/Item';
import type { RegionRecipe } from './RegionTypes';
import type { Point } from '../../utils/geometry';

/**
 * The home clubhouse under the stands, where the Vigil keep what they have left.
 *
 * The city-side outing for the door machinery: a region with no entry in `REGIONS`, built from a
 * recipe the first time somebody opens the door to it, and carried into the save on the transition
 * that points at it. Proving that here rather than on the marquee is deliberate — the marquee is
 * seamless and should stay that way, so the newest machinery gets the smaller, safer target.
 */
const WIDTH = 13;
const HEIGHT = 8;

export const CLUBHOUSE_ENTRY: Point = { x: 6, y: HEIGHT - 2 };
export const CLUBHOUSE_DOOR: Point = { x: 6, y: HEIGHT - 1 };

export const CLUBHOUSE_RECIPE: RegionRecipe = {
  builderId: 'clubhouse',
  regionId: 'wrigley-clubhouse',
  name: 'the clubhouse',
  seed: 2,
};

export function createClubhouseMap(): GameMapData {
  const map = createOpenRoom(WIDTH, HEIGHT);

  // A row of lockers down the middle, with a gap, so the room has a shape rather than being a box.
  for (let x = 2; x <= 10; x++) setTileId(map, x, 3, 'brick');
  setTileId(map, 6, 3, 'floor');

  setTileId(map, CLUBHOUSE_DOOR.x, CLUBHOUSE_DOOR.y, 'door');
  return map;
}

export function clubhouseLoot() {
  return [
    { item: createItem('medPack', 2), x: 2, y: 1 },
    { item: createItem('paddedVest'), x: 10, y: 1 },
  ];
}
