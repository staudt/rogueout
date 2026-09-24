import { createVisibility } from '../../fov/VisibilityState';
import { createMonster } from '../../entities/Monster';
import { MONSTERS } from '../../entities/MonsterData';
import type { Monster } from '../../entities/Monster';
import { createNpc } from '../../entities/Npc';
import type { Npc } from '../../entities/Npc';
import { createItem } from '../../items/Item';
import type { GroundItem } from '../../items/Item';
import type { GameMapData } from '../GameMap';
import type { RegionState } from '../../engine/GameState';
import {
  generateOverworld,
  OVERWORLD_DUNGEON_ENTRANCE,
  OVERWORLD_HERB_POS,
  OVERWORLD_SPAWN_FROM_DUNGEON,
  OVERWORLD_STORE_DOOR,
} from '../maps/overworld';
import {
  createStoreInteriorMap,
  STORE_INTERIOR_COUNTER,
  STORE_INTERIOR_DOOR,
  STORE_INTERIOR_ENTRY,
} from '../maps/storeInterior';
import type { Poi } from '../generation/poi';
import {
  createDungeonLevel1Map,
  DUNGEON1_EXIT_WEST,
  DUNGEON1_SPAWN_FROM_LEVEL2,
  DUNGEON1_SPAWN_FROM_WILDERNESS,
  DUNGEON1_STAIRS_DOWN,
} from '../maps/dungeonLevel1';
import { createDungeonLevel2Map, DUNGEON2_SPAWN_FROM_LEVEL1, DUNGEON2_STAIRS_UP } from '../maps/dungeonLevel2';

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
  storeInterior: (recipe) =>
    makeRegionState({
      name: recipe.name,
      arrival: 'Shelves of salvage, sorted and labelled. Maren looks up.',
      map: createStoreInteriorMap(),
      npcs: [
        createNpc(
          'shopkeeper',
          'Maren of the Reclamation',
          '@',
          '#7fb3d5',
          STORE_INTERIOR_COUNTER.x,
          STORE_INTERIOR_COUNTER.y,
          'Reclamation post. If it was made before, I will buy it.',
          { shopId: 'reclamationPost', faction: 'reclamation', weapon: 'pipeWrench', hp: 14 },
        ),
      ],
      transitions: [
        {
          x: STORE_INTERIOR_DOOR.x,
          y: STORE_INTERIOR_DOOR.y,
          toRegion: 'overworld',
          // Back out onto the street, one tile west of the doorway you came in by.
          spawnX: OVERWORLD_STORE_DOOR.x - 1,
          spawnY: OVERWORLD_STORE_DOOR.y,
          // Its own line: the desert's arrival text is written for coming up out of the tunnels
          // ("You come up into the open"), which reads absurdly when you have just stepped out of
          // a shop onto a street you were standing on a moment ago.
          announce: 'You step back out into the street.',
        },
      ],
    }),
};

export const STORE_INTERIOR_RECIPE: RegionRecipe = {
  builderId: 'storeInterior',
  regionId: 'store-interior',
  name: 'the Reclamation post',
  seed: 1,
};

