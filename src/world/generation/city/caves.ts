import type { RNG } from '../../../utils/RNG';
import { randomInt } from '../../../utils/RNG';
import type { Rect } from '../Rect';
import type { CityCanvas } from './CityCanvas';

/**
 * A block that has come down, filled as cave rather than as buildings.
 *
 * Cellular automata, the classic way to get Gnomish-Mines texture: scatter solid and open at
 * random, then repeatedly let each tile take the majority of its neighbours. Noise becomes
 * chambers and winding passages in four passes, and — the reason it's the right tool here —
 * nothing about the result looks *authored*. A collapsed block should not have corners.
 *
 * The floor is `rubble` and the solid is `ruin`, so a caved block is walkable in places and
 * genuinely blocked in others. That is what makes it worth exploring rather than merely a hole:
 * you can cut through some of them, and you find out which by trying.
 */
const INITIAL_SOLID = 55; // per cent; below ~44 the caves open into one room, above ~50 they close up
const SMOOTHING_PASSES = 4;
/** A tile goes solid when at least this many of its eight neighbours are. The classic 4-5 rule. */
const SOLID_THRESHOLD = 5;

export function fillCave(canvas: CityCanvas, block: Rect, rng: RNG): void {
  const width = block.x1 - block.x0 + 1;
  const height = block.y1 - block.y0 + 1;
  if (width < 4 || height < 4) return;

  let solid = seed(width, height, rng);
  for (let pass = 0; pass < SMOOTHING_PASSES; pass++) {
    solid = smooth(solid, width, height);
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      canvas.set(block.x0 + x, block.y0 + y, solid[y * width + x] === 1 ? 'ruin' : 'rubble');
    }
  }
}

function seed(width: number, height: number, rng: RNG): Uint8Array {
  const solid = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // The block's own edge starts solid, so a cave doesn't spill onto the pavement as a
      // ragged fringe. Where it opens onto the street is decided afterwards, deliberately.
      const onEdge = x === 0 || y === 0 || x === width - 1 || y === height - 1;
      solid[y * width + x] = onEdge || randomInt(rng, 0, 99) < INITIAL_SOLID ? 1 : 0;
    }
  }
  return solid;
}

function smooth(solid: Uint8Array, width: number, height: number): Uint8Array {
  const next = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let neighbours = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          // Off the edge counts as solid, which keeps the cave from opening at its own border.
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) neighbours++;
          else neighbours += solid[ny * width + nx]!;
        }
      }
      next[y * width + x] = neighbours >= SOLID_THRESHOLD ? 1 : 0;
    }
  }
  return next;
}

/**
 * Breaks a cave open onto the streets around it, at a few points rather than everywhere.
 *
 * Without this a caved block is a sealed lump that `sealDisconnectedAreas` would quietly fill in
 * entirely, and the city would lose exactly the thing that makes ruin interesting — that you can
 * sometimes cut through a block instead of walking round it. A handful of mouths is also how it
 * reads: the ruin has given way in places, not along the whole frontage.
 */
export function openCaveMouths(canvas: CityCanvas, block: Rect, rng: RNG, count = 3): void {
  const width = block.x1 - block.x0 + 1;
  const height = block.y1 - block.y0 + 1;

  for (let i = 0; i < count; i++) {
    const side = randomInt(rng, 0, 3);
    const along = side < 2 ? randomInt(rng, 1, width - 2) : randomInt(rng, 1, height - 2);

    const x = side === 0 || side === 1 ? block.x0 + along : side === 2 ? block.x0 : block.x1;
    const y = side === 0 ? block.y0 : side === 1 ? block.y1 : block.y0 + along;

    // Two tiles deep, so the mouth actually reaches the cave rather than only scuffing its wall.
    canvas.set(x, y, 'rubble');
    canvas.set(
      side === 0 ? x : side === 1 ? x : side === 2 ? x + 1 : x - 1,
      side === 0 ? y + 1 : side === 1 ? y - 1 : y,
      'rubble',
    );
  }
}
