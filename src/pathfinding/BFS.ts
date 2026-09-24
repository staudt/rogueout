import { chebyshevDistance, type Point } from '../utils/geometry';

const NEIGHBOR_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

export type IsPassableFn = (x: number, y: number) => boolean;

function key(p: Point): string {
  return `${p.x},${p.y}`;
}

function reconstructPath(cameFrom: Map<string, Point>, start: Point, goal: Point): Point[] {
  const path: Point[] = [];
  let current: Point | undefined = goal;
  while (current && !(current.x === start.x && current.y === start.y)) {
    path.push(current);
    current = cameFrom.get(key(current));
  }
  return path.reverse();
}

/**
 * Uniform-cost BFS (diagonal treated as cost 1, matching roguelike convention — no weighted A*
 * needed while every tile costs the same to cross). Returns the step-by-step path from
 * (excluding) `start` to (including) `goal`, or null if unreachable. `maxNodes` bounds the
 * search as cheap insurance against pathological inputs; our map sizes never come close to it.
 */
export function findPath(start: Point, goal: Point, isPassable: IsPassableFn, maxNodes = 5000): Point[] | null {
  if (start.x === goal.x && start.y === goal.y) return [];
  if (!isPassable(goal.x, goal.y)) return null;

  const cameFrom = new Map<string, Point>();
  const visited = new Set<string>([key(start)]);
  const queue: Point[] = [start];
  let head = 0;
  let expanded = 0;

  while (head < queue.length) {
    const current = queue[head];
    head += 1;
    if (!current) break;

    expanded += 1;
    if (expanded > maxNodes) return null;

    for (const [dx, dy] of NEIGHBOR_OFFSETS) {
      const next: Point = { x: current.x + dx, y: current.y + dy };
      const nextKey = key(next);
      if (visited.has(nextKey) || !isPassable(next.x, next.y)) continue;

      visited.add(nextKey);
      cameFrom.set(nextKey, current);

      if (next.x === goal.x && next.y === goal.y) {
        return reconstructPath(cameFrom, start, next);
      }
      queue.push(next);
    }
  }

  return null;
}

/**
 * The path to the reachable tile *closest* to `goal` — for heading somewhere you can't actually
 * get to, and stopping where the ground runs out.
 *
 * This is what a click on undiscovered terrain does. Refusing outright ("you can't find a path
 * there") would be both unhelpful and a small lie: it tells the player the place is unreachable,
 * which is knowledge they haven't earned yet about ground they've never seen. Walking as far that
 * way as the terrain allows reveals the obstacle instead of narrating it.
 *
 * Unlike findPath this has to exhaust the reachable area rather than stopping at the goal, since
 * "closest" isn't known until everything reachable has been considered. Because BFS expands in
 * order of path length, taking only *strictly* closer tiles means the first tile found at a given
 * distance wins — so among equally close tiles this naturally picks the one nearest to hand.
 *
 * Returns null when nothing reachable is closer than where the player already stands.
 */
export function findPathToward(
  start: Point,
  goal: Point,
  isPassable: IsPassableFn,
  maxNodes = 5000,
): Point[] | null {
  const cameFrom = new Map<string, Point>();
  const visited = new Set<string>([key(start)]);
  const queue: Point[] = [start];
  let head = 0;
  let expanded = 0;

  let best: Point | null = null;
  let bestDistance = chebyshevDistance(start, goal);

  search: while (head < queue.length) {
    const current = queue[head];
    head += 1;
    if (!current) break;

    expanded += 1;
    // Out of budget: stop looking and use the best tile found so far, rather than giving up
    // entirely the way findPath does — a partial answer is still a useful direction to walk.
    if (expanded > maxNodes) break;

    for (const [dx, dy] of NEIGHBOR_OFFSETS) {
      const next: Point = { x: current.x + dx, y: current.y + dy };
      const nextKey = key(next);
      if (visited.has(nextKey) || !isPassable(next.x, next.y)) continue;

      visited.add(nextKey);
      cameFrom.set(nextKey, current);

      const distance = chebyshevDistance(next, goal);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = next;
        if (distance === 0) break search; // standing on it; nothing can beat that
      }

      queue.push(next);
    }
  }

  return best ? reconstructPath(cameFrom, start, best) : null;
}
