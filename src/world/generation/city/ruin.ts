import { fbm2D } from '../noise';
import type { Rect } from '../Rect';
import { rectContains } from '../Rect';
import type { CityCanvas } from './CityCanvas';
import type { StreetGraph } from './StreetGraph';

/**
 * Damage, applied as a field rather than per building, so ruin comes in drifts — a run of blocks
 * taken together and a run left standing — instead of a per-building coin flip that produces an
 * even speckle everywhere and reads as noise rather than as history.
 */
const DAMAGE_NOISE = { octaves: 3, persistence: 0.5, lacunarity: 2 };
const NOISE_SCALE = 0.035;

/**
 * Thresholds on the damage field, in increasing severity.
 *
 * Tuned against a measurement rather than by eye, and the number that mattered was **street versus
 * rubble**. Looser values produced a map that was 50% walkable with more rubble than road, which
 * read as open ground with some walls in it — the opposite of a city, and it quietly undid the
 * premise that streets are how you get around. These hold streets above rubble across every seed
 * tried, with buildings at ~60% of the map.
 */
const BREACHED = 0.64;
const GUTTED = 0.82;
const BURIED = 0.94;

export interface RuinOptions {
  seed: number;
  /** Raises damage everywhere. */
  decay: number;
  /** Damage rises toward these, so an area frays into impassable collapse at its edges. */
  boundaries: Rect[];
}

/**
 * Wrecks the city, and is the only pass that writes everywhere.
 *
 * Two things keep it safe. It cannot touch a landmark, because `CityCanvas` refuses protected
 * writes. And it cannot cut the street lattice, because the only way it is allowed to remove a
 * street is `StreetGraph.bury`, which declines any stretch whose loss would disconnect the graph.
 * Between them the finished map is connected *by construction*, rather than by a repair pass that
 * hopes to catch whatever went wrong.
 */
export function applyRuin(
  canvas: CityCanvas,
  footprints: Rect[],
  graph: StreetGraph,
  options: RuinOptions,
): void {
  const damageAt = (x: number, y: number): number => {
    const base = fbm2D(options.seed, x * NOISE_SCALE, y * NOISE_SCALE, DAMAGE_NOISE);
    return Math.min(1, base + options.decay + boundaryBias(x, y, options.boundaries));
  };

  for (const footprint of footprints) {
    const cx = (footprint.x0 + footprint.x1) / 2;
    const cy = (footprint.y0 + footprint.y1) / 2;
    const damage = damageAt(cx, cy);

    if (damage < BREACHED) continue;

    if (damage < GUTTED) {
      breach(canvas, footprint, options.seed);
    } else if (damage < BURIED) {
      // Gutted: the shell is down and the inside is crossable, so the block has a way through it.
      canvas.fill(footprint, 'rubble');
    } else {
      canvas.fill(footprint, 'ruin');
    }
  }

  // Streets go last, and only ever through the graph.
  for (const segment of graph.allSegments()) {
    const cx = (segment.rect.x0 + segment.rect.x1) / 2;
    const cy = (segment.rect.y0 + segment.rect.y1) / 2;
    if (damageAt(cx, cy) < BURIED) continue;
    if (!graph.bury(segment.id)) continue;

    canvas.fill(segment.rect, 'ruin');
  }
}

/**
 * A breached building: the shell is broken open in a couple of places and the interior becomes
 * rubble, so you can get in and out but it still reads as a standing building.
 */
function breach(canvas: CityCanvas, footprint: Rect, seed: number): void {
  const inner: Rect = {
    x0: footprint.x0 + 1,
    y0: footprint.y0 + 1,
    x1: footprint.x1 - 1,
    y1: footprint.y1 - 1,
  };
  if (inner.x0 > inner.x1 || inner.y0 > inner.y1) return;

  canvas.fill(inner, 'rubble');

  // Openings taken from the same noise, so which wall fell is stable for a seed.
  for (let x = footprint.x0; x <= footprint.x1; x++) {
    for (const y of [footprint.y0, footprint.y1]) {
      if (fbm2D(seed + 1, x * 0.6, y * 0.6) > 0.68) canvas.set(x, y, 'rubble');
    }
  }
  for (let y = footprint.y0; y <= footprint.y1; y++) {
    for (const x of [footprint.x0, footprint.x1]) {
      if (fbm2D(seed + 1, x * 0.6, y * 0.6) > 0.68) canvas.set(x, y, 'rubble');
    }
  }
}

/** Rises from 0 well outside a boundary rect to ~0.35 inside it. */
function boundaryBias(x: number, y: number, boundaries: Rect[]): number {
  let strongest = 0;
  for (const rect of boundaries) {
    if (rectContains(rect, x, y)) return 0.35;
    const dx = Math.max(rect.x0 - x, 0, x - rect.x1);
    const dy = Math.max(rect.y0 - y, 0, y - rect.y1);
    const distance = Math.hypot(dx, dy);
    if (distance > 24) continue;
    strongest = Math.max(strongest, 0.35 * (1 - distance / 24));
  }
  return strongest;
}
