import { getTileId, isWalkable, type GameMapData } from '../../GameMap';
import { fbm2D } from '../noise';
import type { Rect } from '../Rect';
import type { CityCanvas } from './CityCanvas';

/**
 * Water in the ruins — burst mains, a blocked river channel, thirty years of rain with nowhere to
 * go. It exists to break the city's grain: a place where the obvious route is simply gone.
 *
 * Two tiles doing two jobs. **`water` is impassable and is the barrier**; `swamp` is walkable muck
 * that fringes it. A moat made of walkable swamp would protect nothing, which is why the ring
 * around the settlement has water at its core.
 *
 * **Water is only ever written inside a block, never onto a street.** That is what keeps flooding
 * from cutting the street lattice, and it means this pass needs no relationship with `StreetGraph`
 * at all. Swamp may go anywhere, since walking through muck still gets you there.
 */
const FLOOD_NOISE = { octaves: 3, persistence: 0.5, lacunarity: 2.1 };
const NOISE_SCALE = 0.045;

/** Above this the ground is under water; above the lower one it is merely sodden. */
const DEEP = 0.80;
const MARSH = 0.72;

export function applyFlooding(canvas: CityCanvas, map: GameMapData, seed: number): void {
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const level = fbm2D(seed + 977, x * NOISE_SCALE, y * NOISE_SCALE, FLOOD_NOISE);
      if (level < MARSH) continue;

      const here = getTileId(map, x, y);
      if (!isWalkable(map, x, y)) continue;

      // The kerb stays dry. Water pools in the roadway because that is where it runs to, and
      // leaving the pavement alone means a flooded street still reads as a street — a band of
      // marsh with dry edges, rather than five tiles of undifferentiated muck.
      if (here === 'sidewalk') continue;

      if (level >= DEEP && here !== 'street') {
        canvas.set(x, y, 'water');
      } else {
        // Sodden ground, roadway included: a flooded street still gets you where you were going.
        canvas.set(x, y, 'swamp');
      }
    }
  }
}

/**
 * An authored stretch of water — the settlement's moat, or a channel somebody wanted in a
 * particular place. Declared rather than rolled, because a defence only works where its builders
 * put it.
 *
 * **Cores and fringes are separate passes, and a fringe never overwrites water.** An L-shaped moat
 * is two overlapping rects, and drawing each one complete in turn left the corner wadeable: the
 * second rect's reeds were written straight over the first rect's water. Caught by the test that
 * walks the whole moat asking whether any of it can be waded.
 */
export function floodCore(canvas: CityCanvas, rect: Rect): void {
  canvas.fill(rect, 'water');
}

/**
 * The reeds one tile out, so the ditch reads as a ditch rather than as a rectangle of blue, and so
 * that standing at its edge is standing in the muck.
 */
export function floodFringe(canvas: CityCanvas, map: GameMapData, rect: Rect): void {
  for (let y = rect.y0 - 1; y <= rect.y1 + 1; y++) {
    for (let x = rect.x0 - 1; x <= rect.x1 + 1; x++) {
      const inside = x >= rect.x0 && x <= rect.x1 && y >= rect.y0 && y <= rect.y1;
      if (inside || getTileId(map, x, y) === 'water') continue;
      canvas.set(x, y, 'swamp');
    }
  }
}
