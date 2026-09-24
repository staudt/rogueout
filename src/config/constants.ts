export const TILE_SIZE = 20;

/**
 * Fallback viewport size in tiles. The real size is measured from the window at runtime (see
 * Renderer.resize) so the map fills whatever space the page has; these are only used when there's
 * nothing to measure — jsdom in tests, or a layout that hasn't happened yet.
 */
export const MIN_VIEWPORT_COLS = 40;
export const MIN_VIEWPORT_ROWS = 25;

/** Max gap (ms) between the first and second arrow-key press to count as a diagonal chord. */
export const DIAGONAL_CHORD_WINDOW_MS = 45;

/** Delay (ms) between each step of a click-to-travel walk — a brisk, visible walking pace. */
export const AUTO_TRAVEL_STEP_MS = 90;

/**
 * How far you can see terrain in the open under a hard sun: far enough that the limit is the
 * land itself, not the light. Sight is still blocked by anything opaque — a rock ridge hides what
 * is behind it exactly as a dungeon wall does.
 */
export const DAYLIGHT_SIGHT_RADIUS = 60;

/**
 * The cost of one action, and therefore the speed of an ordinary creature.
 *
 * NetHack's model: each creature banks its `speed` in movement points every player turn and
 * spends NORMAL_SPEED per action, so speed 24 acts twice per turn and speed 18 alternates between
 * one and two. The leftover carries over, which is what makes fractional speeds work.
 */
export const NORMAL_SPEED = 12;

/** A hard stop on actions per creature per turn, so a silly speed value can't hang the game. */
export const MAX_ACTIONS_PER_TURN = 8;

/** Creature weight (kg-ish) when a definition doesn't say — roughly a person. */
export const DEFAULT_WEIGHT = 70;

/**
 * How far a kick throws something, by weight. Light things tumble, people take a step, and
 * anything heavier than the last threshold just stands there and is now annoyed.
 */
export const KNOCKBACK_BY_WEIGHT: ReadonlyArray<readonly [maxWeight: number, tiles: number]> = [
  [5, 3],
  [20, 2],
  [90, 1],
];

/** How far a thrown object flies, and how much worse a boot is than an arm. */
export const THROW_RANGE = 6;
export const KICK_ITEM_RANGE = 3;

/** Upper bound for "walk that way until something happens" — larger than any map. */
export const MAX_TRAVEL_DISTANCE = 200;
