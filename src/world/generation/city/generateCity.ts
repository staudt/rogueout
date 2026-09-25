import { createGameMap, isWalkable, type GameMapData } from '../../GameMap';
import { createRNG } from '../../../utils/RNG';
import type { Point } from '../../../utils/geometry';
import type { Monster } from '../../../entities/Monster';
import type { Npc } from '../../../entities/Npc';
import type { GroundItem } from '../../../items/Item';
import type { RegionTransition } from '../../regions/RegionTypes';
import { LANDMARKS, landmarkRect, type LandmarkDef } from '../../landmarks/LandmarkRegistry';
import { reachableWalkable, sealDisconnectedAreas } from '../connectivity';
import { carveCorridor } from '../stitching';
import { rectContains, type Rect } from '../Rect';
import { blockRects, streetRect, type AreaDef } from './AreaDef';
import { CityCanvas } from './CityCanvas';
import { fillBlock } from './blocks';
import { fillCave, openCaveMouths } from './caves';
import { applyFlooding, floodCore, floodFringe } from './flooding';
import { applyVegetation } from './vegetation';
import { applyRuin, blockDamage } from './ruin';
import { StreetGraph } from './StreetGraph';

export interface GeneratedCity {
  map: GameMapData;
  transitions: RegionTransition[];
  npcs: Npc[];
  monsters: Monster[];
  groundItems: GroundItem[];
  /** Waypoints something can patrol, taken from the main avenue. */
  patrolRoute: Point[];
}

/**
 * Builds a city area.
 *
 * The pass order is the whole design, and it is the same discipline the desert generator settled
 * on: **anything that guarantees connectivity runs after anything that can destroy it.** What's
 * different here is that most of the guarantee is structural rather than repaired — see
 * `StreetGraph` and `CityCanvas` — so the repair pass at the end has very little left to do, and
 * the final assert exists to prove it had nothing at all.
 */
