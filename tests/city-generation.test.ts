import { describe, expect, it } from 'vitest';
import { generateCity } from '../src/world/generation/city/generateCity';
import { blockRects, streetRect, type AreaDef } from '../src/world/generation/city/AreaDef';
import { StreetGraph } from '../src/world/generation/city/StreetGraph';
import { WRIGLEYVILLE, WRIGLEYVILLE_SEED, WRIGLEY_ORIGIN } from '../src/world/maps/wrigleyville';
import { WRIGLEY_SIZE } from '../src/world/landmarks/wrigleyField';
import { getTileId, isWalkable, type GameMapData } from '../src/world/GameMap';
import { TILES } from '../src/world/Tile';
import { reachableWalkable } from '../src/world/generation/connectivity';
import { rectContains } from '../src/world/generation/Rect';
import { ensureRegionLoaded } from '../src/world/regions/RegionRegistry';
import { toSaveData } from '../src/persistence/SaveSchema';
import { createPlayer } from '../src/entities/Player';
import type { GameState, RegionState } from '../src/engine/GameState';

/** Three seeds, not one: a guarantee that only holds for the shipped seed isn't a guarantee. */
const SEEDS = [WRIGLEYVILLE_SEED, 7, 4242];

const generated = new Map<number, ReturnType<typeof generateCity>>();
function cityFor(seed: number) {
  const cached = generated.get(seed);
  if (cached) return cached;
  const city = generateCity(WRIGLEYVILLE, seed);
  generated.set(seed, city);
  return city;
}

function walkableCount(map: GameMapData): number {
  let count = 0;
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) if (isWalkable(map, x, y)) count++;
  }
  return count;
}

describe('the street lattice', () => {
  it('derives blocks as the complement of the streets, never overlapping one', () => {
    // The property the whole connectivity argument rests on: buildings are only written inside a
    // block rect, so if no block touches a street, no pass can accidentally wall one.
    for (const block of blockRects(WRIGLEYVILLE)) {
      for (const street of WRIGLEYVILLE.streets) {
        const s = streetRect(street, WRIGLEYVILLE);
        const overlaps = block.x0 <= s.x1 && block.x1 >= s.x0 && block.y0 <= s.y1 && block.y1 >= s.y0;
        expect(overlaps, `${street.name} overlaps a block`).toBe(false);
      }
    }
  });

  it('produces blocks with Chicago proportions — wider than tall', () => {
    // A Chicago block is 660 x 330 ft; at ~20 ft a tile that is 33 x 17, long axis east-west.
    // Square blocks would be the single most visible way to get the city wrong, so the street
    // table is checked rather than trusted — it got this wrong once already.
    const blocks = blockRects(WRIGLEYVILLE);
    expect(blocks.length).toBeGreaterThan(8);

    const wider = blocks.filter((b) => b.x1 - b.x0 > b.y1 - b.y0);
    expect(wider.length).toBeGreaterThan(blocks.length / 2);
  });

  it('gives every street a tile of pavement on each side', () => {
    // Five across: kerb, three of roadway, kerb. The pavement carries no mechanics — it exists so
    // a street reads as a road with edges rather than a band of undifferentiated grey.
    const { map } = cityFor(WRIGLEYVILLE_SEED);

    for (const street of WRIGLEYVILLE.streets) {
      expect(street.width).toBe(5);
      const rect = streetRect(street, WRIGLEYVILLE);
      // Sample at the middle of the area, away from any landmark or authored water.
      const along = street.axis === 'ns' ? Math.floor(WRIGLEYVILLE.height / 2) : Math.floor(WRIGLEYVILLE.width / 2);
      const at = (i: number) =>
        street.axis === 'ns' ? getTileId(map, rect.x0 + i, along) : getTileId(map, along, rect.y0 + i);

      const band = [0, 1, 2, 3, 4].map(at);
      expect(band.every((t) => TILES[t]?.walkable)).toBe(true);
    }
  });

  it('refuses to bury a stretch of street that would cut the lattice in two', () => {
    const graph = new StreetGraph(WRIGLEYVILLE);
    const segments = graph.allSegments();
    expect(segments.length).toBeGreaterThan(10);

    // Bury everything it will allow. Whatever is left must still join up — which is the guarantee
    // the damage pass leans on so that it never has to understand connectivity itself.
    let buried = 0;
    for (const segment of segments) if (graph.bury(segment.id)) buried++;

    expect(buried).toBeGreaterThan(0);
    expect(buried).toBeLessThan(segments.length);
    // Every further request must now be refused, since the survivors are load-bearing by definition.
    for (const segment of segments) expect(graph.bury(segment.id)).toBe(false);
  });
});

