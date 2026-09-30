import type { PlannedArea } from '../generation/plan/generateFromPlan';
import { WRIGLEYVILLE_PLACES, WRIGLEY_SPAWN_LOCAL } from '../places/wrigleyvillePlaces';
import WRIGLEYVILLE_PLAN from './wrigleyville.plan.txt?raw';

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

/** North-west corner of the ballpark. Its south wall sits on Addison, where the marquee is. */
export const WRIGLEY_ORIGIN = { x: 54, y: 38 };

/** Where you wake, on the concourse just inside the marquee. */
export const WRIGLEYVILLE_SPAWN = {
  x: WRIGLEY_ORIGIN.x + WRIGLEY_SPAWN_LOCAL.x,
  y: WRIGLEY_ORIGIN.y + WRIGLEY_SPAWN_LOCAL.y,
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
export const WRIGLEY_CLUBHOUSE_EXIT = { x: WRIGLEY_ORIGIN.x + 14, y: WRIGLEY_ORIGIN.y + 3 };

/**
 * The area itself lives in `wrigleyville.plan.txt` — one character per tile, drawn by hand. What
 * stays here is everything a text file cannot carry: where the player wakes, which seed the
 * procedural regions use, and where the landmarks' contents come from.
 */
export const WRIGLEYVILLE: PlannedArea = {
  id: 'wrigleyville',
  name: 'Wrigleyville',
  arrival: 'Open sky again, and the wind down the street with it.',
  plan: WRIGLEYVILLE_PLAN,
  seed: WRIGLEYVILLE_SEED,
  entry: WRIGLEYVILLE_SPAWN,
  places: WRIGLEYVILLE_PLACES,

  // This area's offset in a city-wide tile frame. Costs one field and is what later makes "the
  // Loop is a long way south" a computable fact rather than a guess.
  worldOrigin: { x: 0, y: 0 },

  decay: 0.02,
};

