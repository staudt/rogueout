import { createGameMap, isWalkable, type GameMapData } from '../../GameMap';
import { createRNG } from '../../../utils/RNG';
import type { Point } from '../../../utils/geometry';
import type { Monster } from '../../../entities/Monster';
import type { Npc } from '../../../entities/Npc';
import type { GroundItem } from '../../../items/Item';
import type { RegionTransition } from '../../regions/RegionTypes';
import type { Place, PlaceContents } from '../../places/Places';
import { reachableWalkable, sealDisconnectedAreas } from '../connectivity';
import { carveCorridor } from '../stitching';
import type { Rect } from '../Rect';
import { CityCanvas } from '../city/CityCanvas';
import { fillBlock } from '../city/blocks';
import { fillCave, openCaveMouths } from '../city/caves';
import { applyFlooding, floodCore, floodFringe } from '../city/flooding';
import { applyRuin, blockDamage } from '../city/ruin';
import { applyVegetation } from '../city/vegetation';
import { populate } from '../city/inhabitants';
import {
  instructionRegions,
  literalTile,
  parsePlan,
  planAt,
  roadClassOf,
  ROAD_CLASS_ORDER,
  INSTRUCTIONS,
  type AreaPlan,
  type RoadClass,
} from './AreaPlan';

export interface PlannedArea {
  id: string;
  name: string;
  arrival?: string;
  /** The drawn plan, as loaded from its text file. */
  plan: string;
  seed: number;
  /** Where the player is considered to start; connectivity is measured from here. */
  entry: Point;
  /** Where this area sits in a city-wide tile frame. */
  worldOrigin: { x: number; y: number };
  /** Named somewheres, with their coordinates. See `places/Places.ts`. */
  places: Place[];
  /** Raises damage everywhere in the procedural regions, 0..1. */
  decay?: number;
}

export interface GeneratedArea {
  map: GameMapData;
  transitions: RegionTransition[];
  npcs: Npc[];
  monsters: Monster[];
  groundItems: GroundItem[];
  patrolRoute: Point[];
  /** How busy each tile's road is, row-major. Content density reads it. */
  roadClass: Uint8Array;
  /** Named somewheres, for the location readout. */
  places: Array<{ name: string; rect: Rect }>;
}

/**
 * Builds an area from its drawn plan.
 *
 * The pass order keeps the discipline the generated version settled on — **anything that
 * guarantees connectivity runs after anything that can destroy it** — but the guarantee itself has
 * moved. It used to be structural: streets were a lattice connected by construction, blocks were
 * its complement, and `StreetGraph` refused any damage that would cut the network. Now the
 * connectivity is *drawn*, so it is **checked rather than assured**, and the loader complains
 * loudly rather than the design making the failure impossible. That is a genuinely weaker
 * guarantee and the price of being able to draw the map.
 *
 * What is drawn is never damaged. Ruin, flooding and growth touch only the regions the plan left
 * to the generator, so a street you drew stays where you put it.
 */
