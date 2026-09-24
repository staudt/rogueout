import { MIN_VIEWPORT_COLS, MIN_VIEWPORT_ROWS, TILE_SIZE } from '../config/constants';
import type { Point } from '../utils/geometry';

/**
 * Tracks which grid cell is shown in the viewport's top-left corner, and pixel<->grid math.
 *
 * The viewport size is not a constant: the canvas fills the page, so it changes with the window
 * (Renderer.resize feeds it back in here). Everything below is pure arithmetic over those
 * dimensions, which is what makes the scroll/clamp/centre behaviour testable without a DOM.
 */
export class Camera {
  originX = 0;
  originY = 0;
  cols = MIN_VIEWPORT_COLS;
  rows = MIN_VIEWPORT_ROWS;

  resize(cols: number, rows: number): void {
    this.cols = Math.max(1, cols);
    this.rows = Math.max(1, rows);
  }

  centerOn(focus: Point, mapWidth: number, mapHeight: number): void {
    this.originX = axisOrigin(focus.x, mapWidth, this.cols);
    this.originY = axisOrigin(focus.y, mapHeight, this.rows);
  }

  worldToScreen(x: number, y: number): Point {
    return { x: (x - this.originX) * TILE_SIZE, y: (y - this.originY) * TILE_SIZE };
  }

  screenToWorld(px: number, py: number): Point {
    return {
      x: Math.floor(px / TILE_SIZE) + this.originX,
      y: Math.floor(py / TILE_SIZE) + this.originY,
    };
  }
}

/**
 * Where one axis of the viewport starts, in world coordinates.
 *
 * Three cases, and the third is the one that only shows up now that the viewport can be bigger
 * than a map: when the map doesn't fill the view, the origin goes *negative* to centre it, rather
 * than pinning a small dungeon to the top-left corner with empty space beside it. Drawing then
 * walks over out-of-bounds coordinates, which is safe — they're never explored, so the renderer
 * skips them.
 */
function axisOrigin(focus: number, mapExtent: number, viewportExtent: number): number {
  if (mapExtent <= viewportExtent) return -Math.floor((viewportExtent - mapExtent) / 2);

  const centered = focus - Math.floor(viewportExtent / 2);
  return Math.max(0, Math.min(centered, mapExtent - viewportExtent));
}
