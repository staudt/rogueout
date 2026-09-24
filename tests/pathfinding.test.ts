import { describe, expect, it } from 'vitest';
import { findPath } from '../src/pathfinding/BFS';
import { walkableLineToward } from '../src/pathfinding/StraightLine';
import { chebyshevDistance, linePoints, type Point } from '../src/utils/geometry';
import { ensureRegionLoaded } from '../src/world/regions/RegionRegistry';
import { getTileId, isWalkable, type GameMapData } from '../src/world/GameMap';
import { OVERWORLD_SPAWN } from '../src/world/maps/overworld';
import type { RegionState } from '../src/engine/GameState';

function isPassableFor(rows: readonly string[]) {
  return (x: number, y: number): boolean => {
    const row = rows[y];
    if (row === undefined) return false;
    return row[x] === '.';
  };
}

describe('findPath (BFS)', () => {
  it('returns an empty path when start equals goal', () => {
    const rows = ['...', '...', '...'];
    expect(findPath({ x: 1, y: 1 }, { x: 1, y: 1 }, isPassableFor(rows))).toEqual([]);
  });

  it('finds a direct diagonal path when nothing blocks it', () => {
    const rows = ['.....', '.....', '.....', '.....', '.....'];
    const path = findPath({ x: 0, y: 0 }, { x: 4, y: 4 }, isPassableFor(rows));
    expect(path).not.toBeNull();
    // Diagonal-cost-1 means the shortest path to a point 4 away diagonally is exactly 4 steps.
    expect(path).toHaveLength(4);
    expect(path?.at(-1)).toEqual({ x: 4, y: 4 });
  });

  it('returns null when the goal is unreachable (sealed off)', () => {
    const rows = ['.....', '.###.', '.#.#.', '.###.', '.....'];
    // (2,2) is sealed inside a box with no door.
    expect(findPath({ x: 0, y: 0 }, { x: 2, y: 2 }, isPassableFor(rows))).toBeNull();
  });

  it('returns null when the goal itself is not passable', () => {
    const rows = ['...', '.#.', '...'];
    expect(findPath({ x: 0, y: 0 }, { x: 1, y: 1 }, isPassableFor(rows))).toBeNull();
  });

  it('routes around an obstacle rather than failing, never stepping on a wall', () => {
    // The wall sits in the travel row itself; row 1 is the only detour route around it.
    const rows = ['.#####.', '.......'];
    const path = findPath({ x: 0, y: 0 }, { x: 6, y: 0 }, isPassableFor(rows));
    expect(path).not.toBeNull();
    for (const p of path ?? []) {
      expect(isPassableFor(rows)(p.x, p.y)).toBe(true);
    }
  });

  it('never returns a path shorter than the true (obstacle-aware) shortest route', () => {
    // A deep wall forces a real multi-row detour, so the path must be longer than the
    // unobstructed Chebyshev distance (6) — unlike a shallow 1-row dip, which 8-directional
    // movement can absorb into diagonals at no extra cost (see the test above).
    const rows = ['.#####.', '.#####.', '.#####.', '.......'];
    const path = findPath({ x: 0, y: 0 }, { x: 6, y: 0 }, isPassableFor(rows));
    expect(path).not.toBeNull();
    expect(path?.length).toBeGreaterThan(6);
    for (const p of path ?? []) {
      expect(isPassableFor(rows)(p.x, p.y)).toBe(true);
    }
  });

  it('produces a contiguous path (each step adjacent to the last, including diagonals)', () => {
    const rows = new Array(10).fill('.'.repeat(10));
    const path = findPath({ x: 0, y: 0 }, { x: 9, y: 7 }, isPassableFor(rows));
    expect(path).not.toBeNull();
    let prev: Point = { x: 0, y: 0 };
    for (const step of path ?? []) {
      expect(Math.abs(step.x - prev.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(step.y - prev.y)).toBeLessThanOrEqual(1);
      prev = step;
    }
  });
});

describe('walkableLineToward (heading for somewhere you cannot reach)', () => {
  it('walks straight at the target and stops at the wall in the way', () => {
    const rows = ['.......', '...#...', '.......'];
    const path = walkableLineToward({ x: 0, y: 1 }, { x: 6, y: 1 }, isPassableFor(rows));

    expect(path).toEqual([{ x: 1, y: 1 }, { x: 2, y: 1 }]); // stops in front of the wall at x=3
  });

  it('runs at an angle, not just along the eight compass directions', () => {
    const rows = ['.........', '.........', '.........', '.........'];
    const path = walkableLineToward({ x: 0, y: 0 }, { x: 8, y: 3 }, isPassableFor(rows));

    // A shallow diagonal: every step advances, and the line stays near the ideal slope.
    expect(path.at(-1)).toEqual({ x: 8, y: 3 });
    for (let i = 1; i < path.length; i++) {
      expect(chebyshevDistance(path[i - 1]!, path[i]!)).toBe(1);
    }
    for (const step of path) {
      expect(Math.abs(step.y - (step.x * 3) / 8)).toBeLessThanOrEqual(1);
    }
  });

  it('refuses to detour — it stops rather than going around', () => {
    // The old "closest reachable tile" model would have routed all the way around this wall and
    // ended up somewhere the player never pointed at. Going straight just stops.
    const rows = ['...#...', '...#...', '.......'];
    const path = walkableLineToward({ x: 0, y: 0 }, { x: 6, y: 0 }, isPassableFor(rows));

    expect(path).toEqual([{ x: 1, y: 0 }, { x: 2, y: 0 }]);
  });

  it('returns nothing when the very first step is blocked', () => {
    const rows = ['..', '#.'];
    expect(walkableLineToward({ x: 1, y: 1 }, { x: 0, y: 1 }, isPassableFor(rows))).toEqual([]);
  });

  it('stops next to a creature standing in the way, without stepping onto it', () => {
    const rows = ['......'];
    const creature = { x: 3, y: 0 };
    const isPassable = (x: number, y: number) =>
      isPassableFor(rows)(x, y) && !(x === creature.x && y === creature.y);

    const path = walkableLineToward({ x: 0, y: 0 }, { x: 5, y: 0 }, isPassable);

    expect(path.at(-1)).toEqual({ x: 2, y: 0 });
  });

  it('reaches the target when nothing is in the way at all', () => {
    const rows = ['......', '......'];
    expect(walkableLineToward({ x: 0, y: 0 }, { x: 5, y: 1 }, isPassableFor(rows)).at(-1)).toEqual({ x: 5, y: 1 });
  });

  it('heads toward a target off the map and stops at the edge', () => {
    // Clicking fog near a border can name a tile past the map edge.
    const rows = ['.....'];
    expect(walkableLineToward({ x: 0, y: 0 }, { x: 40, y: 0 }, isPassableFor(rows)).at(-1)).toEqual({ x: 4, y: 0 });
  });
});

describe('a creature holding a one-tile crossing (the real overworld)', () => {
  // The stitched road crosses a lake on a causeway exactly one tile wide, so a single creature
  // standing on it severs the map. That is the situation behind "You can't find a path there."
  // on ground the player has already explored — and the reason a click there should still walk
  // to the near side instead of refusing outright.
  const CAUSEWAY = { x: 26, y: 14 };
  /** Beyond the lake — reachable normally, cut off entirely when the causeway is held. */
  const FAR_SIDE = { x: 45, y: 1 };

  function overworld() {
    const regions: Record<string, RegionState> = {};
    return ensureRegionLoaded(regions, 'overworld').map;
  }

  const passableExcept = (map: GameMapData, blocked: Point) => (x: number, y: number) =>
    isWalkable(map, x, y) && !(x === blocked.x && y === blocked.y);

  it('the causeway really is a single-tile chokepoint', () => {
    const map = overworld();
    expect(getTileId(map, CAUSEWAY.x, CAUSEWAY.y)).toBe('path');
    // Hemmed in by water on both sides: there is no way round it.
    expect(isWalkable(map, CAUSEWAY.x, CAUSEWAY.y - 1)).toBe(false);
    expect(isWalkable(map, CAUSEWAY.x, CAUSEWAY.y + 1)).toBe(false);
  });

  it('blocking it genuinely removes the route', () => {
    const map = overworld();
    const open = (x: number, y: number) => isWalkable(map, x, y);

    expect(findPath(OVERWORLD_SPAWN, FAR_SIDE, open)).not.toBeNull();
    expect(findPath(OVERWORLD_SPAWN, FAR_SIDE, passableExcept(map, CAUSEWAY))).toBeNull();
  });

  it('still sets off toward it, in a straight line, instead of refusing', () => {
    const map = overworld();
    const isPassable = passableExcept(map, CAUSEWAY);

    const path = walkableLineToward(OVERWORLD_SPAWN, FAR_SIDE, isPassable);

    expect(path.length).toBeGreaterThan(0);
    for (const step of path) expect(isPassable(step.x, step.y)).toBe(true);
    // Closer than where they started, and every step is on the straight line to the target —
    // no wandering off around the lake.
    expect(chebyshevDistance(path.at(-1)!, FAR_SIDE)).toBeLessThan(chebyshevDistance(OVERWORLD_SPAWN, FAR_SIDE));
    const line = new Set(linePoints(OVERWORLD_SPAWN, FAR_SIDE).map((p) => `${p.x},${p.y}`));
    for (const step of path) expect(line.has(`${step.x},${step.y}`)).toBe(true);
  });
});
