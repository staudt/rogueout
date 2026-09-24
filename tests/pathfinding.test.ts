import { describe, expect, it } from 'vitest';
import { findPath, findPathToAny } from '../src/pathfinding/BFS';
import { walkableLineToward } from '../src/pathfinding/StraightLine';
import { chebyshevDistance, type Point } from '../src/utils/geometry';
import { ensureRegionLoaded } from '../src/world/regions/RegionRegistry';
import { isWalkable, type GameMapData } from '../src/world/GameMap';
import type { RegionState } from '../src/engine/GameState';

function isPassableFor(rows: readonly string[]) {
  return (x: number, y: number): boolean => {
    const row = rows[y];
    if (row === undefined) return false;
    return row[x] === '.';
  };
}

/** The same rows as a PathGrid — findPath works on flat indices now, so it needs the dimensions. */
function gridFor(rows: readonly string[]) {
  return { width: rows[0]?.length ?? 0, height: rows.length, isPassable: isPassableFor(rows) };
}

describe('findPath (BFS)', () => {
  it('returns an empty path when start equals goal', () => {
    const rows = ['...', '...', '...'];
    expect(findPath({ x: 1, y: 1 }, { x: 1, y: 1 }, gridFor(rows))).toEqual([]);
  });

  it('finds a direct diagonal path when nothing blocks it', () => {
    const rows = ['.....', '.....', '.....', '.....', '.....'];
    const path = findPath({ x: 0, y: 0 }, { x: 4, y: 4 }, gridFor(rows));
    expect(path).not.toBeNull();
    // Diagonal-cost-1 means the shortest path to a point 4 away diagonally is exactly 4 steps.
    expect(path).toHaveLength(4);
    expect(path?.at(-1)).toEqual({ x: 4, y: 4 });
  });

  it('returns null when the goal is unreachable (sealed off)', () => {
    const rows = ['.....', '.###.', '.#.#.', '.###.', '.....'];
    // (2,2) is sealed inside a box with no door.
    expect(findPath({ x: 0, y: 0 }, { x: 2, y: 2 }, gridFor(rows))).toBeNull();
  });

  it('returns null when the goal itself is not passable', () => {
    const rows = ['...', '.#.', '...'];
    expect(findPath({ x: 0, y: 0 }, { x: 1, y: 1 }, gridFor(rows))).toBeNull();
  });

  it('routes around an obstacle rather than failing, never stepping on a wall', () => {
    // The wall sits in the travel row itself; row 1 is the only detour route around it.
    const rows = ['.#####.', '.......'];
    const path = findPath({ x: 0, y: 0 }, { x: 6, y: 0 }, gridFor(rows));
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
    const path = findPath({ x: 0, y: 0 }, { x: 6, y: 0 }, gridFor(rows));
    expect(path).not.toBeNull();
    expect(path?.length).toBeGreaterThan(6);
    for (const p of path ?? []) {
      expect(isPassableFor(rows)(p.x, p.y)).toBe(true);
    }
  });

  it('routes across a city-sized grid instead of silently giving up', () => {
    // The regression this guards: findPath used to carry a hard 5,000-node cap and return null on
    // overrun, and the caller reads null as "no route" and falls back to walking in a straight
    // line. On a 250x250 map that meant long clicks quietly stopped routing around buildings —
    // no error, no message, just a player wondering why they keep walking into walls.
    const width = 250;
    const height = 250;
    const grid = {
      width,
      height,
      // Vertical walls with a gap at alternating ends, forcing a genuine serpentine route rather
      // than a straight run that any budget would survive.
      isPassable: (x: number, y: number) => {
        if (x < 0 || y < 0 || x >= width || y >= height) return false;
        if (x % 10 !== 0) return true;
        return (x / 10) % 2 === 0 ? y === height - 1 : y === 0;
      },
    };

    const path = findPath({ x: 1, y: 1 }, { x: width - 2, y: height - 2 }, grid);

    expect(path).not.toBeNull();
    expect(path!.at(-1)).toEqual({ x: width - 2, y: height - 2 });
    for (const step of path!) expect(grid.isPassable(step.x, step.y)).toBe(true);
  });

  it('still honours an explicit node budget, which the AI relies on', () => {
    // The default is uncapped, but a blocked creature asks for a cheap step around a body every
    // turn and must not be allowed to solve the map to get it.
    const rows = ['.#####.', '.#####.', '.#####.', '.......'];
    expect(findPath({ x: 0, y: 0 }, { x: 6, y: 0 }, { ...gridFor(rows), maxNodes: 3 })).toBeNull();
  });

  it('does not let a path wrap around the edge of the grid', () => {
    // Flat y * width + x indices make this the easy mistake: x = -1 on row 3 is index 3*w - 1,
    // a real passable tile at the far end of row 2. Both ends of every row are open here, so a
    // wrapping search would find a two-step "path" straight through the map edge.
    const rows = ['...', '###', '...'];
    expect(findPath({ x: 0, y: 0 }, { x: 2, y: 2 }, gridFor(rows))).toBeNull();
  });

  it('produces a contiguous path (each step adjacent to the last, including diagonals)', () => {
    const rows = new Array(10).fill('.'.repeat(10));
    const path = findPath({ x: 0, y: 0 }, { x: 9, y: 7 }, gridFor(rows));
    expect(path).not.toBeNull();
    let prev: Point = { x: 0, y: 0 };
    for (const step of path ?? []) {
      expect(Math.abs(step.x - prev.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(step.y - prev.y)).toBeLessThanOrEqual(1);
      prev = step;
    }
  });
});

describe('findPathToAny (walking up to someone)', () => {
  it('reaches the nearest of several goals', () => {
    const rows = ['..........', '..........', '..........'];
    const path = findPathToAny({ x: 0, y: 1 }, [{ x: 9, y: 1 }, { x: 3, y: 1 }], gridFor(rows));

    expect(path?.at(-1)).toEqual({ x: 3, y: 1 });
  });

  it('skips goals that are blocked and takes a reachable one', () => {
    const rows = ['....', '.#..', '....'];
    const path = findPathToAny({ x: 0, y: 0 }, [{ x: 1, y: 1 }, { x: 3, y: 2 }], gridFor(rows));

    expect(path?.at(-1)).toEqual({ x: 3, y: 2 });
  });

  it('returns an empty path when already standing on one of the goals', () => {
    const rows = ['....', '....'];
    expect(findPathToAny({ x: 2, y: 1 }, [{ x: 2, y: 1 }, { x: 0, y: 0 }], gridFor(rows))).toEqual([]);
  });

  it('returns null when every goal is unreachable', () => {
    // The shopkeeper-in-the-doorway case: the tiles exist and are walkable, but nothing can get
    // to them. Answering with the nearest *reachable* tile instead would be a different question.
    const rows = ['.....', '.###.', '.#.#.', '.###.', '.....'];
    expect(findPathToAny({ x: 0, y: 0 }, [{ x: 2, y: 2 }], gridFor(rows))).toBeNull();
    expect(findPathToAny({ x: 0, y: 0 }, [], gridFor(rows))).toBeNull();
  });

  it('agrees with running one findPath per goal, for a fraction of the work', () => {
    const rows = ['.........', '..#####..', '.........', '..#####..', '.........'];
    const goals = [{ x: 8, y: 0 }, { x: 4, y: 2 }, { x: 0, y: 4 }];

    let best: number | null = null;
    for (const goal of goals) {
      const path = findPath({ x: 0, y: 0 }, goal, gridFor(rows));
      if (path && (best === null || path.length < best)) best = path.length;
    }

    expect(findPathToAny({ x: 0, y: 0 }, goals, gridFor(rows))?.length).toBe(best);
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

describe('no single creature can cut the world in half (the real overworld)', () => {
  /**
   * This used to be false. Before the map became a desert, the road crossed a lake on a causeway
   * exactly one tile wide, and one wandering rat standing on it cut off 695 of 1538 walkable
   * tiles — 45% of the world, unreachable until it moved. Making water rare removed the bridge
   * and with it the chokepoint.
   *
   * Guarded rather than merely fixed, because it's the kind of thing terrain tuning can
   * reintroduce silently: any future map where one body can sever the world will fail here.
   */
  const MAX_CUT_FRACTION = 0.05;

  function worstSingleTileCut(map: GameMapData): { cut: number; walkable: number } {
    const walkable: Array<[number, number]> = [];
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) if (isWalkable(map, x, y)) walkable.push([x, y]);
    }

    let worst = 0;
    for (const [bx, by] of walkable) {
      // Prune: if this tile's walkable neighbours form one unbroken run around it, they can all
      // reach each other by walking around it, so removing it cannot disconnect anything. That
      // skips essentially every tile in the open desert and turns an 8-second scan into a fast
      // one, without weakening the guarantee — the prune only ever rules out non-cut tiles.
      if (!couldBeAChokepoint(map, bx, by)) continue;

      const start = walkable.find(([x, y]) => !(x === bx && y === by))!;
      const open = (x: number, y: number) => isWalkable(map, x, y) && !(x === bx && y === by);

      const seen = new Set<string>([`${start[0]},${start[1]}`]);
      const queue: Array<[number, number]> = [start];
      for (let head = 0; head < queue.length; head++) {
        const [x, y] = queue[head]!;
        for (const [dx, dy] of NEIGHBOURS) {
          const nx = x + dx;
          const ny = y + dy;
          const key = `${nx},${ny}`;
          if (seen.has(key) || !open(nx, ny)) continue;
          seen.add(key);
          queue.push([nx, ny]);
        }
      }
      worst = Math.max(worst, walkable.length - 1 - seen.size);
    }

    return { cut: worst, walkable: walkable.length };
  }

  /** True when the tile's walkable neighbours come in two or more separate runs around it. */
  function couldBeAChokepoint(map: GameMapData, x: number, y: number): boolean {
    const ring = RING.map(([dx, dy]) => isWalkable(map, x + dx, y + dy));
    let runs = 0;
    for (let i = 0; i < ring.length; i++) {
      const previous = ring[(i + ring.length - 1) % ring.length];
      if (ring[i] && !previous) runs++;
    }
    return runs >= 2;
  }

  /** The eight neighbours in circular order, so consecutive entries are adjacent to each other. */
  const RING = [
    [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1],
  ] as const;

  const NEIGHBOURS = [
    [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
  ] as const;

  // Only the shipped seed: this is O(walkable squared) and one map is enough to catch a
  // regression in the generator's tuning.
  it('blocking any one tile strands only a pocket, never a continent', () => {
    const regions: Record<string, RegionState> = {};
    const map = ensureRegionLoaded(regions, 'overworld').map;

    const { cut, walkable } = worstSingleTileCut(map);

    expect(cut / walkable).toBeLessThan(MAX_CUT_FRACTION);
  });

  it('and when something does block the way, the player still sets off toward it', () => {
    // A one-tile gap in a wall, held by a creature: the click can't reach, so it walks the line.
    const rows = ['.......', '###.###', '.......', '.......'];
    const chokepoint = { x: 3, y: 1 };
    const isPassable = (x: number, y: number) =>
      isPassableFor(rows)(x, y) && !(x === chokepoint.x && y === chokepoint.y);
    const goal = { x: 3, y: 0 };

    expect(findPath({ x: 3, y: 3 }, goal, { ...gridFor(rows), isPassable })).toBeNull();

    // From back down the corridor, you walk up to whatever is holding the gap and stop there.
    expect(walkableLineToward({ x: 3, y: 3 }, goal, isPassable)).toEqual([{ x: 3, y: 2 }]);
    // Already nose to nose with it: nowhere closer to stand, so nothing happens.
    expect(walkableLineToward({ x: 3, y: 2 }, goal, isPassable)).toEqual([]);
  });
});
