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
