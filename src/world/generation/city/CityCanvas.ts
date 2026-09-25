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

  constructor(map: GameMapData) {
    this.map = map;
    this.protectedTiles = new Uint8Array(map.width * map.height);
  }

  /** Writes a tile unless it's protected or off the map. */
  set(x: number, y: number, tileId: string): void {
    if (!inBounds(this.map, x, y)) return;
    if (this.protectedTiles[y * this.map.width + x] === 1) return;
    setTileId(this.map, x, y, tileId);
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
