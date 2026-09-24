import { TILE_SIZE, VIEWPORT_COLS, VIEWPORT_ROWS } from '../config/constants';
import type { Point } from '../utils/geometry';

/** Tracks which grid cell is shown in the viewport's top-left corner, and pixel<->grid math. */
export class Camera {
  originX = 0;
  originY = 0;

  centerOn(focus: Point, mapWidth: number, mapHeight: number): void {
    const maxOriginX = Math.max(0, mapWidth - VIEWPORT_COLS);
    const maxOriginY = Math.max(0, mapHeight - VIEWPORT_ROWS);
    this.originX = Math.max(0, Math.min(focus.x - Math.floor(VIEWPORT_COLS / 2), maxOriginX));
    this.originY = Math.max(0, Math.min(focus.y - Math.floor(VIEWPORT_ROWS / 2), maxOriginY));
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