describe('generateCity', () => {
  it('is reproducible from its seed, and different across seeds', () => {
    expect(generateCity(WRIGLEYVILLE, 99).map.tiles).toEqual(generateCity(WRIGLEYVILLE, 99).map.tiles);
    expect(generateCity(WRIGLEYVILLE, 99).map.tiles).not.toEqual(generateCity(WRIGLEYVILLE, 100).map.tiles);
  });

  it('finishes fast enough to sit in front of a new game', () => {
    const started = Date.now();
    generateCity(WRIGLEYVILLE, 31337);
    expect(Date.now() - started).toBeLessThan(600);
  });

  it('only ever writes known tile types', () => {
    const { map } = cityFor(WRIGLEYVILLE_SEED);
    for (const id of new Set(map.tiles)) expect(TILES[id], `unknown tile ${id}`).toBeDefined();
  });

  for (const seed of SEEDS) {
    it(`seed ${seed}: has exactly one walkable component`, () => {
      const { map } = cityFor(seed);
      const reached = reachableWalkable(map, WRIGLEYVILLE.entry.x, WRIGLEYVILLE.entry.y);
      expect(reached.size).toBe(walkableCount(map));
    });

    it(`seed ${seed}: every transition is reachable from where you wake`, () => {
      const city = cityFor(seed);
      const reached = reachableWalkable(city.map, WRIGLEYVILLE.entry.x, WRIGLEYVILLE.entry.y);
      expect(city.transitions.length).toBeGreaterThan(0);
      for (const transition of city.transitions) {
        expect(reached.has(`${transition.x},${transition.y}`), `${transition.toRegion} unreachable`).toBe(true);
      }
    });

    it(`seed ${seed}: everyone living here is standing somewhere reachable`, () => {
      const city = cityFor(seed);
      const reached = reachableWalkable(city.map, WRIGLEYVILLE.entry.x, WRIGLEYVILLE.entry.y);
      for (const actor of [...city.npcs, ...city.monsters]) {
        expect(reached.has(`${actor.x},${actor.y}`), `${actor.id} is walled in`).toBe(true);
      }
      for (const ground of city.groundItems) {
        expect(reached.has(`${ground.x},${ground.y}`)).toBe(true);
      }
    });

    it(`seed ${seed}: reads as a city rather than a field or a maze`, () => {
      const { map } = cityFor(seed);
      const total = map.tiles.length;
      const count = (id: string) => map.tiles.filter((t) => t === id).length;

      const walkable = walkableCount(map) / total;
      expect(walkable).toBeGreaterThan(0.25);
      expect(walkable).toBeLessThan(0.5);

      // **Roads stay the fastest way around, but no longer the only one.** Half the blocks are now
      // cave you can sometimes cut through, which is the point of them — so this is deliberately
      // weaker than the old "street beats rubble outright" and stronger than nothing. Roadway
      // alone, not counting pavement, still has to beat the crossable ruin.
      expect(count('street')).toBeGreaterThan(count('rubble'));

      // And the place has to stay mostly solid, or it is a field with some walls in it.
      expect((count('brick') + count('ruin')) / total).toBeGreaterThan(0.4);
    });

    it(`seed ${seed}: has both textures — standing frontage and collapsed cave`, () => {
      // The even mix the whole look rests on. One texture without the other is either a tidy
      // model village or an undifferentiated rubble field.
      const { map } = cityFor(seed);
      const count = (id: string) => map.tiles.filter((t) => t === id).length;

      expect(count('brick')).toBeGreaterThan(400); // buildings still lining streets
      expect(count('rubble')).toBeGreaterThan(800); // cave you can walk into
    });
  }
});

