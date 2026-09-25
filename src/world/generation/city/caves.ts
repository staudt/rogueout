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
const INITIAL_SOLID = 67; // per cent; lower opens the caves into one room, higher closes them up
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
      solid[y * width + x] = randomInt(rng, 0, 99) < INITIAL_SOLID ? 1 : 0;
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
          // **Off the block counts as open**, which is the opposite of the usual convention and
          // is the whole point. Counting it solid — and forcing the block's border solid to match
          // — walled every caved block off behind an unbroken, sight-blocking frontage, so from
          // the pavement a ruin was indistinguishable from an intact building and the passages
          // inside it might as well not have existed. Letting the caves reach their own edge means
          // the ruin is ragged and open where it meets the street, and you can see into it.
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          neighbours += solid[ny * width + nx]!;
        }
      }
      next[y * width + x] = neighbours >= SOLID_THRESHOLD ? 1 : 0;
    }
  }
  return next;
}

/**
 * Cuts a few extra ways in, on top of whatever the automata already left open at the block's edge.
 *
 * Since caves now reach their own border, most blocks are open to the street without any help.
 * This remains as insurance for the occasional block that closes up anyway — a sealed lump is one
 * `sealDisconnectedAreas` would quietly fill in entirely, taking with it the thing that makes ruin
 * worth having: that you can sometimes cut through a block instead of walking round it.
 */
export function openCaveMouths(canvas: CityCanvas, block: Rect, rng: RNG, count = 4): void {
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
