import { describe, expect, it } from 'vitest';
import { computeFOV } from '../src/fov/Shadowcasting';

function isOpaqueFor(rows: readonly string[]) {
  return (x: number, y: number): boolean => {
    const row = rows[y];
    if (row === undefined) return true;
    const ch = row[x];
    if (ch === undefined) return true;
    return ch === '#';
  };
}

function visibleSet(rows: readonly string[], originX: number, originY: number, radius: number): Set<string> {
  const visible = new Set<string>();
  computeFOV(originX, originY, radius, isOpaqueFor(rows), (x, y) => visible.add(`${x},${y}`));
  return visible;
}

describe('computeFOV (recursive shadowcasting)', () => {
  it('always marks the origin visible', () => {
    const rows = ['.....', '.....', '.....'];
    expect(visibleSet(rows, 2, 1, 3).has('2,1')).toBe(true);
  });

  it('sees nearby open tiles and not tiles far outside the radius', () => {
    const rows = new Array(15).fill('.'.repeat(15));
    const vis = visibleSet(rows, 7, 7, 3);

    expect(vis.has('8,7')).toBe(true); // 1 tile away
    expect(vis.has('7,5')).toBe(true); // 2 tiles away, clearly within radius
    expect(vis.has('7,0')).toBe(false); // 7 tiles away, well outside radius
    expect(vis.has('0,0')).toBe(false); // far corner
  });

  it('casts a shadow: a wall blocks tiles directly behind it from the origin', () => {
    const rows = [
      '.........',
      '....#....',
      '.........',
      '.........',
      '.........',
    ];
    // Origin above the wall, looking straight down the same column.
    const vis = visibleSet(rows, 4, 0, 6);

    // The wall itself is visible (you can see a wall) ...
    expect(vis.has('4,1')).toBe(true);
    // ... but tiles directly beyond it in the same line of sight are blocked.
    expect(vis.has('4,3')).toBe(false);
    expect(vis.has('4,4')).toBe(false);

    // A column just to the side, with no wall in the way, stays fully visible.
    expect(vis.has('1,3')).toBe(true);
    expect(vis.has('1,4')).toBe(true);
  });

  it('is symmetric for the large majority of sightlines across an irregular layout', () => {
    // Classic recursive shadowcasting is not perfectly symmetric in every case — a shallow
    // sightline grazing a diagonal wall corner can occasionally see one-directionally. That's
    // an accepted trade-off (see the doc comment on computeFOV), so this asserts "rare", not "zero".
    const rows = [
      '...........',
      '..###......',
      '..#.#..###.',
      '..#.#..#.#.',
      '....#..#...',
      '.......#...',
      '...........',
    ];
    const radius = 10;

    const openPoints: Array<[number, number]> = [];
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        if (row[x] === '.') openPoints.push([x, y]);
      }
    });

    // Sample a spread of pairs rather than every combination (O(n^2) FOV calls) to keep this fast.
    const sampleA = openPoints.filter((_, i) => i % 5 === 0);
    const sampleB = openPoints.filter((_, i) => i % 7 === 0);

    let checked = 0;
    let asymmetric = 0;
    for (const [ax, ay] of sampleA) {
      const fromA = visibleSet(rows, ax, ay, radius);
      for (const [bx, by] of sampleB) {
        if (ax === bx && ay === by) continue;
        if (!fromA.has(`${bx},${by}`)) continue; // only relevant when A sees B
        checked += 1;
        const fromB = visibleSet(rows, bx, by, radius);
        if (!fromB.has(`${ax},${ay}`)) asymmetric += 1;
      }
    }

    expect(checked).toBeGreaterThan(20); // sanity: the sample actually exercised real sightlines
    expect(asymmetric / checked).toBeLessThan(0.1);
  });
});
