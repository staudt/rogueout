import { setTileId, type GameMapData } from '../GameMap';
import { fbm2D } from './noise';
import type { Rect } from './Rect';

/**
 * Terrain generation for the open (non-town) portion of the overworld. Two independent noise
 * fields — elevation and moisture — are sampled per tile and thresholded into terrain types, the
 * standard cheap "biome table" approach: elevation decides water/land/rock, moisture decides what
 * kind of land. Using two fields rather than one is what keeps lakes from always being ringed by
 * the same vegetation.
 *
 * Pure with respect to the seed: no RNG stream, so a tile's terrain depends only on its own
 * coordinates. Nothing here guarantees connectivity — that is stitching.ts's and
 * sealDisconnectedAreas()'s job, deliberately kept separate so terrain stays tunable in isolation.
 */

/** Tile size of one noise cell — bigger = broader, smoother landmasses. */
const TERRAIN_SCALE = 14;
const MOISTURE_SCALE = 9;

/**
 * Tuned for a desert: water is rare enough to be an event, scrub clings on in the wetter hollows,
 * and most of the map is sand. Rock ridges are left common — they're what makes the open ground
 * worth crossing rather than a featureless plain, and under daylight sight they're the only thing
 * that hides anything.
 */
export const TERRAIN_THRESHOLDS = {
  /** Below this elevation is water. Rare: a desert's water is worth walking to. */
  water: 0.26,
  /** Above this elevation is impassable rock. */
  rock: 0.70,
  /** Above this moisture (on ordinary land) is a stand of dry trees. */
  tree: 0.82,
  /** Above this moisture (on ordinary land) is scrub grass; below it, sand. */
  grass: 0.62,
} as const;

export function terrainAt(seed: number, x: number, y: number): string {
  const elevation = fbm2D(seed, x / TERRAIN_SCALE, y / TERRAIN_SCALE, { octaves: 4 });
  if (elevation < TERRAIN_THRESHOLDS.water) return 'water';
  if (elevation > TERRAIN_THRESHOLDS.rock) return 'rock';

  const moisture = fbm2D(seed + 7777, x / MOISTURE_SCALE, y / MOISTURE_SCALE, { octaves: 3 });
  if (moisture > TERRAIN_THRESHOLDS.tree) return 'tree';
  if (moisture > TERRAIN_THRESHOLDS.grass) return 'grass';
  return 'sand';
}

/** Writes generated terrain over every tile of `area`. Anything already there is overwritten. */
export function generateWilderness(map: GameMapData, area: Rect, seed: number): void {
  for (let y = area.y0; y <= area.y1; y++) {
    for (let x = area.x0; x <= area.x1; x++) {
      setTileId(map, x, y, terrainAt(seed, x, y));
    }
  }
}
