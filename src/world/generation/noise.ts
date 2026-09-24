/**
 * Seeded 2D value noise — hand-rolled and dependency-free so it stays trivially testable and
 * fully deterministic (same seed + coords => same value, forever, across machines).
 *
 * Pure functions only: no module-level state, no RNG closure. Terrain generation samples this
 * per tile coordinate rather than walking an RNG stream, so generating a tile never depends on
 * the order tiles were generated in.
 */

/** Deterministic hash of (seed, x, y) to a float in [0, 1). Integer lattice values for the noise. */
function hash2(seed: number, x: number, y: number): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (x >>> 0), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (y >>> 0), 0xc2b2ae35) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0x27d4eb2d) >>> 0;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smoothstep — removes the visible grid-aligned creasing plain linear interpolation leaves. */
function fade(t: number): number {
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Value noise at a (possibly fractional) point. Returns [0, 1). */
export function valueNoise2D(seed: number, x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = fade(x - x0);
  const ty = fade(y - y0);

  const top = lerp(hash2(seed, x0, y0), hash2(seed, x0 + 1, y0), tx);
  const bottom = lerp(hash2(seed, x0, y0 + 1), hash2(seed, x0 + 1, y0 + 1), tx);
  return lerp(top, bottom, ty);
}

export interface FbmOptions {
  /** How many noise layers to sum. More octaves = more fine detail. */
  octaves?: number;
  /** Amplitude multiplier per octave (< 1, so later octaves contribute less). */
  persistence?: number;
  /** Frequency multiplier per octave (> 1, so later octaves are finer). */
  lacunarity?: number;
}

/**
 * Fractal Brownian motion: several octaves of value noise summed, normalized back to [0, 1).
 * This is what gives terrain both large landmasses (low octaves) and ragged edges (high ones).
 */
export function fbm2D(seed: number, x: number, y: number, options: FbmOptions = {}): number {
  const { octaves = 4, persistence = 0.5, lacunarity = 2 } = options;

  let amplitude = 1;
  let frequency = 1;
  let total = 0;
  let maxTotal = 0;

  for (let octave = 0; octave < octaves; octave++) {
    // Offsetting the seed per octave keeps the layers from being correlated copies of each other.
    total += valueNoise2D(seed + octave * 1013, x * frequency, y * frequency) * amplitude;
    maxTotal += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }

  return maxTotal === 0 ? 0 : total / maxTotal;
}