export function generateFromPlan(area: PlannedArea): GeneratedArea {
  const plan = parsePlan(area.plan);
  const rng = createRNG(area.seed);

  const map = createGameMap(plan.width, plan.height, 'ruin');
  const canvas = new CityCanvas(map);
  const roadClass = new Uint8Array(plan.width * plan.height);

  // 1. Everything literal, exactly as drawn.
  for (let y = 0; y < plan.height; y++) {
    for (let x = 0; x < plan.width; x++) {
      const char = planAt(plan, x, y);
      const tile = literalTile(char);
      if (tile) canvas.set(x, y, tile);

      const road = roadClassOf(char);
      if (road !== 'none') roadClass[y * plan.width + x] = ROAD_CLASS_ORDER.indexOf(road);
    }
  }

  // 2. The named places. They draw nothing — the art is in the plan — but what is drawn inside an
  //    authored one is protected from everything after, which is what makes hand-drawn work safe
  //    on a map that is otherwise being weathered.
  const contents: PlaceContents & Required<Pick<PlaceContents, 'transitions' | 'npcs' | 'monsters' | 'groundItems'>> = {
    transitions: [],
    npcs: [],
    monsters: [],
    groundItems: [],
  };
  const anchors: Point[] = [area.entry];
  const sanctuaries: Rect[] = [];

  for (const place of area.places) {
    const origin = { x: place.rect.x0, y: place.rect.y0 };
    if (place.authored) canvas.protect(place.rect);
    if (place.sanctuary) sanctuaries.push(place.rect);

    const produced = place.contents?.(origin);
    if (produced) {
      contents.transitions.push(...(produced.transitions ?? []));
      contents.npcs.push(...(produced.npcs ?? []));
      contents.monsters.push(...(produced.monsters ?? []));
      contents.groundItems.push(...(produced.groundItems ?? []));
    }
    for (const anchor of place.anchors ?? []) {
      anchors.push({ x: origin.x + anchor.x, y: origin.y + anchor.y });
    }
  }

  // 3. Water drawn as `~` is already down; its reed fringe is applied where it meets dry ground.
  const drawnWater = waterRects(plan);
  for (const rect of drawnWater) floodCore(canvas, rect);
  for (const rect of drawnWater) floodFringe(canvas, map, rect);
  for (const rect of drawnWater) canvas.protect(rect);

  // 4. The procedural regions. Each drawn shape is filled as its character asks — and the shape
  //    can be anything, which is the point: a triangle left where a diagonal cuts the grid gets
  //    triangular buildings rather than being quietly squared off.
  const footprints: Rect[] = [];
  for (const region of instructionRegions(plan)) {
    const bounds = boundsOf(region.tiles);
    const kind = INSTRUCTIONS[region.char]!;
    const collapses =
      kind === 'collapse' ||
      (kind === 'either' && blockDamage(midX(bounds), midY(bounds), area.seed, area.decay ?? 0) >= 0.53);

    // Confined to the shape actually drawn, so a block the diagonal cut in half doesn't pave
    // over the street on its way to filling its own bounding box.
    canvas.restrictTo(region.tiles);
    if (collapses) {
      fillCave(canvas, bounds, rng);
      openCaveMouths(canvas, bounds, rng);
    } else {
      footprints.push(...fillBlock(canvas, bounds, rng));
    }
    canvas.release();
  }

  // 5. Damage, flooding and growth — over the procedural ground only, since the protect mask
  //    holds them off the landmarks and the drawn water.
  applyRuin(canvas, footprints, { seed: area.seed, decay: area.decay ?? 0, boundaries: [] });
  applyFlooding(canvas, map, area.seed);
  applyVegetation(canvas, map, area.seed, roadClass);

  // 6. Repair, seal, and prove it.
  let reached = reachableWalkable(map, area.entry.x, area.entry.y);
  for (const anchor of anchors) {
    if (reached.has(`${anchor.x},${anchor.y}`)) continue;
    const nearest = nearestReached(anchor, reached);
    if (!nearest) continue;
    carveCorridor(map, nearest, anchor, rng, { tileId: 'rubble', waypoints: 1, jitter: 1 });
    reached = reachableWalkable(map, area.entry.x, area.entry.y);
  }
  sealDisconnectedAreas(map, area.entry.x, area.entry.y, 'ruin');

  const finalReach = reachableWalkable(map, area.entry.x, area.entry.y);
  for (const anchor of [...anchors, ...contents.transitions]) {
    if (!isWalkable(map, anchor.x, anchor.y) || !finalReach.has(`${anchor.x},${anchor.y}`)) {
      throw new PlanMismatchError(
        `${area.id}: ${anchor.x},${anchor.y} cannot be reached from the entry. ` +
          'Something the plan draws has walled it off.',
      );
    }
  }

  return {
    map,
    ...contents,
    monsters: [...contents.monsters, ...populate(map, rng, sanctuaries, roadClass)],
    patrolRoute: patrolAlongArterial(map, roadClass, plan.width, plan.height),
    roadClass,
    places: area.places.map((place) => ({ name: place.name, rect: place.rect })),
  };
}

