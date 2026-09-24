export type IsOpaqueFn = (x: number, y: number) => boolean;
export type OnVisibleFn = (x: number, y: number) => void;

// [xx, xy, yx, yy] per octant: transforms a local (dx, dy) scan offset into a world offset
// from the origin. This is the standard 8-octant table for recursive shadowcasting.
const OCTANT_MULTIPLIERS: ReadonlyArray<readonly [number, number, number, number]> = [
  [1, 0, 0, 1],
  [0, 1, 1, 0],
  [0, -1, 1, 0],
  [-1, 0, 0, 1],
  [-1, 0, 0, -1],
  [0, -1, -1, 0],
  [0, 1, -1, 0],
  [1, 0, 0, -1],
];

/**
 * Recursive shadowcasting FOV (Björn Bergström's algorithm), radius-limited and symmetric in
 * the vast majority of cases. Pure — takes an opacity query and a visibility callback, with no
 * dependency on GameMapData, so it's directly unit-testable against arbitrary wall layouts (see
 * tests/fov.test.ts).
 *
 * Known limitation (inherent to this classic algorithm, not a bug): a shallow sightline that
 * grazes the corner of a diagonally-placed wall can occasionally see asymmetrically (A sees B
 * but B doesn't see A). This is rare in practice (~2% of sightlines in a moderately maze-like
 * test layout) and is the same trade-off made by most shipped roguelikes using this algorithm.
 * A stricter alternative (e.g. permissive/diamond raycasting) would fix it at higher complexity
 * — not worth it for v1.
 */
export function computeFOV(
  originX: number,
  originY: number,
  radius: number,
  isOpaque: IsOpaqueFn,
  onVisible: OnVisibleFn,
): void {
  onVisible(originX, originY);
  for (const [xx, xy, yx, yy] of OCTANT_MULTIPLIERS) {
    castLight(originX, originY, 1, 1.0, 0.0, radius, xx, xy, yx, yy, isOpaque, onVisible);
  }
}

function castLight(
  cx: number,
  cy: number,
  row: number,
  startParam: number,
  end: number,
  radius: number,
  xx: number,
  xy: number,
  yx: number,
  yy: number,
  isOpaque: IsOpaqueFn,
  onVisible: OnVisibleFn,
): void {
  let start = startParam;
  if (start < end) return;

  const radiusSquared = radius * radius;
  let blocked = false;
  let newStart = 0;

  for (let j = row; j <= radius; j++) {
    let dx = -j - 1;
    const dy = -j;

    while (dx <= 0) {
      dx += 1;
      const mapX = cx + dx * xx + dy * xy;
      const mapY = cy + dx * yx + dy * yy;
      const lSlope = (dx - 0.5) / (dy + 0.5);
      const rSlope = (dx + 0.5) / (dy - 0.5);

      if (start < rSlope) {
        continue;
      } else if (end > lSlope) {
        break;
      }

      if (dx * dx + dy * dy < radiusSquared) {
        onVisible(mapX, mapY);
      }

      if (blocked) {
        if (isOpaque(mapX, mapY)) {
          newStart = rSlope;
          continue;
        } else {
          blocked = false;
          start = newStart;
        }
      } else if (isOpaque(mapX, mapY) && j < radius) {
        blocked = true;
        castLight(cx, cy, j + 1, start, lSlope, radius, xx, xy, yx, yy, isOpaque, onVisible);
        newStart = rSlope;
      }
    }

    if (blocked) break;
  }
}
