import { setTileId, type GameMapData } from '../GameMap';
import { createOpenRoom } from './mapBuilder';

const WIDTH = 16;
const HEIGHT = 10;

export const DUNGEON1_SPAWN_FROM_WILDERNESS = { x: 1, y: 4 };
export const DUNGEON1_SPAWN_FROM_LEVEL2 = { x: 13, y: 4 };
export const DUNGEON1_EXIT_WEST = { x: 0, y: 4 };
export const DUNGEON1_STAIRS_DOWN = { x: 14, y: 4 };

export function createDungeonLevel1Map(): GameMapData {
  const map = createOpenRoom(WIDTH, HEIGHT);
  setTileId(map, DUNGEON1_EXIT_WEST.x, DUNGEON1_EXIT_WEST.y, 'floor');
  setTileId(map, DUNGEON1_STAIRS_DOWN.x, DUNGEON1_STAIRS_DOWN.y, 'stairsDown');
  return map;
}