export function generateCity(area: AreaDef, seed: number): GeneratedCity {
  const rng = createRNG(seed);

  // 1. Solid. The edge of the world is collapse, not an arbitrary wall.
  const map = createGameMap(area.width, area.height, 'ruin');
  const canvas = new CityCanvas(map);

  // 2. The street lattice, full width. Connected by construction. The outermost tile on each
  //    side is pavement: the same glyph in a paler colour, so a street reads as a road with edges
  //    rather than as a band of undifferentiated grey. It is walkable and carries no mechanics.
  const streetRects = area.streets.map((street) => clampRect(streetRect(street, area), area));
  for (const rect of streetRects) canvas.fill(rect, 'street');

  // The kerbs, laid afterwards and **interrupted at every junction**: a kerb line running straight
  // through a crossroads is the sort of thing you only notice once, and then cannot stop noticing.
  for (let i = 0; i < streetRects.length; i++) {
    const rect = streetRects[i]!;
    const vertical = area.streets[i]!.axis === 'ns';
    const kerbs = vertical
      ? [{ ...rect, x1: rect.x0 }, { ...rect, x0: rect.x1 }]
      : [{ ...rect, y1: rect.y0 }, { ...rect, y0: rect.y1 }];

    for (const kerb of kerbs) {
      for (let y = kerb.y0; y <= kerb.y1; y++) {
        for (let x = kerb.x0; x <= kerb.x1; x++) {
          const atJunction = streetRects.some((other, j) => j !== i && rectContains(other, x, y));
          if (!atJunction) canvas.set(x, y, 'sidewalk');
        }
      }
    }
  }
  const graph = new StreetGraph(area);

  // 2b. The elevated line, laid over the blocks but never over a street: an L is something you
  //     walk under. Protected afterwards so the damage pass leaves the route it marks intact.
  for (const rect of area.elevated ?? []) {
    const clamped = clampRect(rect, area);
    for (let y = clamped.y0; y <= clamped.y1; y++) {
      for (let x = clamped.x0; x <= clamped.x1; x++) {
        if (isWalkable(map, x, y) && map.tiles[y * map.width + x] === 'street') continue;
        canvas.set(x, y, 'ruin');
      }
    }
    canvas.protect(clamped);
  }

  // 3. Landmarks, *before* buildings and damage, and protected from both. A landmark is the
  //    reason an area exists; generation gets to work around it, not over it.
  const placed = area.landmarks
    .map(({ id, x, y }) => ({ def: LANDMARKS[id], origin: { x, y } }))
    .filter((p): p is { def: LandmarkDef; origin: Point } => p.def !== undefined);

  assertLandmarksClearOfStreets(area, placed);

  const contents = { transitions: [] as RegionTransition[], npcs: [] as Npc[], monsters: [] as Monster[], groundItems: [] as GroundItem[] };
  const anchors: Point[] = [area.entry];

  for (const { def, origin } of placed) {
    def.stamp((x, y, tileId) => canvas.set(origin.x + x, origin.y + y, tileId));
    canvas.protect(landmarkRect(def, origin));
    for (const rect of def.protect ?? []) {
      canvas.protect({ x0: origin.x + rect.x0, y0: origin.y + rect.y0, x1: origin.x + rect.x1, y1: origin.y + rect.y1 });
    }

    const produced = def.contents?.(origin);
    if (produced) {
      contents.transitions.push(...(produced.transitions ?? []));
      contents.npcs.push(...(produced.npcs ?? []));
      contents.monsters.push(...(produced.monsters ?? []));
      contents.groundItems.push(...(produced.groundItems ?? []));
    }
    for (const anchor of def.anchors ?? []) {
      anchors.push({ x: origin.x + anchor.x, y: origin.y + anchor.y });
    }
  }

  // 3b. Authored water. After the landmarks, so a moat can be drawn tight against one, and
  //     protected afterwards so nothing later fills it in.
  //     Every core first, then every fringe, then protection — an L-shaped moat is two
  //     overlapping rects, and finishing each one in turn left its corner wadeable.
  for (const rect of area.water ?? []) floodCore(canvas, rect);
  for (const rect of area.water ?? []) floodFringe(canvas, map, rect);
  for (const rect of area.water ?? []) {
    canvas.protect({ x0: rect.x0 - 1, y0: rect.y0 - 1, x1: rect.x1 + 1, y1: rect.y1 + 1 });
  }

  // 4. The blocks. Roughly half are still buildings and half have come down into cave, decided
  //    by the same damage field the ruin pass uses so that it comes in drifts — a run of standing
  //    frontage, then a run of collapse — rather than alternating block by block.
  //
  //    Buildings are written only inside a block rect, which is the complement of the lattice, so
  //    none can land on a street however the subdivision falls. Caved blocks are deliberately not
  //    added to `footprints`: they have already collapsed and the ruin pass has nothing to say
  //    about them.
  const footprints: Rect[] = [];
  for (const block of blockRects(area)) {
    if (hasCollapsed(block, seed, area.decay ?? 0)) {
      fillCave(canvas, block, rng);
      openCaveMouths(canvas, block, rng);
    } else {
      footprints.push(...fillBlock(canvas, block, rng));
    }
  }

  // 5. Damage. The only pass that writes everywhere, and the only one that needs guarding: it
  //    can't touch a landmark (CityCanvas refuses) and can't cut the lattice (StreetGraph refuses).
  applyRuin(canvas, footprints, graph, {
    seed,
    decay: area.decay ?? 0,
    boundaries: area.boundaries ?? [],
  });

  // 5b. Flooding, last of the terrain passes so it lands on the finished ground. Impassable water
  //     is confined to block interiors, so it can never cut the street lattice.
  applyFlooding(canvas, map, seed);

  // 5c. Growth. Last, so it comes up through whatever the other passes left — weeds through the
  //     asphalt, thickets in the blocks. A ruin is not a city with the people taken out of it.
  applyVegetation(canvas, map, seed);

  // 6. Repair anything still stranded, in *rubble* rather than street: somebody cleared a way
  //    through the debris, which is what the city would actually look like. A road appearing out
  //    of nowhere to reach a doorway would read as the generator apologising.
  let reached = reachableWalkable(map, area.entry.x, area.entry.y);
  for (const anchor of anchors) {
    if (reached.has(`${anchor.x},${anchor.y}`)) continue;
    const nearest = nearestReached(anchor, reached);
    if (!nearest) continue;
    carveCorridor(map, nearest, anchor, rng, { tileId: 'rubble', waypoints: 1, jitter: 1 });
    reached = reachableWalkable(map, area.entry.x, area.entry.y);
  }

  // 7. Seal, so the finished map has exactly one walkable component.
  sealDisconnectedAreas(map, area.entry.x, area.entry.y, 'ruin');

  // 8. Prove it. A landmark or a doorway silently dropped is the failure mode that would otherwise
  //    only surface in a playthrough, and the desert already taught this lesson once.
  const finalReach = reachableWalkable(map, area.entry.x, area.entry.y);
  for (const anchor of anchors) {
    if (!isWalkable(map, anchor.x, anchor.y) || !finalReach.has(`${anchor.x},${anchor.y}`)) {
      throw new Error(`${area.id}: anchor ${anchor.x},${anchor.y} is not reachable from the entry`);
    }
  }
  for (const transition of contents.transitions) {
    if (!finalReach.has(`${transition.x},${transition.y}`)) {
      throw new Error(`${area.id}: transition at ${transition.x},${transition.y} is not reachable`);
    }
  }

  return { map, ...contents, patrolRoute: patrolAlong(area, map) };
}

