import { describe, expect, it } from 'vitest';
import { fbm2D, valueNoise2D } from '../src/world/generation/noise';
import { generateWilderness, terrainAt } from '../src/world/generation/wilderness';
import { carveCorridor } from '../src/world/generation/stitching';
import { reachableWalkable, sealDisconnectedAreas } from '../src/world/generation/connectivity';
import { scatterPois } from '../src/world/generation/poi';
import { createGameMap, getTileId, isWalkable, setTileId } from '../src/world/GameMap';
import { TILES } from '../src/world/Tile';
import { ITEMS } from '../src/items/ItemData';
import { MONSTERS } from '../src/entities/MonsterData';
import { createRNG } from '../src/utils/RNG';
import { chebyshevDistance, linePoints } from '../src/utils/geometry';

/**
 * A spread of seeds, so "works for every seed" claims aren't really "works for the one we shipped".
 *
 * These test the generation *passes*, which are setting-agnostic and outlived the desert that first
 * needed them: noise, biome thresholds, corridor carving, pocket sealing and POI scattering are all
 * still here and all still used — the city uses the last three, and the first two are waiting for
 * the evaporated lakebed. What went with the desert was only the composition of them into one
 * particular map; the city's equivalent is `city-generation.test.ts`.
 */
const SEEDS = [20260923, 0, 1, 7, 42, 999, 123456, 2 ** 31 - 1];

describe('value noise', () => {
  it('is deterministic for the same seed and coordinates', () => {
    for (const [x, y] of [
      [0, 0],
      [3.5, -2.25],
      [1000.125, 7],
    ]) {
      expect(valueNoise2D(42, x!, y!)).toBe(valueNoise2D(42, x!, y!));
      expect(fbm2D(42, x!, y!)).toBe(fbm2D(42, x!, y!));
    }
  });

  it('stays within [0, 1)', () => {
    for (let y = -20; y < 20; y += 0.5) {
      for (let x = -20; x < 20; x += 0.5) {
        const value = fbm2D(123, x, y);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
      }
    }
  });

  it('gives different fields for different seeds', () => {
    const a = Array.from({ length: 50 }, (_, i) => valueNoise2D(1, i * 0.37, i * 0.11));
    const b = Array.from({ length: 50 }, (_, i) => valueNoise2D(2, i * 0.37, i * 0.11));
    expect(a).not.toEqual(b);
  });

  it('is continuous — nearby points have nearby values', () => {
    // Without this, thresholding the field would produce single-tile confetti rather than regions.
    for (let i = 0; i < 200; i++) {
      const x = i * 0.13;
      const y = i * 0.07;
      expect(Math.abs(valueNoise2D(9, x, y) - valueNoise2D(9, x + 0.01, y))).toBeLessThan(0.05);
    }
  });
});

describe('wilderness terrain', () => {
  const area = { x0: 1, y0: 1, x1: 40, y1: 20 };

  it('only ever writes known tile types', () => {
    const map = createGameMap(42, 22, 'rock');
    generateWilderness(map, area, 5);
    for (let y = area.y0; y <= area.y1; y++) {
      for (let x = area.x0; x <= area.x1; x++) {
        expect(TILES[getTileId(map, x, y)]).toBeDefined();
      }
    }
  });

  it('produces varied terrain rather than one flat biome', () => {
    for (const seed of SEEDS) {
      const kinds = new Set<string>();
      for (let y = area.y0; y <= area.y1; y++) {
        for (let x = area.x0; x <= area.x1; x++) kinds.add(terrainAt(seed, x, y));
      }
      expect(kinds.size).toBeGreaterThan(1);
    }
  });

  it('leaves tiles outside the area untouched', () => {
    const map = createGameMap(42, 22, 'rock');
    generateWilderness(map, area, 5);
    expect(getTileId(map, 0, 0)).toBe('rock');
    expect(getTileId(map, 41, 21)).toBe('rock');
  });
});

