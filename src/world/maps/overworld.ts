import { createGameMap, isWalkable, setTileId, type GameMapData } from '../GameMap';
import { createRNG } from '../../utils/RNG';
import { sealDisconnectedAreas } from '../generation/connectivity';
import { scatterPois, type Poi } from '../generation/poi';
import type { Rect } from '../generation/Rect';
import { carveCorridor } from '../generation/stitching';
import { generateWilderness } from '../generation/wilderness';

/**
 * The overworld: town and open wilderness as ONE continuous map, not separate regions — walking
 * from town into the wilds is a plain step, no transition. Only truly separate places (going
 * underground into a dungeon level) are their own regions. Sized well beyond the 40x25 viewport
 * so camera scrolling is actually visible (see ui/Camera.ts).
 *
 * The town half is handcrafted (fixed shop, fixed anchors — content authors need stable
 * coordinates); the eastern half is procedurally generated (M6) directly into this same grid.
 * Generation order matters and is the whole trick to keeping a generated world safe to inhabit:
 *
 *   1. handcrafted town      — fixed, never touched by generation
 *   2. noise terrain         — may drop lakes/ridges anywhere, including across the route east
 *   3. stitched road         — overwrites whatever step 2 produced along the town->dungeon route,
 *                              so that route is walkable for *every* seed
 *   4. POIs                  — rejection-sampled onto dry land, off the road
 *   5. seal disconnected     — anything still unreachable from the town becomes solid rock, so the
 *                              finished map has exactly one walkable component (the invariant
 *                              tests/region-connectivity.test.ts enforces)
 */
const WIDTH = 70;
const HEIGHT = 30;

/**
 * Fixed world seed. The map is generated once per new game and then saved as tiles (not as a
 * seed), so changing this only affects new games — see the save-schema decision in the plan.
 */
export const OVERWORLD_SEED = 20260923;

export const OVERWORLD_SPAWN = { x: 5, y: 15 };
export const OVERWORLD_SHOPKEEPER_POS = { x: 12, y: 6 };
export const OVERWORLD_HERB_POS = { x: 8, y: 9 };
export const OVERWORLD_DUNGEON_ENTRANCE = { x: 65, y: 15 };
export const OVERWORLD_SPAWN_FROM_DUNGEON = { x: 63, y: 15 };

/** Handcrafted town, left edge to the gate. Generation never writes inside this. */
const TOWN_RECT: Rect = { x0: 1, y0: 1, x1: 20, y1: HEIGHT - 2 };
/** Where the town ends and generated terrain begins. */
const WILDERNESS_RECT: Rect = { x0: TOWN_RECT.x1 + 1, y0: 1, x1: WIDTH - 2, y1: HEIGHT - 2 };
/** POIs stay a tile clear of the map border so their walls never merge into it. */
const POI_RECT: Rect = {
  x0: WILDERNESS_RECT.x0 + 1,
  y0: WILDERNESS_RECT.y0 + 1,
  x1: WILDERNESS_RECT.x1 - 1,
  y1: WILDERNESS_RECT.y1 - 1,
};
/** Town-side end of the road east. */
const TOWN_GATE = { x: TOWN_RECT.x1, y: 15 };

export interface GeneratedOverworld {
  map: GameMapData;
  /** Generated points of interest, with the content each one holds. Placed by RegionRegistry. */
  pois: Poi[];
}

export function generateOverworld(seed: number = OVERWORLD_SEED): GeneratedOverworld {
  // Solid rock everywhere first: the outermost ring is never overwritten, so it becomes the
  // impassable edge of the world.
  const map = createGameMap(WIDTH, HEIGHT, 'rock');

  buildTown(map);
  generateWilderness(map, WILDERNESS_RECT, seed);

  const rng = createRNG(seed);
  // Two segments: a wandering trail out to the dungeon's doorstep, then a short straight run onto
  // the entrance itself — the straight part guarantees the tile you're returned to when climbing
  // back out of the dungeon (OVERWORLD_SPAWN_FROM_DUNGEON) is walkable, jitter or not.
  const road = carveCorridor(map, TOWN_GATE, OVERWORLD_SPAWN_FROM_DUNGEON, rng);
  road.push(...carveCorridor(map, OVERWORLD_SPAWN_FROM_DUNGEON, OVERWORLD_DUNGEON_ENTRANCE, rng, { waypoints: 0 }));

  const pois = scatterPois(map, POI_RECT, rng, road);

  // The dungeon mouth, marked so it's findable from across the desert instead of being an
  // invisible trigger tile.
  setTileId(map, OVERWORLD_DUNGEON_ENTRANCE.x, OVERWORLD_DUNGEON_ENTRANCE.y, 'stairsDown');

  sealDisconnectedAreas(map, OVERWORLD_SPAWN.x, OVERWORLD_SPAWN.y);

  // Sealing can (rarely) fill in a POI that generation left stranded — e.g. a ruin whose only
  // doorway opened onto water. Drop those, and any guard the seal walled in, so RegionRegistry
  // never places content on a tile that no longer exists as floor.
  const survivingPois = pois
    .filter((poi) => isWalkable(map, poi.x, poi.y))
    .map((poi) => (poi.guard && !isWalkable(map, poi.guard.x, poi.guard.y) ? { ...poi, guard: undefined } : poi));

  return { map, pois: survivingPois };
}

function buildTown(map: GameMapData): void {
  for (let y = TOWN_RECT.y0; y <= TOWN_RECT.y1; y++) {
    for (let x = TOWN_RECT.x0; x <= TOWN_RECT.x1; x++) {
      setTileId(map, x, y, 'floor');
    }
  }

  // The general store — the only "building" for now; more towns/structures land as more content.
  for (let x = 11; x <= 14; x++) {
    setTileId(map, x, 5, 'wall');
    setTileId(map, x, 7, 'wall');
  }
  for (let y = 5; y <= 7; y++) {
    setTileId(map, 11, y, 'wall');
    setTileId(map, 14, y, 'wall');
  }
  setTileId(map, 11, 6, 'floor'); // door
}
