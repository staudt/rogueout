import { inBounds, setTileId, type GameMapData } from '../GameMap';
import type { Point } from '../../utils/geometry';
import { randomInt, type RNG } from '../../utils/RNG';

/**
 * Carves a guaranteed-walkable route between two anchors, whatever the noise put there.
 *
 * Terrain generation alone can (and for some seeds will) drop a lake or a rock ridge straight
 * across the line between the town and the dungeon entrance. Rather than rejecting such seeds or
 * biasing the noise, we simply overwrite a road on top afterwards — always succeeds, in one pass,
 * for every seed. The road wanders via jittered waypoints so it reads as a trail rather than a
 * ruler-straight line.
 *
 * The carved tiles are returned so callers can keep POIs (and anything else) off the road.
 */

/** All grid points on the Bresenham line from `a` to `b`, inclusive, 8-connected and contiguous. */
export function linePoints(a: Point, b: Point): Point[] {
  const points: Point[] = [];
  let x = a.x;
  let y = a.y;
  const dx = Math.abs(b.x - x);
  const dy = -Math.abs(b.y - y);
  const stepX = x < b.x ? 1 : -1;
  const stepY = y < b.y ? 1 : -1;
  let error = dx + dy;

  for (;;) {
    points.push({ x, y });
    if (x === b.x && y === b.y) break;
    const doubled = 2 * error;
    if (doubled >= dy) {
      error += dy;
      x += stepX;
    }
    if (doubled <= dx) {
      error += dx;
      y += stepY;
    }
  }

  return points;
}

export interface CorridorOptions {
  /** Number of jitter waypoints between the two anchors. 0 = a dead-straight line. */
  waypoints?: number;
  /** Max tiles a waypoint may stray perpendicular to the straight line. */
  jitter?: number;
  /** Tile laid down along the route. */
  tileId?: string;
}

/**
 * Overwrites a walkable route from `from` to `to`. Returns every tile it touched, in order.
 * Both anchors are always included, so they are guaranteed walkable afterwards.
 */
export function carveCorridor(
  map: GameMapData,
  from: Point,
  to: Point,
  rng: RNG,
  options: CorridorOptions = {},
): Point[] {
  const { waypoints = 3, jitter = 4, tileId = 'path' } = options;

  const anchors: Point[] = [from];
  for (let i = 1; i <= waypoints; i++) {
    const t = i / (waypoints + 1);
    const x = Math.round(from.x + (to.x - from.x) * t);
    const y = Math.round(from.y + (to.y - from.y) * t) + randomInt(rng, -jitter, jitter);
    anchors.push({ x, y: clamp(y, 1, map.height - 2) });
  }
  anchors.push(to);

  const carved: Point[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < anchors.length - 1; i++) {
    for (const point of linePoints(anchors[i]!, anchors[i + 1]!)) {
      if (!inBounds(map, point.x, point.y)) continue;
      const key = `${point.x},${point.y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      setTileId(map, point.x, point.y, tileId);
      carved.push(point);
    }
  }

  return carved;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
