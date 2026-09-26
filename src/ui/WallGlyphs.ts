import { getTileId, type GameMapData } from '../world/GameMap';

/**
 * Connected wall glyphs for building frontage.
 *
 * A run of `#` reads as a fence; `─ │ ┌ ┐ └ ┘ ├ ┤ ┬ ┴ ┼` reads as a building. Purely presentation
 * — the tile is still `brick`, and nothing in the engine knows or cares.
 *
 * **Deliberately only for `brick`, never `ruin`.** Box-drawing says "somebody built this to a
 * right angle", which is exactly what an intact wall is and exactly what a collapsed block isn't.
 * Drawing organic cave with neat corners would look wrong, and keeping it to buildings sharpens
 * the one distinction the map has been hardest to make legible: what is still standing versus
 * what has come down.
 */
const CONNECTED = 'brick';

/** Indexed by a bitmask of which orthogonal neighbours are also wall: N=1, S=2, W=4, E=8. */
const GLYPHS: readonly string[] = [
  '─', // 0: alone — a stub of wall reads better as a short bar than as a dot
  '│', // 1: N
  '│', // 2: S
  '│', // 3: N S
  '─', // 4: W
  '┘', // 5: N W
  '┐', // 6: S W
  '┤', // 7: N S W
  '─', // 8: E
  '└', // 9: N E
  '┌', // 10: S E
  '├', // 11: N S E
  '─', // 12: W E
  '┴', // 13: N W E
  '┬', // 14: S W E
  '┼', // 15: all four
];

export function isConnectedWall(tileId: string): boolean {
  return tileId === CONNECTED;
}

export function wallGlyph(map: GameMapData, x: number, y: number): string {
  let mask = 0;
  if (getTileId(map, x, y - 1) === CONNECTED) mask |= 1;
  if (getTileId(map, x, y + 1) === CONNECTED) mask |= 2;
  if (getTileId(map, x - 1, y) === CONNECTED) mask |= 4;
  if (getTileId(map, x + 1, y) === CONNECTED) mask |= 8;
  return GLYPHS[mask]!;
}
