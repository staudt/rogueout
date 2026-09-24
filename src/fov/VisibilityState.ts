/**
 * Per-region tile-visibility tiers: `visible` (in FOV this turn) and `explored` (ever seen,
 * persists). Rendering uses this for the classic seen/remembered/hidden fog-of-war look.
 * Plain data, matching GameMapData's convention — behavior lives in the functions below.
 */
export interface VisibilityData {
  width: number;
  height: number;
  visible: boolean[];
  explored: boolean[];
}

export function createVisibility(width: number, height: number): VisibilityData {
  return {
    width,
    height,
    visible: new Array(width * height).fill(false),
    explored: new Array(width * height).fill(false),
  };
}

function index(vis: VisibilityData, x: number, y: number): number {
  return y * vis.width + x;
}

function inBounds(vis: VisibilityData, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < vis.width && y < vis.height;
}

export function isVisible(vis: VisibilityData, x: number, y: number): boolean {
  return inBounds(vis, x, y) && (vis.visible[index(vis, x, y)] ?? false);
}

export function isExplored(vis: VisibilityData, x: number, y: number): boolean {
  return inBounds(vis, x, y) && (vis.explored[index(vis, x, y)] ?? false);
}

/** Clears the per-turn visible set. `explored` is untouched — call before recomputing FOV. */
export function resetVisible(vis: VisibilityData): void {
  vis.visible.fill(false);
}

/** Marks a tile visible this turn, and explored permanently. */
export function markVisible(vis: VisibilityData, x: number, y: number): void {
  if (!inBounds(vis, x, y)) return;
  const i = index(vis, x, y);
  vis.visible[i] = true;
  vis.explored[i] = true;
}