export class PlanMismatchError extends Error {}

function boundsOf(tiles: readonly Point[]): Rect {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const tile of tiles) {
    x0 = Math.min(x0, tile.x);
    y0 = Math.min(y0, tile.y);
    x1 = Math.max(x1, tile.x);
    y1 = Math.max(y1, tile.y);
  }
  return { x0, y0, x1, y1 };
}

const midX = (rect: Rect) => (rect.x0 + rect.x1) / 2;
const midY = (rect: Rect) => (rect.y0 + rect.y1) / 2;

/** Drawn water, as one rect per contiguous run. Enough for the fringe to find its edges. */
function waterRects(plan: AreaPlan): Rect[] {
  const rects: Rect[] = [];
  for (let y = 0; y < plan.height; y++) {
    let start = -1;
    for (let x = 0; x <= plan.width; x++) {
      const isWater = x < plan.width && planAt(plan, x, y) === '~';
      if (isWater && start === -1) start = x;
      if (!isWater && start !== -1) {
        rects.push({ x0: start, y0: y, x1: x - 1, y1: y });
        start = -1;
      }
    }
  }
  return rects;
}

function nearestReached(target: Point, reached: Set<string>): Point | null {
  let best: Point | null = null;
  let bestDistance = Infinity;
  for (const key of reached) {
    const [x, y] = key.split(',').map(Number) as [number, number];
    const distance = Math.hypot(x - target.x, y - target.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = { x, y };
    }
  }
  return best;
}

/**
 * Waypoints along the longest arterial drawn, in walking order.
 *
 * Order matters and reading order is not it: patrollers step from waypoint to waypoint, so a list
 * gathered row by row sends them jumping back and forth across the map. The arterial is taken one
 * step at a time from one end, which also means a **diagonal** road produces a diagonal patrol.
 *
 * Patrols walking a shared route is what makes them meet each other; two bands wandering at random
 * on a map this size essentially never would.
 */
function patrolAlongArterial(map: GameMapData, roadClass: Uint8Array, width: number, height: number): Point[] {
  const arterial = ROAD_CLASS_ORDER.indexOf('arterial' as RoadClass);
  const isArterial = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < width && y < height && roadClass[y * width + x] === arterial && isWalkable(map, x, y);

  // Walk the arterial from wherever it starts, greedily taking the nearest unvisited tile. Crude,
  // and enough: an arterial is a line, so "nearest unvisited" follows it.
  let start: Point | null = null;
  for (let y = 0; y < height && !start; y++) {
    for (let x = 0; x < width; x++) {
      if (isArterial(x, y)) {
        start = { x, y };
        break;
      }
    }
  }
  if (!start) return [];

  const route: Point[] = [start];
  const visited = new Set<number>([start.y * width + start.x]);
  let current = start;

  for (;;) {
    let next: Point | null = null;
    let nearest = Infinity;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (!isArterial(x, y) || visited.has(y * width + x)) continue;
        const distance = Math.max(Math.abs(x - current.x), Math.abs(y - current.y));
        if (distance < nearest) {
          nearest = distance;
          next = { x, y };
        }
      }
    }

    // A jump this long means the arterial has ended and we've found a different one.
    if (!next || nearest > 8) break;

    visited.add(next.y * width + next.x);
    if (Math.max(Math.abs(next.x - current.x), Math.abs(next.y - current.y)) >= 1) current = next;
    if (route.length === 0 || Math.max(Math.abs(next.x - route.at(-1)!.x), Math.abs(next.y - route.at(-1)!.y)) >= 6) {
      route.push(next);
    }
  }

  return route;
}
