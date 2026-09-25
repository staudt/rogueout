import type { RNG } from '../../../utils/RNG';
import { randomInt } from '../../../utils/RNG';
import type { Rect } from '../Rect';
import type { CityCanvas } from './CityCanvas';

/** Below this in either dimension, a piece of land isn't worth subdividing further. */
const MIN_FOOTPRINT = 5;
/** Above this, keep splitting — a single building the size of half a block reads as a slab. */
const MAX_FOOTPRINT = 16;
/** How often a split leaves a one-tile gap between the halves instead of butting them together. */
const ALLEY_CHANCE = 0.35;

/**
 * Fills one block with buildings, by recursive binary subdivision.
 *
 * **Every footprint is stamped solid** — a `brick` ring around a `ruin` core — rather than hollow.
 * That follows directly from the decision that interiors are curated rather than generated, and it
 * buys much more than content scope: with no accidental interiors in the world, the connectivity
 * seal has almost nothing to do, and the only rooms that exist are ones somebody authored. It is
 * the difference between a generator that is tractable and one that is not.
 *
 * Buildings are written only inside the block rect, which is itself the complement of the street
 * lattice. That's what guarantees no pass can accidentally wall a street.
 */
export function fillBlock(canvas: CityCanvas, block: Rect, rng: RNG): Rect[] {
  const footprints: Rect[] = [];
  subdivide(block, rng, footprints, 0);

  for (const footprint of footprints) {
    stampSolid(canvas, footprint);
  }
  return footprints;
}

function subdivide(rect: Rect, rng: RNG, out: Rect[], depth: number): void {
  const width = rect.x1 - rect.x0 + 1;
  const height = rect.y1 - rect.y0 + 1;

  if (width < MIN_FOOTPRINT || height < MIN_FOOTPRINT) return;

  const mustSplit = width > MAX_FOOTPRINT || height > MAX_FOOTPRINT;
  // Past a few levels the sizes are plausible and further splitting just makes everything uniform.
  if (!mustSplit && (depth >= 3 || randomInt(rng, 0, 100) < 35)) {
    out.push(rect);
    return;
  }

  const splitVertically = width >= height;
  const extent = splitVertically ? width : height;
  if (extent < MIN_FOOTPRINT * 2 + 1) {
    out.push(rect);
    return;
  }

  // Keep the cut away from the ends so neither half lands under the minimum.
  const low = MIN_FOOTPRINT;
  const high = extent - MIN_FOOTPRINT - 1;
  const cut = randomInt(rng, low, high);
  const alley = randomInt(rng, 0, 100) < ALLEY_CHANCE * 100 ? 1 : 0;

  if (splitVertically) {
    const mid = rect.x0 + cut;
    subdivide({ ...rect, x1: mid }, rng, out, depth + 1);
    subdivide({ ...rect, x0: mid + 1 + alley }, rng, out, depth + 1);
  } else {
    const mid = rect.y0 + cut;
    subdivide({ ...rect, y1: mid }, rng, out, depth + 1);
    subdivide({ ...rect, y0: mid + 1 + alley }, rng, out, depth + 1);
  }
}

/** A building as it stands: brick shell, impassable interior. */
function stampSolid(canvas: CityCanvas, footprint: Rect): void {
  canvas.fill(footprint, 'ruin');
  for (let x = footprint.x0; x <= footprint.x1; x++) {
    canvas.set(x, footprint.y0, 'brick');
    canvas.set(x, footprint.y1, 'brick');
  }
  for (let y = footprint.y0; y <= footprint.y1; y++) {
    canvas.set(footprint.x0, y, 'brick');
    canvas.set(footprint.x1, y, 'brick');
  }
}
