import { createGameMap, setTileId, type GameMapData } from '../GameMap';

/** A rectangular room: walled border, open floor interior. The shared starting point for handcrafted maps. */
export function createOpenRoom(width: number, height: number): GameMapData {
  const map = createGameMap(width, height, 'wall');
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      setTileId(map, x, y, 'floor');
    }
  }
  return map;
}
