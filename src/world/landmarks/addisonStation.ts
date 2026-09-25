import type { Point } from '../../utils/geometry';
import { createMonster } from '../../entities/Monster';
import { MONSTERS } from '../../entities/MonsterData';
import { createItem } from '../../items/Item';
import type { LandmarkDef } from './LandmarkRegistry';
import { DUNGEON1_SPAWN_FROM_WILDERNESS } from '../maps/dungeonLevel1';

/**
 * The Addison station, where the L crosses Addison just east of the ballpark.
 *
 * Two jobs. It is the mouth of the service tunnels — which is where the existing dungeon levels
 * are re-homed, so that content survives the move from the desert rather than being thrown away.
 * And it anchors the elevated line, which is the thing the player is meant to follow south: the
 * tracks are impassable ruin, but they are visible from a long way off and they point at the Loop.
 */
const WIDTH = 11;
const HEIGHT = 9;

const STAIRS: Point = { x: 5, y: 4 };
/**
 * Two street entrances onto Addison, not one.
 *
 * Found by the articulation-point guard in `pathfinding.test.ts`, which is precisely why that test
 * exists: with a single doorway, one creature standing in it locked the player out of the service
 * tunnels completely, and nothing would have reported that except a player who could not get in.
 * Real stations have several street stairs anyway.
 */
const DOORWAYS: Point[] = [
  { x: 2, y: HEIGHT - 1 },
  { x: 8, y: HEIGHT - 1 },
];

export const ADDISON_STATION: LandmarkDef = {
  id: 'addisonStation',
  name: 'the Addison station',
  width: WIDTH,
  height: HEIGHT,

  stamp: (put) => {
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const onEdge = x === 0 || y === 0 || x === WIDTH - 1 || y === HEIGHT - 1;
        put(x, y, onEdge ? 'brick' : 'floor');
      }
    }

    // The platform above has come down across the north end of the hall.
    for (let x = 1; x < WIDTH - 1; x++) put(x, 1, 'rubble');

    for (const doorway of DOORWAYS) put(doorway.x, doorway.y, 'street'); // the frames are long gone
    put(STAIRS.x, STAIRS.y, 'stairsDown');
  },

  anchors: [STAIRS, ...DOORWAYS],

  contents: (origin) => {
    const at = (p: Point): Point => ({ x: origin.x + p.x, y: origin.y + p.y });
    const stairs = at(STAIRS);
    const ghoul = MONSTERS['feralGhoul'];

    return {
      transitions: [
        {
          ...stairs,
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
};
