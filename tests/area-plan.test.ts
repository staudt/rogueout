import { describe, expect, it } from 'vitest';
import {
  instructionRegions,
  parsePlan,
  PlanError,
  roadClassOf,
} from '../src/world/generation/plan/AreaPlan';
import { placeAt } from '../src/world/places/Places';
import { generateFromPlan } from '../src/world/generation/plan/generateFromPlan';
import { WRIGLEYVILLE } from '../src/world/maps/wrigleyville';
import { getTileId, isWalkable, type GameMapData } from '../src/world/GameMap';
import { TILES } from '../src/world/Tile';
import { reachableWalkable } from '../src/world/generation/connectivity';
import { isConnectedWall, wallGlyph } from '../src/ui/WallGlyphs';
import { createGameMap, setTileId } from '../src/world/GameMap';
import { ensureRegionLoaded } from '../src/world/regions/RegionRegistry';
import { toSaveData } from '../src/persistence/SaveSchema';
import { createPlayer } from '../src/entities/Player';
import type { GameState, RegionState } from '../src/engine/GameState';

/**
 * The area is a drawn text file now, not a generated lattice. That trades a structural guarantee
 * for an editable one: connectivity used to be impossible to break and is now merely *checked*,
 * so these tests are most of what stands between a mis-drawn map and a broken game.
 */
const AREA = generateFromPlan(WRIGLEYVILLE);

function walkableCount(map: GameMapData): number {
  let count = 0;
  for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) if (isWalkable(map, x, y)) count++;
  return count;
}

describe('reading a plan', () => {
  it('names the line when a row is the wrong length', () => {
    // The failure this project already shipped once, back when maps were hand-typed. Catching it
    // loudly with a line number is the whole reason drawing the map is safe to allow.
    const plan = 'title\n---\n....\n...\n....\n';
    expect(() => parsePlan(plan)).toThrow(PlanError);
    expect(() => parsePlan(plan)).toThrow(/line 4 is 3 characters, expected 4/);
  });

  it('refuses a character it does not know', () => {
    expect(() => parsePlan('t\n---\n..Z.\n')).toThrow(/unknown character "Z"/);
  });

  it('keeps the header, so a round trip does not lose the legend', () => {
    const parsed = parsePlan('Wrigleyville\nlegend here\n---\n..\n..\n');
    expect(parsed.header).toBe('Wrigleyville\nlegend here');
    expect(parsed).toMatchObject({ width: 2, height: 2 });
  });

  it('reads how busy each kind of road is', () => {
    expect(roadClassOf('=')).toBe('arterial');
    expect(roadClassOf('.')).toBe('street');
    expect(roadClassOf("'")).toBe('alley');
    expect(roadClassOf('#')).toBe('none');
  });

  it('finds a procedural region of any shape, and keeps corner-touching ones apart', () => {
    // 4-connected on purpose: two blocks meeting only at a corner — exactly what a diagonal
    // street leaves behind — are two blocks, not one bow-tie.
    const plan = parsePlan('t\n---\nBB..\nBB..\n..BB\n..BB\n');
    const regions = instructionRegions(plan);

    expect(regions).toHaveLength(2);
    expect(regions[0]!.tiles).toHaveLength(4);
  });

});

describe('the drawn area', () => {
  it('has exactly one walkable component', () => {
    const reached = reachableWalkable(AREA.map, WRIGLEYVILLE.entry.x, WRIGLEYVILLE.entry.y);
    expect(reached.size).toBe(walkableCount(AREA.map));
  });

  it('leaves every transition and inhabitant somewhere you can reach', () => {
    const reached = reachableWalkable(AREA.map, WRIGLEYVILLE.entry.x, WRIGLEYVILLE.entry.y);
    expect(AREA.transitions.length).toBeGreaterThan(0);
    for (const transition of AREA.transitions) {
      expect(reached.has(`${transition.x},${transition.y}`), `${transition.toRegion}`).toBe(true);
    }
    for (const actor of [...AREA.npcs, ...AREA.monsters]) {
      expect(reached.has(`${actor.x},${actor.y}`), `${actor.id} is walled in`).toBe(true);
    }
  });

  it('only ever writes known tile types', () => {
    for (const id of new Set(AREA.map.tiles)) expect(TILES[id], `unknown tile ${id}`).toBeDefined();
  });

  it('is the same map every time, since it is drawn rather than rolled', () => {
    expect(generateFromPlan(WRIGLEYVILLE).map.tiles).toEqual(AREA.map.tiles);
  });

  it('reads as a city rather than a field or a maze', () => {
    const total = AREA.map.tiles.length;
    const count = (id: string) => AREA.map.tiles.filter((t) => t === id).length;

    const walkable = walkableCount(AREA.map) / total;
    expect(walkable).toBeGreaterThan(0.3);
    expect(walkable).toBeLessThan(0.55);
    expect((count('brick') + count('ruin') + count('thicket')) / total).toBeGreaterThan(0.38);
    expect(count('brick')).toBeGreaterThan(400); // frontage still standing
    expect(count('rubble')).toBeGreaterThan(400); // cave you can walk into
  });
});

