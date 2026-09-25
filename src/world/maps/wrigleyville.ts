import type { AreaDef } from '../generation/city/AreaDef';
import { WRIGLEY_CLUBHOUSE_DOOR, WRIGLEY_SIZE, WRIGLEY_SPAWN } from '../landmarks/wrigleyField';

/**
 * Wrigleyville: the first area of ruined Chicago, and where the game now begins.
 *
 * ## The street table is a first draft
 *
 * What I'm confident of is the part everyone knows: **Wrigley Field is bounded by Clark to the
 * west, Addison to the south, Sheffield to the east and Waveland to the north**, with the marquee
 * at Clark and Addison and the elevated line running north-south just east of the park, its
 * Addison station a short walk from the gate. The rest — which cross streets sit where, and in
 * what order — is general knowledge rather than street-level, and this is **data meant to be
 * corrected** rather than a claim to have got the neighbourhood right.
 *
 * ## Scale
 *
 * ~15 ft a tile, as agreed. A Chicago block is **660 x 330 ft = 44 x 22 tiles, rectangular, with
 * its long axis east-west** — square blocks would be the single most visible way to get Chicago
 * wrong. The park's own block is oversized, which is true of the real one too.
 *
 * The area is 192 x 192 (~37,000 tiles): thirteen times the desert it replaces, comfortably past
 * the point where the camera has to scroll, and small enough to iterate on. `worldOrigin` places
 * it in a city-wide frame so that "the Loop is ~1,600 tiles south" stays a computable fact.
 */
export const WRIGLEYVILLE_SEED = 20260924;

const WIDTH = 144;
const HEIGHT = 144;

/** North-west corner of the ballpark. Its south wall sits on Addison, where the marquee is. */
export const WRIGLEY_ORIGIN = { x: 54, y: 38 };

/** Where you wake, on the concourse just inside the marquee. */
export const WRIGLEYVILLE_SPAWN = {
  x: WRIGLEY_ORIGIN.x + WRIGLEY_SPAWN.x,
  y: WRIGLEY_ORIGIN.y + WRIGLEY_SPAWN.y,
};

export const ADDISON_STATION_ORIGIN = { x: 98, y: 59 };

/**
 * Where the service tunnels put you back out: on Addison, just south of the station.
 *
 * The tunnel mouth is an ordinary floor tile that crosses the moment you step on it, unlike the
 * station's staircase, which needs a deliberate `>`. Both behaviours are deliberate and both are
 * tested — a tunnel that simply opens out onto the street has nothing to decide.
 */
export const WRIGLEYVILLE_SPAWN_FROM_TUNNELS = { x: 103, y: 70 };

/** The staircase down into the service tunnels, in world coordinates. */
export const ADDISON_STATION_STAIRS = { x: ADDISON_STATION_ORIGIN.x + 5, y: ADDISON_STATION_ORIGIN.y + 4 };

/** Where the clubhouse puts you back: one step south of its door, out under the stands. */
export const WRIGLEY_CLUBHOUSE_EXIT = {
  x: WRIGLEY_ORIGIN.x + WRIGLEY_CLUBHOUSE_DOOR.x,
  y: WRIGLEY_ORIGIN.y + WRIGLEY_CLUBHOUSE_DOOR.y + 1,
};

export const WRIGLEYVILLE: AreaDef = {
  id: 'wrigleyville',
  name: 'Wrigleyville',
  // Generic on purpose: this fires whenever you arrive from anywhere, and the ball park is only
  // one of those places. Waking up in the bowl has its own line, and so does the tunnel mouth.
  arrival: 'Open sky again, and the wind down the street with it.',
  width: WIDTH,
  height: HEIGHT,

  // Addison is 3600 N and the Loop is downtown, so this area sits well north of the origin. The
  // numbers are the frame's, not Chicago's grid — what matters is that south is toward the Loop.
  worldOrigin: { x: 0, y: 0 },

  // The spacing is the part that carries the proportions. North-south avenues sit ~48 tiles apart
  // (a 44-tile block plus the road); east-west streets sit ~26 apart (22 plus the road). That is
  // what makes the blocks rectangular with their long axis east-west, as Chicago's are.
  streets: [
    // North-south, west to east. Clark and Sheffield are the park's west and east walls, and the
    // block between them is deliberately oversized — the real park sits on an oversized one too.
    { name: 'Racine Avenue', axis: 'ns', at: 8, width: 5 },
    { name: 'Clark Street', axis: 'ns', at: 44, width: 5 },
    { name: 'Sheffield Avenue', axis: 'ns', at: 88, width: 5 },
    { name: 'Kenmore Avenue', axis: 'ns', at: 126, width: 5 },

    // East-west, north to south. Addison is the one the patrols walk.
    { name: 'Grace Street', axis: 'ew', at: 6, width: 5 },
    { name: 'Waveland Avenue', axis: 'ew', at: 28, width: 5 },
    { name: 'Addison Street', axis: 'ew', at: 68, width: 5 },
    { name: 'Cornelia Avenue', axis: 'ew', at: 90, width: 5 },
    { name: 'Newport Avenue', axis: 'ew', at: 112, width: 5 },
    { name: 'Roscoe Street', axis: 'ew', at: 134, width: 5 },
  ],

  /**
   * The Vigil's moat: a flooded ditch along the park's west and north flanks, where the drains
   * backed up. Impassable water with a reed fringe, deliberately leaving the marquee approach on
   * Addison dry — which is why the Wake raid the place rather than simply walking into it.
   */
  water: [
    { x0: 50, y0: 34, x1: 51, y1: 67 },
    { x0: 50, y0: 34, x1: 85, y1: 35 },
  ],

  entry: WRIGLEYVILLE_SPAWN,

  landmarks: [
    { id: 'wrigleyField', x: WRIGLEY_ORIGIN.x, y: WRIGLEY_ORIGIN.y },
    { id: 'addisonStation', x: ADDISON_STATION_ORIGIN.x, y: ADDISON_STATION_ORIGIN.y },
  ],

  // The L, running north-south between Sheffield and Kenmore, straight past the station. Drawn
  // over the blocks and under the streets — it's the line the player follows toward the Loop.
  elevated: [{ x0: 94, y0: 0, x1: 95, y1: HEIGHT - 1 }],

  /**
   * The south edge is buried, hard. That is the boundary with the next area south, and it is
   * terrain rather than a seam — the same collapse the player has been walking past all game. It
   * is also deliberately impassable for now: a second area doesn't exist yet, and shipping an
   * `AreaEdge` with nothing on the other side of it would be an untested abstraction.
   */
  boundaries: [
    { x0: 0, y0: HEIGHT - 10, x1: WIDTH - 1, y1: HEIGHT - 1 },
    { x0: 0, y0: 0, x1: WIDTH - 1, y1: 4 },
  ],

  // The park and a tile's margin round it: the Vigil keep this clear, and generation respects it.
  sanctuaries: [
    { x0: WRIGLEY_ORIGIN.x - 1, y0: WRIGLEY_ORIGIN.y - 1, x1: WRIGLEY_ORIGIN.x + 30, y1: WRIGLEY_ORIGIN.y + 30 },
  ],

  decay: 0.02,
};

/** Bounds of the park in world coordinates — used by content that wants "inside the settlement". */
export const WRIGLEY_RECT = {
  x0: WRIGLEY_ORIGIN.x,
  y0: WRIGLEY_ORIGIN.y,
  x1: WRIGLEY_ORIGIN.x + WRIGLEY_SIZE - 1,
  y1: WRIGLEY_ORIGIN.y + WRIGLEY_SIZE - 1,
};
