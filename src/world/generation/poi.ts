import { isWalkable, setTileId, type GameMapData } from '../GameMap';
import { chebyshevDistance, type Point } from '../../utils/geometry';
import { randomInt, type RNG } from '../../utils/RNG';
import { rectContains, type Rect } from './Rect';

/**
 * Points of interest scattered through the generated wilderness — the reason to leave the road.
 *
 * Placement is seeded rejection sampling: propose a random tile, reject it if it breaks a
 * constraint (in water, too near another POI, on the road), repeat until enough are placed or the
 * attempt budget runs out. Rejection sampling rather than a grid/Poisson scheme because the
 * constraint set is cheap to evaluate and the target count is tiny (2-4).
 *
 * Each POI also carries the content it holds (loot, and a guard for ruins). Choosing that here,
 * off the same seeded RNG, keeps region setup dumb: RegionRegistry just materializes what
 * generation decided, so the whole overworld is reproducible from one seed.
 */

export type PoiKind = 'ruin' | 'camp';

export interface Poi {
  kind: PoiKind;
  /** Tile the loot sits on — also the structure's center. */
  x: number;
  y: number;
  /** Item def id (see items/ItemData.ts) lying at (x, y). */
  loot: string;
  /** Monster def id (see entities/MonsterData.ts) guarding the POI, if any. */
  guard?: { defId: string; x: number; y: number };
}

const RUIN_LOOT = ['machete', 'paddedVest', 'pipeWrench'];
const CAMP_LOOT = ['medPack'];

/** Half-width of a ruin's wall ring — 1 gives the 3x3 interior/5x5 footprint used below. */
const RUIN_RADIUS = 2;
const CAMP_RADIUS = 1;

export interface ScatterOptions {
  /** How many POIs to aim for. Fewer are returned if the terrain can't fit them. */
  count?: number;
  /** Minimum Chebyshev distance between two POI centers. */
  minSpacing?: number;
  /** Minimum Chebyshev distance from any corridor tile, so POIs aren't just sitting on the road. */
  roadClearance?: number;
  maxAttempts?: number;
}

/**
 * Places POIs inside `area`, carving each one's structure into the map. `roadTiles` are kept
 * clear. Returns the POIs actually placed.
 */
export function scatterPois(
  map: GameMapData,
  area: Rect,
  rng: RNG,
  roadTiles: Point[],
  options: ScatterOptions = {},
): Poi[] {
  const { count = randomInt(rng, 2, 4), minSpacing = 8, roadClearance = 3, maxAttempts = 400 } = options;

  const placed: Poi[] = [];
  let attempts = 0;

  while (placed.length < count && attempts < maxAttempts) {
    attempts++;

    const kind: PoiKind = rng() < 0.5 ? 'ruin' : 'camp';
    const radius = kind === 'ruin' ? RUIN_RADIUS : CAMP_RADIUS;
    const x = randomInt(rng, area.x0 + radius, area.x1 - radius);
    const y = randomInt(rng, area.y0 + radius, area.y1 - radius);
    const center = { x, y };

    if (!rectContains(area, x, y)) continue;
    // Must sit on dry land: dropping a ruin into a lake would leave it stranded behind water.
    if (!isWalkable(map, x, y)) continue;
    if (placed.some((poi) => chebyshevDistance(poi, center) < minSpacing)) continue;
    if (roadTiles.some((tile) => chebyshevDistance(tile, center) < roadClearance)) continue;

    placed.push(kind === 'ruin' ? carveRuin(map, center, rng) : carveCamp(map, center, rng));
  }

  return placed;
}

function carveRuin(map: GameMapData, center: Point, rng: RNG): Poi {
  // A crumbling walled enclosure: rock ring, cleared interior, one gap to walk in through.
  for (let dy = -RUIN_RADIUS; dy <= RUIN_RADIUS; dy++) {
    for (let dx = -RUIN_RADIUS; dx <= RUIN_RADIUS; dx++) {
      const onRing = Math.abs(dx) === RUIN_RADIUS || Math.abs(dy) === RUIN_RADIUS;
      setTileId(map, center.x + dx, center.y + dy, onRing ? 'rock' : 'sand');
    }
  }

  // Open the gap on a side that actually leads back out onto walkable ground where possible —
  // a doorway onto a lake would strand the interior (sealDisconnectedAreas would then fill it in).
  const gaps: Point[] = [
    { x: center.x, y: center.y - RUIN_RADIUS },
    { x: center.x, y: center.y + RUIN_RADIUS },
    { x: center.x - RUIN_RADIUS, y: center.y },
    { x: center.x + RUIN_RADIUS, y: center.y },
  ];
  const outward: Point[] = [
    { x: 0, y: -1 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 1, y: 0 },
  ];
  const start = randomInt(rng, 0, gaps.length - 1);
  let gapIndex = start;
  for (let i = 0; i < gaps.length; i++) {
    const candidate = (start + i) % gaps.length;
    const gap = gaps[candidate]!;
    const step = outward[candidate]!;
    if (isWalkable(map, gap.x + step.x, gap.y + step.y)) {
      gapIndex = candidate;
      break;
    }
  }
  const gap = gaps[gapIndex]!;
  setTileId(map, gap.x, gap.y, 'path');

  const loot = RUIN_LOOT[randomInt(rng, 0, RUIN_LOOT.length - 1)]!;
  const guardSpot = interiorSpotAwayFrom(center, gap);
  return {
    kind: 'ruin',
    x: center.x,
    y: center.y,
    loot,
    guard: { defId: rng() < 0.5 ? 'wakeRaider' : 'duneRunner', x: guardSpot.x, y: guardSpot.y },
  };
}

function carveCamp(map: GameMapData, center: Point, rng: RNG): Poi {
  // An abandoned camp: just a small cleared patch, open on all sides.
  for (let dy = -CAMP_RADIUS; dy <= CAMP_RADIUS; dy++) {
    for (let dx = -CAMP_RADIUS; dx <= CAMP_RADIUS; dx++) {
      setTileId(map, center.x + dx, center.y + dy, 'sand');
    }
  }

  const loot = CAMP_LOOT[randomInt(rng, 0, CAMP_LOOT.length - 1)]!;
  return { kind: 'camp', x: center.x, y: center.y, loot };
}

/** An interior tile on the opposite side of the enclosure from the gap, so the guard isn't in the doorway. */
function interiorSpotAwayFrom(center: Point, gap: Point): Point {
  return { x: center.x - Math.sign(gap.x - center.x), y: center.y - Math.sign(gap.y - center.y) };
}