describe('named places', () => {
  /**
   * Landmarks used to be marked with their own character in the plan, which did not scale: the
   * alphabet would have run out before the interesting places did, and every letter spent on one
   * was a letter the terrain could not have. They live in a table with their coordinates now, and
   * the art is drawn by hand in the plan.
   */
  it('puts a place where its table says, not where a character marks', () => {
    const park = WRIGLEYVILLE.places.find((place) => place.id === 'wrigleyField')!;
    expect(park.rect).toEqual({ x0: 54, y0: 38, x1: 83, y1: 67 });

    // Its people land inside it, because the contents are anchored to the rect.
    for (const npc of AREA.npcs) {
      const inside = npc.x >= park.rect.x0 && npc.x <= park.rect.x1 && npc.y >= park.rect.y0 && npc.y <= park.rect.y1;
      expect(inside, `${npc.name} is outside the park`).toBe(true);
    }
  });

  it('gives the player a location rather than a pair of numbers', () => {
    const park = WRIGLEYVILLE.places.find((place) => place.id === 'wrigleyField')!;
    expect(placeAt(WRIGLEYVILLE.places, { x: 60, y: 50 })?.name).toBe(park.name);
    expect(placeAt(WRIGLEYVILLE.places, { x: 5, y: 5 })).toBeNull(); // out on the street
  });

  it('protects what is drawn inside an authored one from the weather', () => {
    // The ball park is hand-drawn art. Ruin, flooding and growth must not touch it, or every new
    // game would quietly redecorate somebody's work.
    const first = generateFromPlan(WRIGLEYVILLE).map.tiles;
    const wetter = generateFromPlan({ ...WRIGLEYVILLE, seed: 999 }).map.tiles;
    const park = WRIGLEYVILLE.places.find((place) => place.id === 'wrigleyField')!;

    for (let y = park.rect.y0; y <= park.rect.y1; y++) {
      for (let x = park.rect.x0; x <= park.rect.x1; x++) {
        const index = y * 144 + x;
        expect(first[index], `the park changed at ${x},${y}`).toBe(wetter[index]);
      }
    }
  });
});

describe('the budgets', () => {
  it('stores a fully-explored area well inside its 50 KB allowance', () => {
    // The number the whole save codec exists to protect, and the thing that quietly regresses
    // when somebody adds a field to a region or another fifty creatures to the street.
    const regions: Record<string, RegionState> = {};
    const region = ensureRegionLoaded(regions, 'wrigleyville');
    region.visibility.explored.fill(1);

    const state: GameState = {
      player: createPlayer(WRIGLEYVILLE.entry.x, WRIGLEYVILLE.entry.y),
      regions,
      activeRegionId: 'wrigleyville',
      turnCount: 900,
      messageLog: [],
      gameOver: false,
    };

    expect(JSON.stringify(toSaveData(state)).length).toBeLessThan(50 * 1024);
  });

  it('keeps the population to something a turn can afford', () => {
    // Measured at ~4.8 ms of AI per turn against a 90 ms auto-travel step. The plan's original
    // "cap at ~40 actors" was far too cautious, but it is still worth a ceiling.
    expect(AREA.monsters.length).toBeGreaterThan(40);
    expect(AREA.monsters.length).toBeLessThan(220);
  });
});

describe('the diagonal', () => {
  /**
   * The regression this suite exists for. Blocks are filled by passes that think in rectangles, so
   * a block the diagonal cut in two was having its whole *bounding box* filled — quietly paving
   * over Clark Street on the way. `CityCanvas.restrictTo` confines each fill to the shape actually
   * drawn, which is what makes "draw a block any shape you like" true rather than nearly true.
   */
  it('survives the blocks on either side of it', () => {
    const plan = [
      'diagonal test',
      '---',
      'BBB.BBBBB',
      'BBB.BBBBB',
      'BBBB.BBBB',
      'BBBB.BBBB',
      'BBBBB.BBB',
      'BBBBB.BBB',
    ].join('\n');

    const area = generateFromPlan({ ...WRIGLEYVILLE, plan, entry: { x: 3, y: 0 }, places: [] });

    // Every tile drawn as road must still be walkable road, not somebody's wall.
    for (const [y, x] of [[0, 3], [1, 3], [2, 4], [3, 4], [4, 5], [5, 5]] as const) {
      expect(isWalkable(area.map, x, y), `the road at ${x},${y} was built over`).toBe(true);
    }
  });

  it('carries a patrol route down the busiest road, in walking order', () => {
    expect(AREA.patrolRoute.length).toBeGreaterThan(4);
    expect(AREA.patrolRoute.length).toBeLessThan(40);

    // Consecutive waypoints must be near each other, or patrollers jump about the map.
    for (let i = 1; i < AREA.patrolRoute.length; i++) {
      const a = AREA.patrolRoute[i - 1]!;
      const b = AREA.patrolRoute[i]!;
      expect(Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))).toBeLessThanOrEqual(12);
    }
  });
});

describe('connected wall glyphs', () => {
  it('joins brick up into box-drawing', () => {
    const map = createGameMap(5, 5, 'street');
    for (const [x, y] of [[1, 1], [2, 1], [3, 1], [1, 2], [1, 3]] as const) setTileId(map, x, y, 'brick');

    expect(wallGlyph(map, 2, 1)).toBe('─'); // a run east-west
    expect(wallGlyph(map, 1, 2)).toBe('│'); // a run north-south
    expect(wallGlyph(map, 1, 1)).toBe('┌'); // the corner where they meet
  });

  it('leaves ruin alone, because collapse has no right angles', () => {
    // Box-drawing says "somebody built this square". That is what brick is and what ruin is not —
    // so ruin keeps its own glyph however its neighbours are arranged.
    const map = createGameMap(3, 3, 'ruin');
    expect(isConnectedWall(getTileId(map, 1, 1))).toBe(false);
  });

  it('reads impassable against passable by weight alone', () => {
    // Shade blocks give the map a density gradient you can take in without thinking: light means
    // you can cross it, heavy means you cannot. That distinction has been the hardest thing on
    // this map to make obvious, and it used to rest entirely on remembering that ':' was walkable.
    expect(TILES['rubble']!.glyph).toBe('░');
    expect(TILES['ruin']!.glyph).toBe('▓');
    expect(TILES['rubble']!.walkable).toBe(true);
    expect(TILES['ruin']!.walkable).toBe(false);
  });
});
