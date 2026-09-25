import { createVisibility } from '../../fov/VisibilityState';
import { createMonster } from '../../entities/Monster';
import { MONSTERS } from '../../entities/MonsterData';
import type { Monster } from '../../entities/Monster';
import type { Npc } from '../../entities/Npc';
import { createItem } from '../../items/Item';
import type { GroundItem } from '../../items/Item';
import type { GameMapData } from '../GameMap';
import type { RegionState } from '../../engine/GameState';
import {
  createDungeonLevel1Map,
  DUNGEON1_EXIT_WEST,
  DUNGEON1_SPAWN_FROM_LEVEL2,
  DUNGEON1_STAIRS_DOWN,
} from '../maps/dungeonLevel1';
import { createDungeonLevel2Map, DUNGEON2_SPAWN_FROM_LEVEL1, DUNGEON2_STAIRS_UP } from '../maps/dungeonLevel2';
import { generateCity } from '../generation/city/generateCity';
import {
  WRIGLEY_CLUBHOUSE_EXIT,
  WRIGLEYVILLE,
  WRIGLEYVILLE_SEED,
  WRIGLEYVILLE_SPAWN_FROM_TUNNELS,
} from '../maps/wrigleyville';
import {
  clubhouseLoot,
  createClubhouseMap,
  CLUBHOUSE_DOOR,
} from './clubhouse';

import type { RegionRecipe, RegionTransition } from './RegionTypes';
export type { RegionRecipe, RegionTransition } from './RegionTypes';

/**
 * A handcrafted region: one the game knows how to build from nothing but its id.
 *
 * `REGIONS` is still the *definition* table for these, but it is no longer the runtime source of
 * truth for names or exits — those now live on `RegionState`, so that regions built from a recipe
 * (which have no entry here at all) work everywhere a handcrafted one does.
 */
export interface RegionDef {
  id: string;
  createState: () => RegionState;
}

interface RegionStateOptions {
  name: string;
  map: GameMapData;
  arrival?: string;
  /** Open sky: see DAYLIGHT_SIGHT_RADIUS and RegionState.daylight. */
  daylight?: boolean;
  transitions?: RegionTransition[];
  monsters?: Monster[];
  groundItems?: GroundItem[];
  npcs?: Npc[];
  patrolRoute?: Array<{ x: number; y: number }>;
}

function makeRegionState(options: RegionStateOptions): RegionState {
  const { name, map, arrival, daylight = false, transitions = [], monsters = [], groundItems = [], npcs = [], patrolRoute } = options;
  return {
    name,
    arrival,
    transitions,
    map,
    daylight,
    monsters,
    groundItems,
    npcs,
    patrolRoute,
    visibility: createVisibility(map.width, map.height),
  };
}

/**
 * A band walking the road together, spaced out along it.
 *
 * Spawned as a group rather than scattered because that is the whole threat: one raider is a
 * fight you win, four arriving together is a decision about whether to be on the road at all.
 */
function patrol(defId: string, route: Array<{ x: number; y: number }>, start: number, size: number): Monster[] {
  const def = MONSTERS[defId];
  if (!def || route.length === 0) return [];

  const band: Monster[] = [];
  for (let i = 0; i < size; i++) {
    const at = route[(start + i) % route.length]!;
    const member = createMonster(def, at.x, at.y);
    member.patrolIndex = (start + i) % route.length;
    band.push(member);
  }
  return band;
}

/**
 * Regions built on demand from data, keyed by `RegionRecipe.builderId`.
 *
 * Kept separate from `REGIONS` because the two answer different questions. `REGIONS` is "places
 * the game knows by name"; this is "kinds of place the game knows how to make". A city will have
 * hundreds of the latter and no more of the former.
 *
 * A builder must be a pure function of its recipe, because the recipe is all that survives a
 * reload: an interior you have never entered has to come back the same way twice.
 */
export const REGION_BUILDERS: Record<string, (recipe: RegionRecipe) => RegionState> = {
  clubhouse: (recipe) =>
    makeRegionState({
      name: recipe.name,
      arrival: 'Lockers, most of them prised open. Someone sleeps in here.',
      map: createClubhouseMap(),
      groundItems: clubhouseLoot(),
      transitions: [
        {
          x: CLUBHOUSE_DOOR.x,
          y: CLUBHOUSE_DOOR.y,
          toRegion: 'wrigleyville',
          spawnX: WRIGLEY_CLUBHOUSE_EXIT.x,
          spawnY: WRIGLEY_CLUBHOUSE_EXIT.y,
          announce: 'Back out under the stands.',
        },
      ],
    }),

};

