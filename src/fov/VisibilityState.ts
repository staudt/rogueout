/**
 * Per-region tile-visibility tiers: `visible` (in FOV this turn) and `explored` (ever seen,
 * persists). Rendering uses this for the classic seen/remembered/hidden fog-of-war look.
 * Plain data, matching GameMapData's convention — behavior lives in the functions below.
 *
 * The flags are `Uint8Array` rather than `boolean[]` because these are the only arrays in the
 * game that scale with map *area*: at 192x192 a boolean array costs around 300 KB of pointers
 * per region for one bit of information each, and `resetVisible` runs every single turn. A typed
 * array makes that clear a memset and makes the save-time bitpacking (see MapCodec) direct.
 *
 * Note they are therefore *not* JSON-safe — `JSON.stringify` turns a Uint8Array into an object
 * keyed by index. Nothing should serialize one raw; `SaveSchema` encodes `explored` and drops
 * `visible` entirely, which it wanted to do anyway.
 */
export interface VisibilityData {
  width: number;
  height: number;
  visible: Uint8Array;
  explored: Uint8Array;
}

export function createVisibility(width: number, height: number): VisibilityData {
  return {
    width,
    height,
    visible: new Uint8Array(width * height),
    explored: new Uint8Array(width * height),
  };
}

function index(vis: VisibilityData, x: number, y: number): number {
  return y * vis.width + x;
}

function inBounds(vis: VisibilityData, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < vis.width && y < vis.height;
}

export function isVisible(vis: VisibilityData, x: number, y: number): boolean {
  return inBounds(vis, x, y) && vis.visible[index(vis, x, y)] === 1;
}

export function isExplored(vis: VisibilityData, x: number, y: number): boolean {
  return inBounds(vis, x, y) && vis.explored[index(vis, x, y)] === 1;
}

/** Clears the per-turn visible set. `explored` is untouched — call before recomputing FOV. */
export function resetVisible(vis: VisibilityData): void {
  vis.visible.fill(0);
}

/** Marks a tile visible this turn, and explored permanently. */
export function markVisible(vis: VisibilityData, x: number, y: number): void {
  if (!inBounds(vis, x, y)) return;
  const i = index(vis, x, y);
  vis.visible[i] = 1;
  vis.explored[i] = 1;
}
