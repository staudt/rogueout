import { createNpc } from '../../entities/Npc';
import { createItem } from '../../items/Item';
import { createMonster } from '../../entities/Monster';
import { MONSTERS } from '../../entities/MonsterData';
import type { Point } from '../../utils/geometry';
import type { Place } from './Places';
import { CLUBHOUSE_ENTRY, CLUBHOUSE_RECIPE } from '../regions/clubhouse';
import { DUNGEON1_SPAWN_FROM_WILDERNESS } from '../maps/dungeonLevel1';

/**
 * The named places of Wrigleyville, and where they are.
 *
 * None of these draw anything: the art is in `wrigleyville.plan.txt`, laid out by hand. What is
 * here is the part a text file cannot carry — who lives in a place, what its doors lead to, and
 * what it is called.
 *
 * **If you move something in the plan, move its rect here too.** The editor outlines every place
 * and names it, so a rect that has drifted off its art is visible rather than silent.
 */
const VIGIL = '#9fd3e0';
const RECLAMATION = '#7fb3d5';
const SETTLER = '#bfae8a';

/** Local to the ball park's north-west corner. */
const CLUBHOUSE_DOOR: Point = { x: 14, y: 2 };
const GATES: Point[] = [
  { x: 4, y: 29 },
  { x: 23, y: 29 },
];
export const WRIGLEY_SPAWN_LOCAL: Point = { x: 4, y: 27 };

export const WRIGLEYVILLE_PLACES: Place[] = [
  {
    id: 'wrigleyField',
    name: 'Wrigley Field',
    rect: { x0: 54, y0: 38, x1: 83, y1: 67 },
    sanctuary: true,
    authored: true,
    anchors: [WRIGLEY_SPAWN_LOCAL, CLUBHOUSE_DOOR, ...GATES, { x: 15, y: 15 }],
    contents: (origin) => {
      const at = (x: number, y: number): Point => ({ x: origin.x + x, y: origin.y + y });
      return {
        transitions: [
          {
            ...at(CLUBHOUSE_DOOR.x, CLUBHOUSE_DOOR.y),
            toRegion: CLUBHOUSE_RECIPE.regionId,
            spawnX: CLUBHOUSE_ENTRY.x,
            spawnY: CLUBHOUSE_ENTRY.y,
            create: CLUBHOUSE_RECIPE,
          },
        ],
        // The Vigil hold the park; the Reclamation trade on the concourse. The Restoration are
        // pointedly not here — they hold the roads south, which is a reason to go.
        npcs: [
          npc('almoner', 'Sister Adel of the Vigil', VIGIL, at(6, 25), 'You were half dead on Clark Street. Sit. Drink something.', { faction: 'vigil', timid: true, wanderRadius: 4, hp: 8 }),
          npc('waterbearer', 'Brother Cass of the Vigil', VIGIL, at(9, 27), 'The cistern is under the stands. Two cups a day, and nobody is turned away.', { faction: 'vigil', timid: true, wanderRadius: 5, hp: 8 }),
          npc('vigil-warden', 'Warden Iyabo of the Vigil', VIGIL, at(5, 22), 'The Wake come over the left-field wall. We mend it, they come again.', { faction: 'vigil', weapon: 'pipeWrench', wanderRadius: 6, hp: 14 }),
          npc('shopkeeper', 'Maren of the Reclamation', RECLAMATION, at(18, 27), 'Reclamation post, under the stands. If it was made before, I will buy it.', { shopId: 'reclamationPost', faction: 'reclamation', weapon: 'pipeWrench', hp: 14 }),
          npc('scrapper-eli', 'Eli, sorting scrap', RECLAMATION, at(21, 25), 'Everything in this park has been stripped twice. I am on the third pass.', { faction: 'reclamation', weapon: 'pipeWrench', wanderRadius: 3 }),
          npc('settler-hana', 'Hana, mending the wall', SETTLER, at(15, 9), 'Left field. They always come over left field.', { faction: 'settlers', wanderRadius: 4 }),
          npc('settler-rook', 'Rook, boiling water', SETTLER, at(12, 22), 'You want the tunnels, the station is east on Addison. Go with somebody.', { faction: 'settlers', wanderRadius: 3 }),
          npc('settler-child', 'a child, throwing stones', SETTLER, at(16, 18), 'It used to be a ball park. My gran says there were forty thousand people.', { faction: 'settlers', timid: true, wanderRadius: 8, hp: 5 }),
        ],
        groundItems: [
          { item: createItem('medPack', 1), ...at(8, 26) },
          { item: createItem('machete'), ...at(22, 15) },
        ],
      };
    },
  },

  {
    id: 'addisonStation',
    name: 'the Addison station',
    rect: { x0: 98, y0: 59, x1: 108, y1: 67 },
    authored: true,
    anchors: [
      { x: 5, y: 4 }, // the stairs
      { x: 2, y: 8 }, // and both street entrances
      { x: 8, y: 8 },
    ],
    contents: (origin) => {
      const ghoul = MONSTERS['feralGhoul'];
      return {
        transitions: [
          {
            x: origin.x + 5,
            y: origin.y + 4,
            toRegion: 'dungeon-1',
            spawnX: DUNGEON1_SPAWN_FROM_WILDERNESS.x,
            spawnY: DUNGEON1_SPAWN_FROM_WILDERNESS.y,
          },
        ],
        // Something has come up the stairs. A reason not to treat the station as a shortcut.
        monsters: ghoul ? [createMonster(ghoul, origin.x + 8, origin.y + 6)] : [],
        groundItems: [{ item: createItem('scrapSpear'), x: origin.x + 2, y: origin.y + 6 }],
      };
    },
  },
];

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
