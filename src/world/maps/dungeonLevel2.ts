import { setTileId, type GameMapData } from '../GameMap';
import { createOpenRoom } from './mapBuilder';

const WIDTH = 16;
const HEIGHT = 10;

export const DUNGEON2_SPAWN_FROM_LEVEL1 = { x: 1, y: 4 };
export const DUNGEON2_STAIRS_UP = { x: 0, y: 4 };

export function createDungeonLevel2Map(): GameMapData {
  const map = createOpenRoom(WIDTH, HEIGHT);
  setTileId(map, DUNGEON2_STAIRS_UP.x, DUNGEON2_STAIRS_UP.y, 'stairsUp');
  return map;
}
