import { describe, expect, it } from 'vitest';
import { findPath, findPathToward } from '../src/pathfinding/BFS';
import type { Point } from '../src/utils/geometry';
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

describe('findPathToward (heading for somewhere you cannot reach)', () => {
  it('stops against the wall when the goal is sealed off', () => {
    const rows = ['.........', '.........', '...###...', '...#.#...', '...###...', '.........'];
    const isPassable = isPassableFor(rows);
    const start = { x: 0, y: 0 };
    const sealed = { x: 4, y: 3 };

    const path = findPathToward(start, sealed, isPassable);

    expect(findPath(start, sealed, isPassable)).toBeNull(); // no route exists
    expect(path).not.toBeNull();
    // Closest you can stand to the centre of a walled box is just outside its wall.
    expect(chebyshev(path!.at(-1)!, sealed)).toBe(2);
    expect(chebyshev(path!.at(-1)!, sealed)).toBeLessThan(chebyshev(start, sealed));
    for (const step of path!) expect(isPassable(step.x, step.y)).toBe(true);
  });

  it('does nothing when the player is already as close as the terrain allows', () => {
    // Every tile outside this box is exactly as far from its centre as the start already is.
    const rows = ['.....', '.###.', '.#.#.', '.###.', '.....'];
    expect(findPathToward({ x: 0, y: 0 }, { x: 2, y: 2 }, isPassableFor(rows))).toBeNull();
  });

  it('walks right up to a wall when the goal is the wall itself', () => {
    const rows = ['.....', '.....', '..#..'];
    const path = findPathToward({ x: 0, y: 0 }, { x: 2, y: 2 }, isPassableFor(rows));

    expect(path).not.toBeNull();
    expect(chebyshev(path!.at(-1)!, { x: 2, y: 2 })).toBe(1); // adjacent to it, not on it
  });

  it('takes the whole route when the goal actually is reachable', () => {
    const rows = ['.....', '.....', '.....'];
    const path = findPathToward({ x: 0, y: 0 }, { x: 4, y: 2 }, isPassableFor(rows));

    expect(path?.at(-1)).toEqual({ x: 4, y: 2 });
  });

  it('routes around an obstacle to get closer, rather than stopping at it', () => {
    // The goal sits behind a wall with the only gap far to the left, so getting closer means
    // going the "wrong" way first. A greedy step-toward-the-target walk could not do this.
    const rows = ['.......', '.#####.', '.#....#', '.#####.', '.......'];
    const isPassable = isPassableFor(rows);

    const path = findPathToward({ x: 0, y: 0 }, { x: 3, y: 2 }, isPassable);

    expect(path).not.toBeNull();
    expect(path!.at(-1)).toEqual({ x: 3, y: 2 });
    expect(path!.length).toBeGreaterThan(chebyshev({ x: 0, y: 0 }, { x: 3, y: 2 }));
    for (const step of path!) expect(isPassable(step.x, step.y)).toBe(true);
  });

  it('returns null when nothing reachable is any closer than where you stand', () => {
    // Boxed in: every reachable tile is already as close to the goal as it gets.
    const rows = ['###', '#.#', '###'];
    expect(findPathToward({ x: 1, y: 1 }, { x: 9, y: 9 }, isPassableFor(rows))).toBeNull();
  });

  it('returns null when asked to approach the tile already underfoot', () => {
    const rows = ['...', '...', '...'];
    expect(findPathToward({ x: 1, y: 1 }, { x: 1, y: 1 }, isPassableFor(rows))).toBeNull();
  });

  it('moves in the goal direction even when the goal is off the map entirely', () => {
    // Clicking unexplored fog near the edge can name a tile past the map border.
    const rows = ['.....', '.....', '.....'];
    const path = findPathToward({ x: 0, y: 1 }, { x: 40, y: 1 }, isPassableFor(rows));

    expect(path?.at(-1)).toEqual({ x: 4, y: 1 }); // as far east as the ground goes
  });
});

function chebyshev(a: Point, b: Point): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

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

  it('still walks the player to the water\'s edge instead of refusing', () => {
    const map = overworld();
    const isPassable = passableExcept(map, CAUSEWAY);

    const approach = findPathToward(OVERWORLD_SPAWN, FAR_SIDE, isPassable);

    expect(approach).not.toBeNull();
    const arrival = approach!.at(-1)!;
    for (const step of approach!) expect(isPassable(step.x, step.y)).toBe(true);
    // Meaningfully closer than where they started, and stopped short of the blocked tile.
    expect(chebyshev(arrival, FAR_SIDE)).toBeLessThan(chebyshev(OVERWORLD_SPAWN, FAR_SIDE));
    expect(arrival).not.toEqual(CAUSEWAY);
  });
});
