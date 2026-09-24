import { describe, expect, it } from 'vitest';
import { ensureRegionLoaded, REGIONS } from '../src/world/regions/RegionRegistry';
import { isWalkable, type GameMapData } from '../src/world/GameMap';
import type { RegionState } from '../src/engine/GameState';

const NEIGHBOR_OFFSETS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const;

function findAllWalkable(map: GameMapData): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (isWalkable(map, x, y)) points.push([x, y]);
    }
  }
  return points;
}

function reachableFrom(map: GameMapData, startX: number, startY: number): Set<string> {
  const seen = new Set<string>([`${startX},${startY}`]);
  const queue: Array<[number, number]> = [[startX, startY]];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    const [x, y] = current;

    for (const [dx, dy] of NEIGHBOR_OFFSETS) {
      const nx = x + dx;
      const ny = y + dy;
      const key = `${nx},${ny}`;
      if (seen.has(key) || !isWalkable(map, nx, ny)) continue;
      seen.add(key);
      queue.push([nx, ny]);
    }
  }

  return seen;
}

describe('handcrafted region connectivity', () => {
  // This is the exact class of bug that shipped in an earlier milestone: a walled-off area with
  // no door, silently unreachable. Every handcrafted region's walkable tiles must form a single
  // connected component — no isolated pockets — so a spawn/NPC/item placed anywhere is reachable.
  for (const def of Object.values(REGIONS)) {
    it(`${def.id} has no isolated (unreachable) walkable areas`, () => {
      const regions: Record<string, RegionState> = {};
      const region = ensureRegionLoaded(regions, def.id);

      const allWalkable = findAllWalkable(region.map);
      expect(allWalkable.length).toBeGreaterThan(0);

      const [startX, startY] = allWalkable[0]!;
      const reached = reachableFrom(region.map, startX, startY);

      const unreachable = allWalkable.filter(([x, y]) => !reached.has(`${x},${y}`));
      expect(unreachable).toEqual([]);
    });

    it(`${def.id}'s NPCs, monsters, ground items, and transitions are all reachable`, () => {
      const regions: Record<string, RegionState> = {};
      const region = ensureRegionLoaded(regions, def.id);

      const allWalkable = findAllWalkable(region.map);
      const [startX, startY] = allWalkable[0]!;
      const reached = reachableFrom(region.map, startX, startY);

      for (const npc of region.npcs) {
        expect(reached.has(`${npc.x},${npc.y}`)).toBe(true);
      }
      for (const monster of region.monsters) {
        expect(reached.has(`${monster.x},${monster.y}`)).toBe(true);
      }
      for (const ground of region.groundItems) {
        expect(reached.has(`${ground.x},${ground.y}`)).toBe(true);
      }
      for (const transition of def.transitions) {
        expect(reached.has(`${transition.x},${transition.y}`)).toBe(true);
      }
    });
  }
});
