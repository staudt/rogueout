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
const WEEDS_ON_ROAD = 0.62;
/** Above this a thicket has taken hold. Ruins only — see below. */
const THICKET = 0.56;

export function applyVegetation(canvas: CityCanvas, map: GameMapData, seed: number): void {
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (!isWalkable(map, x, y)) continue;

      const here = getTileId(map, x, y);
      // Water and its reeds are their own thing, and the ball park is protected anyway.
      if (here === 'swamp' || here === 'grass') continue;

      const onRoad = here === 'street' || here === 'sidewalk';
      const growth = fbm2D(seed + 613, x * GROWTH_SCALE, y * GROWTH_SCALE, GROWTH_NOISE);
      if (growth < (onRoad ? WEEDS_ON_ROAD : WEEDS_ON_RUIN)) continue;

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
