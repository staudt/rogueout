import type { Point } from '../../utils/geometry';
import { createNpc } from '../../entities/Npc';
import { createItem } from '../../items/Item';
import type { LandmarkDef } from './LandmarkRegistry';
import { CLUBHOUSE_ENTRY, CLUBHOUSE_RECIPE } from '../regions/clubhouse';

/**
 * Wrigley Field, at Clark and Addison — the starting settlement.
 *
 * You wake here, having been pulled in off the street by the Vigil, who hold the ballpark and are
 * raided regularly by the Wake. Nothing about that scenario is scripted: factions, alarms, morale
 * and patrols already produce it, which is the point of having built them first.
 *
 * **Seamless, not a region.** An open-air ballpark fits in the same grid as the street outside it,
 * so you walk in through the marquee and watch the bowl open up in front of you, rather than
 * crossing a transition and being told where you are. The one transition here is the clubhouse
 * door, which is where the door machinery gets its city-side outing.
 */
export const WRIGLEY_SIZE = 30;

/** The gates' x offsets, landmark-local. Exported so tests can ask about the way in and out. */
export const WRIGLEY_GATE_XS = [4, 23];

/** Local coordinates, 0,0 at the park's north-west corner. */
/**
 * Two gates onto Addison. The marquee is the one at Clark and Addison; the second is down at the
 * other end of the wall, as the real park has gates all along it.
 *
 * Not a fix for anything — a single *two-tile* gate already survives the articulation guard in
 * `pathfinding.test.ts`, because no one body can stand in both halves of it. (A one-tile gate does
 * not, and the guard says so.) The second gate is there because two independent ways out is better
 * than one wide one: it survives two creatures in the gateway, not just one, and a settlement with
 * a single point of entry is a place you can be penned into by bad luck.
 */
const GATES = [
  { x: 4, width: 2 },
  { x: 23, width: 2 },
];
const CLUBHOUSE_BLOCK = { x0: 12, y0: 1, x1: 17, y1: 2 };
/** Landmark-local. Exported so the area can work out where you come back out. */
export const WRIGLEY_CLUBHOUSE_DOOR: Point = { x: 14, y: 2 };

/** Where the player wakes: on the concourse, just inside the marquee. */
export const WRIGLEY_SPAWN: Point = { x: 4, y: WRIGLEY_SIZE - 3 };

/**
 * Bands of the bowl, by distance from the outer wall. Concentric because a ballpark *is*
 * concentric, and because it means the whole thing is four comparisons rather than a diagram.
 */
function bandAt(x: number, y: number): string {
  const depth = Math.min(x, y, WRIGLEY_SIZE - 1 - x, WRIGLEY_SIZE - 1 - y);
  if (depth === 0) return 'brick'; // the outer wall, all the way round
  if (depth <= 2) return 'floor'; // concourse
  if (depth <= 5) return 'rubble'; // grandstand, come down
  return 'grass'; // the field — the only green for miles, and it should read that way
}

