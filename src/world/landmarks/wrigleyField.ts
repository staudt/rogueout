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
export const WRIGLEY_SIZE = 40;

/** Local coordinates, 0,0 at the park's north-west corner. */
const GATE = { x: 4, width: 2 };
const CLUBHOUSE_BLOCK = { x0: 16, y0: 1, x1: 22, y1: 3 };
/** Landmark-local. Exported so the area can work out where you come back out. */
export const WRIGLEY_CLUBHOUSE_DOOR: Point = { x: 19, y: 3 };

/** Where the player wakes: on the concourse, just inside the marquee. */
export const WRIGLEY_SPAWN: Point = { x: 4, y: WRIGLEY_SIZE - 3 };

/**
 * Bands of the bowl, by distance from the outer wall. Concentric because a ballpark *is*
 * concentric, and because it means the whole thing is four comparisons rather than a diagram.
 */
function bandAt(x: number, y: number): string {
  const depth = Math.min(x, y, WRIGLEY_SIZE - 1 - x, WRIGLEY_SIZE - 1 - y);
  if (depth === 0) return 'brick'; // the outer wall, all the way round
  if (depth <= 3) return 'floor'; // concourse
  if (depth <= 7) return 'rubble'; // grandstand, come down
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
    for (let y = 8; y <= 14; y++) {
      for (let x = 4; x <= 9; x++) put(x, y, 'ruin');
    }
    for (let y = 26; y <= 31; y++) {
      for (let x = 30; x <= 35; x++) put(x, y, 'ruin');
    }

    // The marquee gate, at the Clark and Addison corner, opened straight onto the street.
    for (let i = 0; i < GATE.width; i++) {
      put(GATE.x + i, WRIGLEY_SIZE - 1, 'street');
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
    { x: GATE.x, y: WRIGLEY_SIZE - 1 },
    { x: 20, y: 20 }, // the middle of the field
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
        npc('almoner', 'Sister Adel of the Vigil', VIGIL, at(8, 34), 'You were half dead on Clark Street. Sit. Drink something.', {
          faction: 'vigil',
          timid: true,
          wanderRadius: 4,
          hp: 8,
        }),
        npc('waterbearer', 'Brother Cass of the Vigil', VIGIL, at(12, 36), 'The cistern is under the stands. Two cups a day, and nobody is turned away.', {
          faction: 'vigil',
          timid: true,
          wanderRadius: 5,
          hp: 8,
        }),
        npc('vigil-warden', 'Warden Iyabo of the Vigil', VIGIL, at(6, 30), 'The Wake come over the left-field wall. We mend it, they come again.', {
          faction: 'vigil',
          weapon: 'pipeWrench',
          wanderRadius: 6,
          hp: 14,
        }),

        npc('shopkeeper', 'Maren of the Reclamation', RECLAMATION, at(24, 36), 'Reclamation post, under the stands. If it was made before, I will buy it.', {
          shopId: 'reclamationPost',
          faction: 'reclamation',
          weapon: 'pipeWrench',
          hp: 14,
        }),
        npc('scrapper-eli', 'Eli, sorting scrap', RECLAMATION, at(28, 34), 'Everything in this park has been stripped twice. I am on the third pass.', {
          faction: 'reclamation',
          weapon: 'pipeWrench',
          wanderRadius: 3,
        }),

        npc('settler-hana', 'Hana, mending the wall', SETTLER, at(20, 12), 'Left field. They always come over left field.', {
          faction: 'settlers',
          wanderRadius: 4,
        }),
        npc('settler-rook', 'Rook, boiling water', SETTLER, at(16, 30), 'You want the tunnels, the station is east on Addison. Go with somebody.', {
          faction: 'settlers',
          wanderRadius: 3,
        }),
        npc('settler-child', 'a child, throwing stones', SETTLER, at(22, 24), 'It used to be a ball park. My gran says there were forty thousand people.', {
          faction: 'settlers',
          timid: true,
          wanderRadius: 8,
          hp: 5,
        }),
      ],

      groundItems: [
        { item: createItem('medPack', 1), x: origin.x + 10, y: origin.y + 35 },
        { item: createItem('machete'), x: origin.x + 30, y: origin.y + 20 },
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