describe('corridor stitching', () => {
  it('draws a contiguous 8-connected line including both endpoints', () => {
    const points = linePoints({ x: 2, y: 3 }, { x: 12, y: 9 });
    expect(points[0]).toEqual({ x: 2, y: 3 });
    expect(points[points.length - 1]).toEqual({ x: 12, y: 9 });
    for (let i = 1; i < points.length; i++) {
      expect(chebyshevDistance(points[i - 1]!, points[i]!)).toBe(1);
    }
  });

  it('handles a single-point line', () => {
    expect(linePoints({ x: 4, y: 4 }, { x: 4, y: 4 })).toEqual([{ x: 4, y: 4 }]);
  });

  it('carves a walkable route through solid terrain, for every seed', () => {
    const from = { x: 1, y: 10 };
    const to = { x: 58, y: 10 };
    for (const seed of SEEDS) {
      const map = createGameMap(60, 20, 'rock');
      const carved = carveCorridor(map, from, to, createRNG(seed));

      for (const point of carved) expect(isWalkable(map, point.x, point.y)).toBe(true);
      // The whole point of stitching: the two anchors are connected no matter what was there.
      expect(reachableWalkable(map, from.x, from.y).has(`${to.x},${to.y}`)).toBe(true);
    }
  });
});

describe('connectivity sealing', () => {
  it('fills walkable pockets that the origin cannot reach, and nothing else', () => {
    const map = createGameMap(12, 8, 'rock');
    for (let x = 1; x <= 4; x++) setTileId(map, x, 1, 'sand'); // main area
    setTileId(map, 9, 6, 'sand'); // isolated pocket

    const filled = sealDisconnectedAreas(map, 1, 1);

    expect(filled).toBe(1);
    expect(isWalkable(map, 9, 6)).toBe(false);
    for (let x = 1; x <= 4; x++) expect(isWalkable(map, x, 1)).toBe(true);
  });

  it('is a no-op on an already-connected map', () => {
    const map = createGameMap(10, 10, 'rock');
    for (let y = 1; y < 9; y++) for (let x = 1; x < 9; x++) setTileId(map, x, y, 'sand');
    expect(sealDisconnectedAreas(map, 1, 1)).toBe(0);
  });
});

describe('POI scattering', () => {
  const area = { x0: 3, y0: 3, x1: 56, y1: 26 };

  it('places POIs on land, spaced apart, clear of the road, holding real content', () => {
    for (const seed of SEEDS) {
      const map = createGameMap(60, 30, 'rock');
      generateWilderness(map, { x0: 1, y0: 1, x1: 58, y1: 28 }, seed);
      const rng = createRNG(seed);
      const road = carveCorridor(map, { x: 1, y: 15 }, { x: 58, y: 15 }, rng);

      const pois = scatterPois(map, area, rng, road, { count: 4, minSpacing: 8, roadClearance: 3 });
      expect(pois.length).toBeGreaterThanOrEqual(2);

      for (let i = 0; i < pois.length; i++) {
        const poi = pois[i]!;
        expect(isWalkable(map, poi.x, poi.y)).toBe(true);
        expect(poi.x).toBeGreaterThanOrEqual(area.x0);
        expect(poi.x).toBeLessThanOrEqual(area.x1);
        expect(poi.y).toBeGreaterThanOrEqual(area.y0);
        expect(poi.y).toBeLessThanOrEqual(area.y1);

        // Content must be real data-table entries — a typo'd id would otherwise silently
        // produce a POI holding nothing.
        expect(ITEMS[poi.loot]).toBeDefined();
        if (poi.guard) expect(MONSTERS[poi.guard.defId]).toBeDefined();

        expect(road.every((tile) => chebyshevDistance(tile, poi) >= 3)).toBe(true);
        for (let j = 0; j < i; j++) expect(chebyshevDistance(pois[j]!, poi)).toBeGreaterThanOrEqual(8);
      }
    }
  });
});