export const WRIGLEY_FIELD: LandmarkDef = {
  id: 'wrigleyField',
  name: 'Wrigley Field',
  width: WRIGLEY_SIZE,
  height: WRIGLEY_SIZE,

  stamp: (put) => {
    for (let y = 0; y < WRIGLEY_SIZE; y++) {
      for (let x = 0; x < WRIGLEY_SIZE; x++) {
        put(x, y, bandAt(x, y));
      }
    }

    // Two upper-deck sections that came down, authored rather than rolled: the park should be the
    // same place every game, so that "the collapsed section on the third-base side" can ever mean
    // anything to a player.
    for (let y = 6; y <= 11; y++) {
      for (let x = 3; x <= 7; x++) put(x, y, 'ruin');
    }
    for (let y = 19; y <= 23; y++) {
      for (let x = 22; x <= 26; x++) put(x, y, 'ruin');
    }

    // The gates, opened straight onto Addison — seamless, with nothing to cross.
    for (const gate of GATES) {
      for (let i = 0; i < gate.width; i++) put(gate.x + i, WRIGLEY_SIZE - 1, 'street');
    }

    // The clubhouse, tucked under the stands, with the one door in the whole landmark.
    for (let y = CLUBHOUSE_BLOCK.y0; y <= CLUBHOUSE_BLOCK.y1; y++) {
      for (let x = CLUBHOUSE_BLOCK.x0; x <= CLUBHOUSE_BLOCK.x1; x++) put(x, y, 'brick');
    }
    put(WRIGLEY_CLUBHOUSE_DOOR.x, WRIGLEY_CLUBHOUSE_DOOR.y, 'door');
  },

  anchors: [
    WRIGLEY_SPAWN,
    WRIGLEY_CLUBHOUSE_DOOR,
    ...GATES.map((gate) => ({ x: gate.x, y: WRIGLEY_SIZE - 1 })),
    { x: 15, y: 15 }, // the middle of the field
  ],

  contents: (origin) => {
    const at = (x: number, y: number): Point => ({ x: origin.x + x, y: origin.y + y });

    return {
      transitions: [
        {
          ...at(WRIGLEY_CLUBHOUSE_DOOR.x, WRIGLEY_CLUBHOUSE_DOOR.y),
          toRegion: CLUBHOUSE_RECIPE.regionId,
          spawnX: CLUBHOUSE_ENTRY.x,
          spawnY: CLUBHOUSE_ENTRY.y,
          create: CLUBHOUSE_RECIPE,
        },
      ],

      // The settlement. The Vigil hold the park and the Reclamation trade on the concourse; the
      // Restoration are pointedly *not* here — they hold the roads south, which is a reason to go.
      npcs: [
        npc('almoner', 'Sister Adel of the Vigil', VIGIL, at(6, 25), 'You were half dead on Clark Street. Sit. Drink something.', {
          faction: 'vigil',
          timid: true,
          wanderRadius: 4,
          hp: 8,
        }),
        npc('waterbearer', 'Brother Cass of the Vigil', VIGIL, at(9, 27), 'The cistern is under the stands. Two cups a day, and nobody is turned away.', {
          faction: 'vigil',
          timid: true,
          wanderRadius: 5,
          hp: 8,
        }),
        npc('vigil-warden', 'Warden Iyabo of the Vigil', VIGIL, at(5, 22), 'The Wake come over the left-field wall. We mend it, they come again.', {
          faction: 'vigil',
          weapon: 'pipeWrench',
          wanderRadius: 6,
          hp: 14,
        }),

        npc('shopkeeper', 'Maren of the Reclamation', RECLAMATION, at(18, 27), 'Reclamation post, under the stands. If it was made before, I will buy it.', {
          shopId: 'reclamationPost',
          faction: 'reclamation',
          weapon: 'pipeWrench',
          hp: 14,
        }),
        npc('scrapper-eli', 'Eli, sorting scrap', RECLAMATION, at(21, 25), 'Everything in this park has been stripped twice. I am on the third pass.', {
          faction: 'reclamation',
          weapon: 'pipeWrench',
          wanderRadius: 3,
        }),

        npc('settler-hana', 'Hana, mending the wall', SETTLER, at(15, 9), 'Left field. They always come over left field.', {
          faction: 'settlers',
          wanderRadius: 4,
        }),
        npc('settler-rook', 'Rook, boiling water', SETTLER, at(12, 22), 'You want the tunnels, the station is east on Addison. Go with somebody.', {
          faction: 'settlers',
          wanderRadius: 3,
        }),
        npc('settler-child', 'a child, throwing stones', SETTLER, at(16, 18), 'It used to be a ball park. My gran says there were forty thousand people.', {
          faction: 'settlers',
          timid: true,
          wanderRadius: 8,
          hp: 5,
        }),
      ],

      groundItems: [
        { item: createItem('medPack', 1), x: origin.x + 8, y: origin.y + 26 },
        { item: createItem('machete'), x: origin.x + 22, y: origin.y + 15 },
      ],
    };
  },
};

const VIGIL = '#9fd3e0';
const RECLAMATION = '#7fb3d5';
const SETTLER = '#bfae8a';

function npc(
  id: string,
  name: string,
  fg: string,
  at: Point,
  dialogue: string,
  options: Parameters<typeof createNpc>[7],
) {
  return createNpc(id, name, '@', fg, at.x, at.y, dialogue, options);
}
