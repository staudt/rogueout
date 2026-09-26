import { getTileId, isWalkable, type GameMapData } from '../../GameMap';
import { fbm2D } from '../noise';
import type { CityCanvas } from './CityCanvas';

/**
 * What thirty years without anyone does to a city.
 *
 * The first version of this area had no vegetation at all outside the ball park, on the reasoning
 * that the field should be the only green for miles. That was wrong, and the place read as
 * sterile: a ruin is not a city with the people removed, it is a city with a forest coming up
 * through it. Weeds break the asphalt, thickets take the blocks.
 *
 * Two noise fields at different scales, so growth comes in drifts rather than as an even speckle:
 * a stretch of road gone completely to grass, then a stretch still bare.
 */
const GROWTH_NOISE = { octaves: 3, persistence: 0.55, lacunarity: 2.3 };
const GROWTH_SCALE = 0.05;
const THICKET_SCALE = 0.11;

/**
 * Above these the ground has gone to weed. **Rubble greens over far more readily than asphalt** —
 * broken ground holds soil and a road surface does not — which is both what actually happens and
 * what keeps the street grid legible. Growing them at the same rate put a third of the map under
 * weed and left the roads barely readable as roads.
 */
const WEEDS_ON_RUIN = 0.42;
/**
 * By how busy the road is. **The more a road is used, the less it grows over** — which is both
 * what happens and what the map needs: a whole stretch of arterial vanishing under weed stopped
 * it reading as a street at all, and Clark disappeared for thirty tiles at a run. It also gives
 * the street hierarchy something visible to be: arterials stay open, alleys go green.
 */
const WEEDS_ON_ROAD: Record<number, number> = {
  1: 0.5, // alley — barely used, and it shows
  2: 0.66, // ordinary street
  3: 0.84, // arterial — people walk this one
};
/** Above this a thicket has taken hold. Ruins only — see below. */
const THICKET = 0.56;

export function applyVegetation(
  canvas: CityCanvas,
  map: GameMapData,
  seed: number,
  roadClass?: Uint8Array,
): void {
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (!isWalkable(map, x, y)) continue;

      const here = getTileId(map, x, y);
      // Water and its reeds are their own thing, and the ball park is protected anyway.
      if (here === 'swamp' || here === 'grass') continue;

      const onRoad = here === 'street' || here === 'sidewalk';
      const busyness = roadClass?.[y * map.width + x] ?? 2;
      const threshold = onRoad ? (WEEDS_ON_ROAD[busyness] ?? 0.66) : WEEDS_ON_RUIN;

      const growth = fbm2D(seed + 613, x * GROWTH_SCALE, y * GROWTH_SCALE, GROWTH_NOISE);
      if (growth < threshold) continue;

      const thicket = fbm2D(seed + 1229, x * THICKET_SCALE, y * THICKET_SCALE, GROWTH_NOISE);

      // A thicket is impassable, so it is kept off the roads entirely: nothing that grows across
      // a street may cut the lattice, which is the same rule the deep water follows. In the ruins
      // it is free to close a passage, and the repair pass will cut back through if it has shut
      // off something that has to be reachable.
      if (!onRoad && thicket >= THICKET) {
        canvas.set(x, y, 'thicket');
      } else {
        canvas.set(x, y, 'weeds');
      }
    }
  }
}
