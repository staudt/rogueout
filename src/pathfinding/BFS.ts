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
