import type { Point } from '../utils/geometry';

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

/**
 * The grid a search runs over. The dimensions are part of the search, not just a courtesy: the
 * whole thing works on flat `y * width + x` indices, which is what lets visited/cameFrom be typed
 * arrays instead of a Map keyed by `"12,7"` strings.
 */
export interface PathGrid {
  width: number;
  height: number;
  isPassable: IsPassableFn;
  /**
   * Stop after expanding this many tiles and give up. **Omitted means no cap**, which is the
   * right default for a player asking to walk somewhere: a search bounded below the map's size
   * doesn't fail loudly, it silently returns "no route" and the caller falls back to walking in a
   * straight line — so the player would simply stop getting sensible routes on a big map, with
   * nothing anywhere saying why. The AI passes a deliberately small budget (DETOUR_NODE_BUDGET)
   * because it wants a cheap step around a body, not the whole map solved, every turn.
   */
  maxNodes?: number;
}

/**
 * Scratch buffers, reused across calls and grown as needed.
 *
 * `stamp` holds a generation number rather than a boolean, so nothing has to be cleared between
 * searches — a tile counts as visited only if its stamp matches the current generation. On a
 * 192x192 city that saves wiping 36,864 entries on every one of the many searches a turn can
 * involve (each blocked hunter, each click).
 */
let cameFrom = new Int32Array(0);
let queue = new Int32Array(0);
let stamp = new Int32Array(0);
let generation = 0;

function prepare(area: number): void {
  if (cameFrom.length < area) {
    cameFrom = new Int32Array(area);
    queue = new Int32Array(area);
    stamp = new Int32Array(area);
    generation = 0;
  }

  generation += 1;
  // Int32Array wraps at 2^31; a fresh zeroed stamp array is the only way back. Unreachable in
  // any real session, and a one-line guard beats a phantom "everything is already visited" bug.
  if (generation === 0x7fffffff) {
    stamp.fill(0);
    generation = 1;
  }
}

function reconstruct(goalIndex: number, startIndex: number, width: number): Point[] {
  const path: Point[] = [];
  let current = goalIndex;
  while (current !== startIndex) {
    path.push({ x: current % width, y: (current / width) | 0 });
    current = cameFrom[current]!;
  }
  return path.reverse();
}

/**
 * Uniform-cost BFS (diagonal treated as cost 1, matching roguelike convention — no weighted A*
 * needed while every tile costs the same to cross). Returns the step-by-step path from
 * (excluding) `start` to (including) `goal`, or null if unreachable.
 */
export function findPath(start: Point, goal: Point, grid: PathGrid): Point[] | null {
  if (start.x === goal.x && start.y === goal.y) return [];
  if (!inBounds(goal, grid) || !grid.isPassable(goal.x, goal.y)) return null;

  const goalIndex = goal.y * grid.width + goal.x;
  return search(start, (index) => index === goalIndex, grid);
}

/**
 * The same search, stopping at whichever of `goals` is reached first — which, because BFS expands
 * in order of path length, is the nearest one.
 *
 * This exists for "walk up to that person": the eight tiles around them are all acceptable, and
 * running eight separate searches to find the best one costs eight times as much as running one
 * that accepts any of them. Returns null if none is reachable.
 */
export function findPathToAny(start: Point, goals: readonly Point[], grid: PathGrid): Point[] | null {
  const targets = new Set<number>();
  for (const goal of goals) {
    if (start.x === goal.x && start.y === goal.y) return [];
    if (inBounds(goal, grid) && grid.isPassable(goal.x, goal.y)) {
      targets.add(goal.y * grid.width + goal.x);
    }
  }

  if (targets.size === 0) return null;
  return search(start, (index) => targets.has(index), grid);
}

function inBounds(point: Point, grid: PathGrid): boolean {
  return point.x >= 0 && point.y >= 0 && point.x < grid.width && point.y < grid.height;
}

function search(start: Point, isGoal: (index: number) => boolean, grid: PathGrid): Point[] | null {
  const { width, height, isPassable } = grid;
  if (!inBounds(start, grid)) return null;

  prepare(width * height);

  const startIndex = start.y * width + start.x;
  const maxNodes = grid.maxNodes ?? Number.POSITIVE_INFINITY;

  stamp[startIndex] = generation;
  queue[0] = startIndex;
  let head = 0;
  let tail = 1;
  let expanded = 0;

  while (head < tail) {
    const current = queue[head]!;
    head += 1;

    expanded += 1;
    if (expanded > maxNodes) return null;

    const x = current % width;
    const y = (current / width) | 0;

    for (const [dx, dy] of NEIGHBOR_OFFSETS) {
      const nx = x + dx;
      const ny = y + dy;
      // Checked per-axis rather than on the flat index: x wrapping past the edge would otherwise
      // land on a real, passable-looking tile at the start of the next row.
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;

      const next = ny * width + nx;
      if (stamp[next] === generation || !isPassable(nx, ny)) continue;

      stamp[next] = generation;
      cameFrom[next] = current;

      if (isGoal(next)) return reconstruct(next, startIndex, width);
      queue[tail] = next;
      tail += 1;
    }
  }

  return null;
}
