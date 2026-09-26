import { isKnown, parsePlan } from '../world/generation/plan/AreaPlan';

/**
 * A plan being edited: the header, the grid, and the operations a paint tool performs on it.
 *
 * Pure and DOM-free, so the editing itself is testable without a browser — the same split the
 * game uses between its systems and its UI. The document never validates *meaning* (whether a
 * landmark is the right size, whether the map is connected); that is the generator's job, and the
 * editor shows what it says.
 */
export interface Point {
  x: number;
  y: number;
}

export class PlanDocument {
  header: string;
  readonly width: number;
  readonly height: number;
  private cells: string[];
  private readonly undoStack: string[][] = [];

  constructor(text: string) {
    const parsed = parsePlan(text);
    this.header = parsed.header;
    this.width = parsed.width;
    this.height = parsed.height;
    this.cells = [...parsed.cells];
  }

  at(x: number, y: number): string {
    if (!this.contains(x, y)) return ' ';
    return this.cells[y * this.width + x]!;
  }

  contains(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  /** Call once before a stroke, not per tile — an undo should take back the whole drag. */
  beginStroke(): void {
    this.undoStack.push([...this.cells]);
    // Deep enough to be useful, shallow enough that 144x144 snapshots don't accumulate forever.
    if (this.undoStack.length > 40) this.undoStack.shift();
  }

  undo(): boolean {
    const previous = this.undoStack.pop();
    if (!previous) return false;
    this.cells = previous;
    return true;
  }

  paint(x: number, y: number, char: string): void {
    if (!this.contains(x, y) || !isKnown(char)) return;
    this.cells[y * this.width + x] = char;
  }

  /** Bresenham, the same line the game draws roads and shots along. */
  line(from: Point, to: Point, char: string): void {
    let x = from.x;
    let y = from.y;
    const dx = Math.abs(to.x - x);
    const dy = -Math.abs(to.y - y);
    const stepX = x < to.x ? 1 : -1;
    const stepY = y < to.y ? 1 : -1;
    let error = dx + dy;

    for (;;) {
      this.paint(x, y, char);
      if (x === to.x && y === to.y) break;
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
  }

  /** A filled rectangle between two corners, in either order. */
  rect(from: Point, to: Point, char: string): void {
    const x0 = Math.min(from.x, to.x);
    const x1 = Math.max(from.x, to.x);
    const y0 = Math.min(from.y, to.y);
    const y1 = Math.max(from.y, to.y);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.paint(x, y, char);
  }

  /**
   * Flood fill, 4-connected — matching how the generator finds a procedural region, so what you
   * fill here is exactly the shape it will treat as one block.
   */
  fill(from: Point, char: string): void {
    const target = this.at(from.x, from.y);
    if (target === char || !this.contains(from.x, from.y)) return;

    const queue: Point[] = [from];
    while (queue.length > 0) {
      const { x, y } = queue.pop()!;
      if (!this.contains(x, y) || this.at(x, y) !== target) continue;
      this.paint(x, y, char);
      queue.push({ x: x + 1, y }, { x: x - 1, y }, { x, y: y + 1 }, { x, y: y - 1 });
    }
  }

  /** How many of each character the plan uses — a quick read on how much is left to the generator. */
  tally(): Map<string, number> {
    const counts = new Map<string, number>();
    for (const cell of this.cells) counts.set(cell, (counts.get(cell) ?? 0) + 1);
    return counts;
  }

  toText(): string {
    const rows: string[] = [];
    for (let y = 0; y < this.height; y++) {
      rows.push(this.cells.slice(y * this.width, y * this.width + this.width).join(''));
    }
    return `${this.header}\n---\n${rows.join('\n')}\n`;
  }
}