export const REGIONS: Record<string, RegionDef> = {
  overworld: {
    id: 'overworld',
    createState: () => {
      // The map arrives with its procedural POIs already decided (see maps/overworld.ts); all
      // this does is turn each one into the concrete monsters/items it described.
      const { map, pois, patrolRoute } = generateOverworld();
      return makeRegionState({
        name: 'the desert',
        daylight: true,
        arrival: 'You come up into the open. Sand in every direction.',
        map,
        patrolRoute,
        transitions: [
          {
            x: OVERWORLD_DUNGEON_ENTRANCE.x,
            y: OVERWORLD_DUNGEON_ENTRANCE.y,
            toRegion: 'dungeon-1',
            spawnX: DUNGEON1_SPAWN_FROM_WILDERNESS.x,
            spawnY: DUNGEON1_SPAWN_FROM_WILDERNESS.y,
          },
          // The store doorway. Its destination has no entry in REGIONS at all — the recipe
          // travelling on this transition is the only thing that knows how to build it, and it
          // rides along into the save, so the interior survives a reload even unentered.
          {
            x: OVERWORLD_STORE_DOOR.x,
            y: OVERWORLD_STORE_DOOR.y,
            toRegion: STORE_INTERIOR_RECIPE.regionId,
            spawnX: STORE_INTERIOR_ENTRY.x,
            spawnY: STORE_INTERIOR_ENTRY.y,
            create: STORE_INTERIOR_RECIPE,
          },
        ],
        monsters: [
          ...poiGuards(pois),
          // Two bands walking the same road in opposite directions. Nobody scripts the ambush;
          // the road does it.
          ...patrol('wakeRaider', patrolRoute, Math.floor(patrolRoute.length * 0.55), 4),
          ...patrol('restorationTrooper', patrolRoute, Math.floor(patrolRoute.length * 0.2), 3),
        ],
        groundItems: [
          { item: createItem('medPack', 1), x: OVERWORLD_HERB_POS.x, y: OVERWORLD_HERB_POS.y },
          ...poiLoot(pois),
        ],
        npcs: [
          // The town: three organisations and the people who just live here. Deliberately more
          // populous than the mechanics strictly need — a settlement with three inhabitants can't
          // show whether a crowd reacts to a crime, which is most of what the faction work is for.
          // Maren is no longer out here: she keeps the counter inside, through the door.
          createNpc(
            'scrapper-eli',
            'Eli, sorting scrap',
            '@',
            '#7fb3d5',
            9,
            4,
            'Maren pays by the kilo. Anything with a maker\'s mark, she pays double.',
            { faction: 'reclamation', weapon: 'pipeWrench', wanderRadius: 3 },
          ),
          createNpc(
            'scrapper-tova',
            'Tova of the Reclamation',
            '@',
            '#7fb3d5',
            17,
            10,
            'The Restoration call us looters. We call them tenants.',
            { faction: 'reclamation', wanderRadius: 4 },
          ),

          createNpc(
            'almoner',
            'Sister Adel of the Vigil',
            '@',
            '#9fd3e0',
            8,
            12,
            'There is water at the cistern, and no charge for it. Sit a while if you need to.',
            // No weapon and no stomach for it: she screams and runs, and lets others answer.
            { faction: 'vigil', timid: true, wanderRadius: 4, hp: 8 },
          ),
          createNpc(
            'waterbearer',
            'Brother Cass of the Vigil',
            '@',
            '#9fd3e0',
            5,
            22,
            'Two cups a day, and more for the children. Nobody is turned away.',
            { faction: 'vigil', timid: true, wanderRadius: 5, hp: 8 },
          ),

          createNpc(
            'trooper',
            'Corporal Vance',
            '@',
            '#c8b88a',
            15,
            17,
            'Restoration holds this stretch of road. Keep your weapon down and we will have no trouble.',
            { faction: 'restoration', weapon: 'machete', wanderRadius: 5, hp: 16, ac: 13 },
          ),
          createNpc(
            'trooper-2',
            'Trooper Ike',
            '@',
            '#c8b88a',
            13,
            24,
            'Corporal says the desert is ours. Corporal has not been out in it.',
            { faction: 'restoration', weapon: 'machete', wanderRadius: 6, hp: 14, ac: 12 },
          ),
          createNpc(
            'sergeant',
            'Sergeant Okonkwo',
            '@',
            '#c8b88a',
            18,
            3,
            'Tithe is collected on the fifth. Order costs, and somebody pays for it.',
            { faction: 'restoration', weapon: 'machete', wanderRadius: 2, hp: 18, ac: 13 },
          ),

          createNpc(
            'settler-hana',
            'Hana, mending a roof',
            '@',
            '#bfae8a',
            4,
            8,
            'We were here before any of their flags. We will be here after.',
            { faction: 'settlers', wanderRadius: 3 },
          ),
          createNpc(
            'settler-rook',
            'Rook, boiling water',
            '@',
            '#bfae8a',
            10,
            20,
            'You want the tunnels, go east. You want to come back, go with somebody.',
            { faction: 'settlers', wanderRadius: 3 },
          ),
          createNpc(
            'settler-child',
            'a child, throwing stones',
            '@',
            '#bfae8a',
            6,
            19,
            'Are you from out there? Did you see the lights?',
            { faction: 'settlers', timid: true, wanderRadius: 6, hp: 5 },
          ),
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
            toRegion: 'overworld',
            spawnX: OVERWORLD_SPAWN_FROM_DUNGEON.x,
            spawnY: OVERWORLD_SPAWN_FROM_DUNGEON.y,
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

function poiGuards(pois: Poi[]): Monster[] {
  const monsters: Monster[] = [];
  for (const poi of pois) {
    if (!poi.guard) continue;
    const def = MONSTERS[poi.guard.defId];
    if (def) monsters.push(createMonster(def, poi.guard.x, poi.guard.y));
  }
  return monsters;
}

function poiLoot(pois: Poi[]): GroundItem[] {
  return pois.map((poi) => ({ item: createItem(poi.loot), x: poi.x, y: poi.y }));
}

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
