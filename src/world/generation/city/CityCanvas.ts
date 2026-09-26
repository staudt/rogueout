import { inBounds, setTileId, type GameMapData } from '../../GameMap';
import type { Rect } from '../Rect';

/**
 * The map plus a mask of tiles nothing generated may touch.
 *
 * Landmarks are the reason. Wrigley Field is authored down to which upper-deck sections have come
 * down, and the damage pass is the one pass that writes *everywhere* — relying on pass ordering to
 * keep it off a landmark works right up until somebody adds a pass, or reorders two, and then a
 * ballpark quietly grows a hole in it. Enforcing it on every write instead means a landmark cannot
 * be damaged by construction, whatever order the passes run in.
 *
 * It costs one array lookup per write, on a few tens of thousands of writes, once per new game.
 */
export class CityCanvas {
  readonly map: GameMapData;
  private readonly protectedTiles: Uint8Array;
  private restriction: Uint8Array | null = null;

  constructor(map: GameMapData) {
    this.map = map;
    this.protectedTiles = new Uint8Array(map.width * map.height);
  }

  /**
   * Writes a tile unless it's protected, outside the current restriction, or off the map.
   */
  set(x: number, y: number, tileId: string): void {
    if (!inBounds(this.map, x, y)) return;
    const index = y * this.map.width + x;
    if (this.protectedTiles[index] === 1) return;
    if (this.restriction && this.restriction[index] !== 1) return;
    setTileId(this.map, x, y, tileId);
  }

  /**
   * Confines every write to exactly these tiles until `release()`.
   *
   * Needed the moment blocks stopped being rectangles. A filler works on a rect — it subdivides
   * one, it runs automata across one — so given an L-shaped or triangular block it would fill the
   * *bounding box*, and a diagonal street cutting a block in two was quietly paved over by the
   * buildings on either side of it. Restricting the writes lets the fillers keep thinking in
   * rectangles while only the drawn shape actually changes, which is what makes "any shape you
   * draw" true rather than nearly true.
   */
  restrictTo(tiles: readonly { x: number; y: number }[]): void {
    const mask = new Uint8Array(this.map.width * this.map.height);
    for (const tile of tiles) {
      if (inBounds(this.map, tile.x, tile.y)) mask[tile.y * this.map.width + tile.x] = 1;
    }
    this.restriction = mask;
  }

  release(): void {
    this.restriction = null;
  }

  fill(rect: Rect, tileId: string): void {
    for (let y = rect.y0; y <= rect.y1; y++) {
      for (let x = rect.x0; x <= rect.x1; x++) {
        this.set(x, y, tileId);
      }
    }
  }

  protect(rect: Rect): void {
    for (let y = rect.y0; y <= rect.y1; y++) {
      for (let x = rect.x0; x <= rect.x1; x++) {
        if (!inBounds(this.map, x, y)) continue;
        this.protectedTiles[y * this.map.width + x] = 1;
      }
    }
  }

  isProtected(x: number, y: number): boolean {
    if (!inBounds(this.map, x, y)) return false;
    return this.protectedTiles[y * this.map.width + x] === 1;
  }
}
