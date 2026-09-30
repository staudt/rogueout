/**
 * An area drawn as a text file, one character per tile.
 *
 * This replaces generating the street layout from a table of axes and offsets. That produced a
 * lattice that was regular *by construction* — every street dead straight, full width and evenly
 * spaced — and no amount of damage on top disguised it. A drawn map can have a diagonal, a street
 * that stops halfway, a block that isn't a rectangle and an alley that goes nowhere, because
 * irregularity is exactly as easy to draw as regularity.
 *
 * It also makes the map a thing a person can edit. Most characters are literal tiles; a few are
 * **instructions** — "fill this shape with buildings", "collapse this into cave" — so the file
 * says plainly which parts are authored and which are left to the generator, which was the whole
 * request. Anything the generator fills is still seeded, so it is the same every game.
 *
 * ## File shape
 *
 * Free-form header (title, legend, notes — anything you like), then a line of `---`, then the
 * grid. Every grid row must be exactly the same width, and the loader says which line is wrong
 * when one isn't: a miscounted row is the failure this project already shipped once, back when
 * maps were hand-typed, and it is worth catching loudly rather than structurally.
 */
import type { Point } from '../../../utils/geometry';

/** How much traffic a stretch of road carries. Drives width when drawing, and who lives on it. */
export type RoadClass = 'none' | 'alley' | 'street' | 'arterial';

export const ROAD_CLASS_ORDER: RoadClass[] = ['none', 'alley', 'street', 'arterial'];

/** A character that stands for a tile, laid down exactly as drawn. */
const LITERAL: Record<string, string> = {
  '=': 'street', // arterial roadway
  '.': 'street', // ordinary roadway
  "'": 'street', // alley
  ',': 'sidewalk',
  '#': 'brick',
  '*': 'ruin',
  ':': 'rubble',
  '~': 'water',
  '"': 'weeds',
  '%': 'swamp',
  T: 'thicket',
  g: 'grass',
  _: 'floor',
  '+': 'door',
  '>': 'stairsDown',
  '<': 'stairsUp',
};

/** Roadway characters, and how busy each one is. */
const ROAD: Record<string, RoadClass> = {
  '=': 'arterial',
  '.': 'street',
  "'": 'alley',
  ',': 'street', // pavement inherits its road's business well enough for content purposes
};

/**
 * Characters the generator acts on rather than copies.
 *
 * Each contiguous shape of one of these is found by flood fill and handed to the matching pass, so
 * a block can be any shape at all — a triangle left over where a diagonal cuts the grid, an
 * L around a landmark — and the filler works with it.
 */
export const INSTRUCTIONS: Record<string, 'build' | 'collapse' | 'either'> = {
  B: 'build', // standing buildings, subdivided into footprints
  C: 'collapse', // come down into cave
  '?': 'either', // let the damage field decide, as it used to
};

export interface AreaPlan {
  width: number;
  height: number;
  /** One character per tile, row-major. */
  cells: string[];
  /** Everything before the `---`, kept so a round trip doesn't lose the legend. */
  header: string;
}

export class PlanError extends Error {}

export function parsePlan(text: string): AreaPlan {
  const lines = text.split(/\r?\n/);
  const separator = lines.findIndex((line) => line.trim() === '---');
  if (separator === -1) {
    throw new PlanError('Plan has no `---` separating the header from the grid.');
  }

  const header = lines.slice(0, separator).join('\n');
  const rows = lines.slice(separator + 1).filter((line, index, all) => {
    // A single trailing newline is normal and shouldn't become a zero-width row.
    return !(line === '' && index === all.length - 1);
  });

  if (rows.length === 0) throw new PlanError('Plan has no grid.');

  const width = rows[0]!.length;
  rows.forEach((row, index) => {
    if (row.length !== width) {
      // The line number in the *file*, so it can be jumped to directly.
      const line = separator + 2 + index;
      throw new PlanError(
        `Plan line ${line} is ${row.length} characters, expected ${width}. ` +
          'Every grid row must be the same width — check for a missing or extra character.',
      );
    }
  });

  const cells: string[] = [];
  for (const row of rows) {
    for (const char of row) {
      if (!isKnown(char)) {
        throw new PlanError(`Plan uses unknown character ${JSON.stringify(char)}.`);
      }
      cells.push(char);
    }
  }

  return { width, height: rows.length, cells, header };
}

export function isKnown(char: string): boolean {
  return char in LITERAL || char in INSTRUCTIONS;
}

export function literalTile(char: string): string | undefined {
  return LITERAL[char];
}

export function roadClassOf(char: string): RoadClass {
  return ROAD[char] ?? 'none';
}

export function planAt(plan: AreaPlan, x: number, y: number): string {
  if (x < 0 || y < 0 || x >= plan.width || y >= plan.height) return '*';
  return plan.cells[y * plan.width + x] ?? '*';
}

/**
 * Every contiguous shape drawn with the same instruction character, 4-connected.
 *
 * 4-connected rather than 8 on purpose: two blocks that touch only at a corner — which is exactly
 * what a diagonal street leaves behind — are two blocks, not one bow-tie.
 */
export function instructionRegions(plan: AreaPlan): Array<{ char: string; tiles: Point[] }> {
  const seen = new Uint8Array(plan.width * plan.height);
  const regions: Array<{ char: string; tiles: Point[] }> = [];

  for (let y = 0; y < plan.height; y++) {
    for (let x = 0; x < plan.width; x++) {
      const index = y * plan.width + x;
      if (seen[index]) continue;

      const char = plan.cells[index]!;
      if (!(char in INSTRUCTIONS)) continue;

      const tiles: Point[] = [];
      const queue: number[] = [index];
      seen[index] = 1;

      for (let head = 0; head < queue.length; head++) {
        const current = queue[head]!;
        const cx = current % plan.width;
        const cy = (current / plan.width) | 0;
        tiles.push({ x: cx, y: cy });

        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= plan.width || ny >= plan.height) continue;
          const next = ny * plan.width + nx;
          if (seen[next] || plan.cells[next] !== char) continue;
          seen[next] = 1;
          queue.push(next);
        }
      }

      regions.push({ char, tiles });
    }
  }

  return regions;
}