describe('the save budget', () => {
  it('stores a fully-explored Wrigleyville well inside its 50 KB allowance', () => {
    // The number the whole Stage 0 codec exists to protect. Stored naively this area is ~660 KB,
    // and a save holds every region visited — so without the codec the fourth place you went
    // would fail to write. Asserted rather than measured once, because it is the thing that
    // quietly regresses the moment somebody adds a field to a region.
    const regions: Record<string, RegionState> = {};
    const city = ensureRegionLoaded(regions, 'wrigleyville');
    city.visibility.explored.fill(1); // worst case: every tile seen

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
});

describe('landmarks', () => {
  it('leaves Wrigley Field exactly as authored, whatever the damage field wanted', () => {
    // The protect mask is enforced on every write rather than relied on through pass ordering,
    // because damage is the one pass that writes everywhere and ordering alone is too fragile.
    // Two seeds must therefore produce byte-identical ballparks.
    const a = cityFor(SEEDS[0]!).map;
    const b = cityFor(SEEDS[1]!).map;

    for (let y = 0; y < WRIGLEY_SIZE; y++) {
      for (let x = 0; x < WRIGLEY_SIZE; x++) {
        const wx = WRIGLEY_ORIGIN.x + x;
        const wy = WRIGLEY_ORIGIN.y + y;
        expect(getTileId(a, wx, wy), `park differs at ${x},${y}`).toBe(getTileId(b, wx, wy));
      }
    }
  });

  it('keeps the field green and the bowl crossable', () => {
    const { map } = cityFor(WRIGLEYVILLE_SEED);
    const middle = { x: WRIGLEY_ORIGIN.x + 15, y: WRIGLEY_ORIGIN.y + 15 };

    expect(getTileId(map, middle.x, middle.y)).toBe('grass');
    const reached = reachableWalkable(map, WRIGLEYVILLE.entry.x, WRIGLEYVILLE.entry.y);
    expect(reached.has(`${middle.x},${middle.y}`)).toBe(true);
  });

  it('opens the marquee onto Addison, with no transition to cross', () => {
    const { map } = cityFor(WRIGLEYVILLE_SEED);
    const gate = { x: WRIGLEY_ORIGIN.x + 4, y: WRIGLEY_ORIGIN.y + WRIGLEY_SIZE - 1 };

    expect(getTileId(map, gate.x, gate.y)).toBe('street');
    expect(isWalkable(map, gate.x, gate.y + 1)).toBe(true); // Addison, immediately outside
    const city = cityFor(WRIGLEYVILLE_SEED);
    expect(city.transitions.some((t) => t.x === gate.x && t.y === gate.y)).toBe(false);
  });

  it('throws rather than quietly stamping a street through a landmark', () => {
    const broken: AreaDef = {
      ...WRIGLEYVILLE,
      streets: [...WRIGLEYVILLE.streets, { name: 'Nonesuch Street', axis: 'ew', at: WRIGLEY_ORIGIN.y + 10, width: 4 }],
    };
    expect(() => generateCity(broken, WRIGLEYVILLE_SEED)).toThrow(/runs through Wrigley Field/);
  });
});

describe('water', () => {
  it('floods ground in places, without ever flooding a street impassably', () => {
    // Impassable water is confined to block interiors on purpose: that is what keeps flooding from
    // cutting the street lattice, and it means the flood pass needs no dealings with StreetGraph.
    // Walkable swamp may go anywhere, road included — a flooded street still gets you there.
    const { map } = cityFor(WRIGLEYVILLE_SEED);
    const count = (id: string) => map.tiles.filter((t) => t === id).length;

    expect(count('water')).toBeGreaterThan(50);
    expect(count('swamp')).toBeGreaterThan(200);

    for (const street of WRIGLEYVILLE.streets) {
      const rect = streetRect(street, WRIGLEYVILLE);
      for (let y = rect.y0; y <= rect.y1; y++) {
        for (let x = rect.x0; x <= rect.x1; x++) {
          expect(getTileId(map, x, y), `water on ${street.name} at ${x},${y}`).not.toBe('water');
        }
      }
    }
  });

  it('puts a moat round the park that you cannot simply wade', () => {
    // A moat made of walkable swamp would protect nothing, so the barrier is water with a reed
    // fringe. The marquee approach is deliberately left dry — which is why the Wake raid the
    // settlement rather than walking into it.
    const { map } = cityFor(WRIGLEYVILLE_SEED);
    const moat = WRIGLEYVILLE.water!;
    expect(moat.length).toBeGreaterThan(0);

    for (const rect of moat) {
      for (let y = rect.y0; y <= rect.y1; y++) {
        for (let x = rect.x0; x <= rect.x1; x++) {
          expect(isWalkable(map, x, y), `moat is wadeable at ${x},${y}`).toBe(false);
        }
      }
    }

    // ...and the gate is still reachable, or the settlement would be moated shut.
    const gate = { x: WRIGLEY_ORIGIN.x + 4, y: WRIGLEY_ORIGIN.y + WRIGLEY_SIZE - 1 };
    const reached = reachableWalkable(map, WRIGLEYVILLE.entry.x, WRIGLEYVILLE.entry.y);
    expect(reached.has(`${gate.x},${gate.y}`)).toBe(true);
  });
});

describe('the elevated line', () => {
  it('blocks the blocks it crosses but never the streets', () => {
    // You walk under an L, not into it. If the tracks severed every cross street the area would be
    // cut in half, and the whole point of the line is that you can follow it.
    const { map } = cityFor(WRIGLEYVILLE_SEED);
    const line = WRIGLEYVILLE.elevated![0]!;

    let blocked = 0;
    for (let y = 0; y < map.height; y++) {
      for (let x = line.x0; x <= line.x1; x++) {
        if (!isWalkable(map, x, y)) blocked++;
      }
    }
    expect(blocked).toBeGreaterThan(map.height); // most of it is solid structure

    for (const street of WRIGLEYVILLE.streets.filter((s) => s.axis === 'ew')) {
      const y = street.at + Math.floor(street.width / 2);
      const crossable = [...Array(line.x1 - line.x0 + 1).keys()].some((i) => isWalkable(map, line.x0 + i, y));
      expect(crossable, `${street.name} is blocked by the L`).toBe(true);
    }
  });

  it('runs past the station rather than through it', () => {
    const line = WRIGLEYVILLE.elevated![0]!;
    const station = WRIGLEYVILLE.landmarks.find((l) => l.id === 'addisonStation')!;
    expect(rectContains(line, station.x, station.y)).toBe(false);
  });
});
