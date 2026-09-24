import { DEFAULT_TILE_ID, TILES } from './Tile';

/**
 * A single grid (the overworld, a dungeon level, ...). Plain, directly serializable
 * data — behavior lives in the functions below, not on the object, per the project's
 * plain-POJO-plus-systems convention (see CLAUDE.md).
 */
export interface GameMapData {
  width: number;
  height: number;
  /** Row-major flat array of tile ids. */
  tiles: string[];
}

export function createGameMap(width: number, height: number, fill: string = DEFAULT_TILE_ID): GameMapData {
  return { width, height, tiles: new Array(width * height).fill(fill) };
}

function index(map: GameMapData, x: number, y: number): number {
  return y * map.width + x;
}

export function inBounds(map: GameMapData, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < map.width && y < map.height;
}

export function getTileId(map: GameMapData, x: number, y: number): string {
  if (!inBounds(map, x, y)) return DEFAULT_TILE_ID;
  return map.tiles[index(map, x, y)] ?? DEFAULT_TILE_ID;
}

export function setTileId(map: GameMapData, x: number, y: number, id: string): void {
  if (!inBounds(map, x, y)) return;
  map.tiles[index(map, x, y)] = id;
}

export function isWalkable(map: GameMapData, x: number, y: number): boolean {
  return TILES[getTileId(map, x, y)]?.walkable ?? false;
}

export function isOpaque(map: GameMapData, x: number, y: number): boolean {
  return TILES[getTileId(map, x, y)]?.opaque ?? true;
}
