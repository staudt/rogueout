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
  OVERWORLD_SHOPKEEPER_POS,
  OVERWORLD_SPAWN_FROM_DUNGEON,
} from '../maps/overworld';
import type { Poi } from '../generation/poi';
import {
  createDungeonLevel1Map,
  DUNGEON1_EXIT_WEST,
  DUNGEON1_SPAWN_FROM_LEVEL2,
  DUNGEON1_SPAWN_FROM_WILDERNESS,
  DUNGEON1_STAIRS_DOWN,
} from '../maps/dungeonLevel1';
import { createDungeonLevel2Map, DUNGEON2_SPAWN_FROM_LEVEL1, DUNGEON2_STAIRS_UP } from '../maps/dungeonLevel2';

export interface RegionTransition {
  x: number;
  y: number;
  toRegion: string;
  spawnX: number;
  spawnY: number;
}

export interface RegionDef {
  id: string;
  name: string;
  /** What it feels like to arrive here. Content, like everything else in this table. */
  arrival?: string;
  /** Open sky: see DAYLIGHT_SIGHT_RADIUS and RegionState.daylight. */
  daylight?: boolean;
  createState: () => RegionState;
  transitions: RegionTransition[];
}

function makeRegionState(
  map: GameMapData,
  monsters: Monster[] = [],
  groundItems: GroundItem[] = [],
  npcs: Npc[] = [],
  daylight = false,
): RegionState {
  return { map, daylight, monsters, groundItems, npcs, visibility: createVisibility(map.width, map.height) };
}

export const REGIONS: Record<string, RegionDef> = {
  overworld: {
    id: 'overworld',
    name: 'the wilds',
    daylight: true,
    arrival: 'You come up into the open. Sand in every direction.',
    createState: () => {
      // The map arrives with its procedural POIs already decided (see maps/overworld.ts); all
      // this does is turn each one into the concrete monsters/items it described.
      const { map, pois } = generateOverworld();
      return makeRegionState(
        map,
        poiGuards(pois),
        [
          { item: createItem('healingHerb', 1), x: OVERWORLD_HERB_POS.x, y: OVERWORLD_HERB_POS.y },
          ...poiLoot(pois),
        ],
        [
          createNpc(
            'shopkeeper',
            'Old Maren',
            '@',
            '#ffcc66',
            OVERWORLD_SHOPKEEPER_POS.x,
            OVERWORLD_SHOPKEEPER_POS.y,
            'Welcome, traveler. Take a look at my wares.',
            'generalStore',
          ),
        ],
        true, // open sky
      );
    },
    transitions: [
      {
        x: OVERWORLD_DUNGEON_ENTRANCE.x,
        y: OVERWORLD_DUNGEON_ENTRANCE.y,
        toRegion: 'dungeon-1',
        spawnX: DUNGEON1_SPAWN_FROM_WILDERNESS.x,
        spawnY: DUNGEON1_SPAWN_FROM_WILDERNESS.y,
      },
    ],
  },

  'dungeon-1': {
    id: 'dungeon-1',
    name: 'the dungeon, level 1',
    arrival: 'The stairs end in the dark. Something moves, further in.',
    createState: () => {
      const monsters: Monster[] = [];
      const rat = MONSTERS['rat'];
      const goblin = MONSTERS['goblin'];
      const mold = MONSTERS['mold'];
      if (rat) monsters.push(createMonster(rat, 8, 3));
      if (goblin) monsters.push(createMonster(goblin, 11, 6));
      // Immune to piercing and afraid of nothing you're carrying yet — the tag system, in person.
      if (mold) monsters.push(createMonster(mold, 4, 2));
      return makeRegionState(createDungeonLevel1Map(), monsters, [{ item: createItem('rustySword'), x: 5, y: 6 }], []);
    },
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
  },

  'dungeon-2': {
    id: 'dungeon-2',
    name: 'the dungeon, level 2',
    arrival: 'Deeper. The air down here is dead still.',
    createState: () => {
      const monsters: Monster[] = [];
      const goblin = MONSTERS['goblin'];
      if (goblin) monsters.push(createMonster(goblin, 9, 5));
      return makeRegionState(
        createDungeonLevel2Map(),
        monsters,
        [{ item: createItem('leatherArmor'), x: 12, y: 3 }],
        [],
      );
    },
    transitions: [
      {
        x: DUNGEON2_STAIRS_UP.x,
        y: DUNGEON2_STAIRS_UP.y,
        toRegion: 'dungeon-1',
        spawnX: DUNGEON1_SPAWN_FROM_LEVEL2.x,
        spawnY: DUNGEON1_SPAWN_FROM_LEVEL2.y,
      },
    ],
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

/** Lazily creates and caches a region's mutable state the first time it's entered. */
export function ensureRegionLoaded(regions: Record<string, RegionState>, regionId: string): RegionState {
  const existing = regions[regionId];
  if (existing) return existing;

  const def = REGIONS[regionId];
  if (!def) throw new Error(`Unknown region: ${regionId}`);

  const created = def.createState();
  regions[regionId] = created;
  return created;
}