/**
 * Whether a block has come down. Read off the same damage field the ruin pass uses, at the block's
 * centre, so collapse arrives in drifts and a caved block sits next to other wrecked ones.
 */
function hasCollapsed(block: Rect, seed: number, decay: number): boolean {
  const cx = (block.x0 + block.x1) / 2;
  const cy = (block.y0 + block.y1) / 2;
  return blockDamage(cx, cy, seed, decay) >= COLLAPSE_THRESHOLD;
}

/** Tuned so that roughly half the blocks are cave and half are still buildings. */
const COLLAPSE_THRESHOLD = 0.53;

function clampRect(rect: Rect, area: AreaDef): Rect {
  return {
    x0: Math.max(0, rect.x0),
    y0: Math.max(0, rect.y0),
    x1: Math.min(area.width - 1, rect.x1),
    y1: Math.min(area.height - 1, rect.y1),
  };
}

/**
 * A street crossing a landmark would be written before the landmark and then stamped over, leaving
 * the graph believing in a stretch of road that is now somebody's outfield. Cheaper to refuse the
 * area def than to debug the patrol that walks into a wall.
 */
function assertLandmarksClearOfStreets(area: AreaDef, placed: Array<{ def: LandmarkDef; origin: Point }>): void {
  for (const { def, origin } of placed) {
    const rect = landmarkRect(def, origin);
    for (const street of area.streets) {
      const s = streetRect(street, area);
      const overlaps = rect.x0 <= s.x1 && rect.x1 >= s.x0 && rect.y0 <= s.y1 && rect.y1 >= s.y0;
      if (overlaps) {
        throw new Error(`${area.id}: ${street.name} runs through ${def.name}`);
      }
    }
  }
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
 * Waypoints down the widest east-west street. Patrols walking a shared route is what makes them
 * meet each other; two bands wandering at random on a map this size essentially never would.
 */
function patrolAlong(area: AreaDef, map: GameMapData): Point[] {
  const avenue = area.streets
    .filter((s) => s.axis === 'ew')
    .sort((a, b) => b.width - a.width)[0];
  if (!avenue) return [];

  const y = avenue.at + Math.floor(avenue.width / 2);
  const route: Point[] = [];
  for (let x = 2; x < area.width - 2; x += 6) {
    if (isWalkable(map, x, y)) route.push({ x, y });
  }
  return route;
}
