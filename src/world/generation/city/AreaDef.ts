import type { Rect } from '../Rect';

/**
 * A named street, declared rather than generated.
 *
 * This is the central opinion of the city generator: **streets are authored, blocks are
 * procedural.** A purely procedural grid cannot put Wrigley Field at Clark and Addison, and
 * landmarks need stable coordinates for exactly the reason the desert's town did — content
 * authors place things by hand and those places must not move between seeds.
 *
 * So the def declares the lattice and the generator fills the gaps. Blocks are the *complement*
 * of the lattice, never guessed at, which is also what makes the connectivity argument easy:
 * buildings are only ever written inside a block rect, so no pass can accidentally wall a street.
 */
export interface StreetDef {
  name: string;
  /** 'ns' runs north-south (a column at x = `at`); 'ew' runs east-west (a row at y = `at`). */
  axis: 'ns' | 'ew';
  /** The street's near edge — its low x for 'ns', low y for 'ew'. */
  at: number;
  /** Tiles across. 4 for a residential street, 6-7 for a major avenue. */
  width: number;
}

export interface AreaDef {
  id: string;
  name: string;
  arrival?: string;
  width: number;
  height: number;
  /**
   * Where this area sits in a city-wide tile frame.
   *
   * Costs one field now and is what later makes "the Loop is 1,600 tiles south" a computable fact
   * rather than a guess — for a compass, a map screen, or for two areas' tunnels to line up.
   */
  worldOrigin: { x: number; y: number };
  streets: StreetDef[];
  /** Where the player is considered to start; connectivity is measured from here. */
  entry: { x: number; y: number };
  /** Landmarks stamped into the grid, by id in the LandmarkRegistry, at a top-left corner. */
  landmarks: Array<{ id: string; x: number; y: number }>;
  /**
   * Rects that ruin damage is biased toward, so an area frays at its edges into the impassable
   * collapse that divides one district from the next. No special tile and no seam: an area
   * boundary looks exactly like the buried blocks the player has been walking past all along.
   */
  boundaries?: Rect[];
  /**
   * The elevated line: impassable structure drawn *over* the blocks but not over the streets,
   * because you walk under an L, not into it. Visible from a long way off and pointing south,
   * which is the whole reason it's here — it is the thing the player follows toward the Loop.
   */
  elevated?: Rect[];
  /** How ruined the area is overall, 0..1. Higher buries more of it. */
  decay?: number;
}

/** A street's footprint in grid coordinates. */
export function streetRect(street: StreetDef, area: AreaDef): Rect {
  return street.axis === 'ns'
    ? { x0: street.at, y0: 0, x1: street.at + street.width - 1, y1: area.height - 1 }
    : { x0: 0, y0: street.at, x1: area.width - 1, y1: street.at + street.width - 1 };
}

/**
 * The blocks: every rectangle of land the street lattice leaves behind.
 *
 * Derived, never declared. A block list written by hand would be a second source of truth that
 * silently disagrees with the streets the moment one of them moves.
 */
export function blockRects(area: AreaDef): Rect[] {
  const ns = area.streets.filter((s) => s.axis === 'ns').sort((a, b) => a.at - b.at);
  const ew = area.streets.filter((s) => s.axis === 'ew').sort((a, b) => a.at - b.at);

  const xSpans = spansBetween(ns, area.width);
  const ySpans = spansBetween(ew, area.height);

  const rects: Rect[] = [];
  for (const [y0, y1] of ySpans) {
    for (const [x0, x1] of xSpans) {
      rects.push({ x0, y0, x1, y1 });
    }
  }
  return rects;
}

/** The gaps left between a sorted run of streets, plus the margins at either end. */
function spansBetween(streets: StreetDef[], extent: number): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  let cursor = 0;

  for (const street of streets) {
    if (street.at > cursor) spans.push([cursor, street.at - 1]);
    cursor = street.at + street.width;
  }
  if (cursor <= extent - 1) spans.push([cursor, extent - 1]);

  // A span narrower than this isn't a block, it's a sliver between two streets that were declared
  // too close together — filling it with a building would just produce a wall along the kerb.
  return spans.filter(([a, b]) => b - a >= 3);
}