export const REGIONS: Record<string, RegionDef> = {
  wrigleyville: {
    id: 'wrigleyville',
    createState: () => {
      const city = generateCity(WRIGLEYVILLE, WRIGLEYVILLE_SEED);
      return makeRegionState({
        name: WRIGLEYVILLE.name,
        arrival: WRIGLEYVILLE.arrival,
        daylight: true,
        map: city.map,
        transitions: city.transitions,
        npcs: city.npcs,
        groundItems: city.groundItems,
        patrolRoute: city.patrolRoute,
        monsters: [
          ...city.monsters,
          // The Wake work Addison, and the Restoration hold it against them. Two bands on one
          // street is what turns a map into a place where things happen without the player.
          ...patrol('wakeRaider', city.patrolRoute, Math.floor(city.patrolRoute.length * 0.7), 4),
          ...patrol('restorationTrooper', city.patrolRoute, Math.floor(city.patrolRoute.length * 0.15), 3),
        ],
      });
    },
  },

  'dungeon-1': {
    id: 'dungeon-1',
    createState: () => {
      const monsters: Monster[] = [];
      const spawn = (id: string, x: number, y: number) => {
        const def = MONSTERS[id];
        if (def) monsters.push(createMonster(def, x, y));
      };
      spawn('dustRat', 8, 3);
      spawn('paleScorpion', 11, 6); // your blades are the wrong tool for this one
      spawn('crawlingMold', 4, 2);
      return makeRegionState({
        name: 'the service tunnels',
        arrival: 'The stairs end in the dark. Something moves, further in.',
        map: createDungeonLevel1Map(),
        monsters,
        groundItems: [{ item: createItem('machete'), x: 5, y: 6 }],
        transitions: [
          {
            x: DUNGEON1_EXIT_WEST.x,
            y: DUNGEON1_EXIT_WEST.y,
            toRegion: 'wrigleyville',
            spawnX: WRIGLEYVILLE_SPAWN_FROM_TUNNELS.x,
            spawnY: WRIGLEYVILLE_SPAWN_FROM_TUNNELS.y,
            announce: 'You come up out of the dark onto Addison.',
          },
          {
            x: DUNGEON1_STAIRS_DOWN.x,
            y: DUNGEON1_STAIRS_DOWN.y,
            toRegion: 'dungeon-2',
            spawnX: DUNGEON2_SPAWN_FROM_LEVEL1.x,
            spawnY: DUNGEON2_SPAWN_FROM_LEVEL1.y,
          },
        ],
      });
    },
  },

  'dungeon-2': {
    id: 'dungeon-2',
    createState: () => {
      const monsters: Monster[] = [];
      const ghoul = MONSTERS['feralGhoul'];
      if (ghoul) {
        // They come in twos: fast enough that one is a fight and two is a problem.
        monsters.push(createMonster(ghoul, 9, 5), createMonster(ghoul, 11, 3));
      }
      return makeRegionState({
        name: 'the deep levels',
        arrival: 'Deeper. The air down here is dead still.',
        map: createDungeonLevel2Map(),
        monsters,
        groundItems: [{ item: createItem('paddedVest'), x: 12, y: 3 }],
        transitions: [
          {
            x: DUNGEON2_STAIRS_UP.x,
            y: DUNGEON2_STAIRS_UP.y,
            toRegion: 'dungeon-1',
            spawnX: DUNGEON1_SPAWN_FROM_LEVEL2.x,
            spawnY: DUNGEON1_SPAWN_FROM_LEVEL2.y,
          },
        ],
      });
    },
  },
};

/**
 * Lazily creates and caches a region's mutable state the first time it's entered.
 *
 * Resolution order is already loaded -> handcrafted -> built from the recipe the caller was
 * carrying -> give up. The recipe comes last because a place that has been visited must always
 * come back as it was left: rebuilding it from the recipe would quietly resurrect everything you
 * killed in there.
 */
export function ensureRegionLoaded(
  regions: Record<string, RegionState>,
  regionId: string,
  recipe?: RegionRecipe,
): RegionState {
  const existing = regions[regionId];
  if (existing) return existing;

  const def = REGIONS[regionId];
  if (def) {
    const created = def.createState();
    regions[regionId] = created;
    return created;
  }

  if (recipe && recipe.regionId === regionId) {
    const builder = REGION_BUILDERS[recipe.builderId];
    if (!builder) throw new Error(`Unknown region builder: ${recipe.builderId}`);
    const created = builder(recipe);
    regions[regionId] = created;
    return created;
  }

  throw new Error(`Unknown region: ${regionId}`);
}
