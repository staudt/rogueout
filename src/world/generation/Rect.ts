/** An inclusive rectangular area of the grid: both corners are part of the area. */
export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function rectContains(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x0 && x <= rect.x1 && y >= rect.y0 && y <= rect.y1;
}
