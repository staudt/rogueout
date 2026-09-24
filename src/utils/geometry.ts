export type Direction = 'N' | 'S' | 'E' | 'W' | 'NE' | 'NW' | 'SE' | 'SW';

export interface Point {
  x: number;
  y: number;
}

export const DIRECTION_VECTORS: Record<Direction, Point> = {
  N: { x: 0, y: -1 },
  S: { x: 0, y: 1 },
  E: { x: 1, y: 0 },
  W: { x: -1, y: 0 },
  NE: { x: 1, y: -1 },
  NW: { x: -1, y: -1 },
  SE: { x: 1, y: 1 },
  SW: { x: -1, y: 1 },
};

export function addPoints(a: Point, b: Point): Point {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function pointsEqual(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y;
}

/** Chebyshev (8-directional grid) distance. */
export function chebyshevDistance(a: Point, b: Point): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/** The Direction whose unit vector points from `a` toward `b`. Null if `b` isn't one step away. */
export function directionBetween(a: Point, b: Point): Direction | null {
  const dx = Math.sign(b.x - a.x);
  const dy = Math.sign(b.y - a.y);
  for (const direction of Object.keys(DIRECTION_VECTORS) as Direction[]) {
    const vector = DIRECTION_VECTORS[direction];
    if (vector.x === dx && vector.y === dy) return direction;
  }
  return null;
}

/** All grid points on the Bresenham line from `a` to `b`, inclusive, 8-connected and contiguous. */
export function linePoints(a: Point, b: Point): Point[] {
  const points: Point[] = [];
  let x = a.x;
  let y = a.y;
  const dx = Math.abs(b.x - x);
  const dy = -Math.abs(b.y - y);
  const stepX = x < b.x ? 1 : -1;
  const stepY = y < b.y ? 1 : -1;
  let error = dx + dy;

  for (;;) {
    points.push({ x, y });
    if (x === b.x && y === b.y) break;
    const doubled = 2 * error;
    if (doubled >= dy) {
      error += dy;
      x += stepX;
    }
    if (doubled <= dx) {
      error += dx;
      y += stepY;
    }
  }

  return points;
}
