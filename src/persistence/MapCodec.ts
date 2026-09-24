/**
 * Compact encodings for the two things in a save that scale with map *area*: the tile grid and
 * the explored bitmap. Everything else in a save scales with how much stuff is in the world,
 * which is small and stays small.
 *
 * This exists because the desert is 70x30 (2,100 tiles) and a city area is 192x192 (36,864).
 * Stored naively, one area is roughly 1.2 MB of JSON against a ~5 MB localStorage budget, and a
 * save holds *every region visited* — so the fourth place you went would fail to save. Encoded,
 * the same area is tens of kilobytes and region size stops being the binding constraint.
 *
 * Both functions are pure and DOM-free apart from `btoa`/`atob`, which exist in browsers and in
 * jsdom alike, so the tests exercise the real encoder rather than a stand-in.
 *
 * Decoders return `null` for anything malformed rather than throwing or guessing, matching the
 * contract `migrate()` already has: an unreadable save becomes a clean New Game, never a
 * half-valid world that crashes three turns later.
 */

/**
 * Run-length encoded tiles over a palette of the distinct ids used.
 *
 * Both halves matter. The palette turns a repeated `"street"` into a small integer, and the runs
 * collapse the long stretches of one material that any map made of rooms, streets and terrain is
 * mostly composed of. On city-like content this is around 1.5% of the raw JSON; on deliberately
 * pathological noise (every tile different from its neighbour) it is still smaller than the
 * array of quoted strings it replaces, which is why there's no "fall back to raw" branch to get
 * wrong.
 */
export interface EncodedTiles {
  /** Distinct tile ids, in first-seen order. Run entries index into this. */
  palette: string[];
  /** Flat [paletteIndex, count, paletteIndex, count, ...] pairs. */
  runs: number[];
}

export function encodeTiles(tiles: string[]): EncodedTiles {
  const palette: string[] = [];
  const indexOf = new Map<string, number>();
  const runs: number[] = [];

  let currentIndex = -1;
  let runLength = 0;

  for (const tile of tiles) {
    let paletteIndex = indexOf.get(tile);
    if (paletteIndex === undefined) {
      paletteIndex = palette.length;
      palette.push(tile);
      indexOf.set(tile, paletteIndex);
    }

    if (paletteIndex === currentIndex) {
      runLength += 1;
    } else {
      if (runLength > 0) runs.push(currentIndex, runLength);
      currentIndex = paletteIndex;
      runLength = 1;
    }
  }

  if (runLength > 0) runs.push(currentIndex, runLength);

  return { palette, runs };
}

/**
 * Rebuilds the tile array, or null if the encoding is malformed or doesn't produce exactly
 * `expectedLength` tiles. The length check is the one that matters in practice: a grid whose
 * contents disagree with its own width x height is the shape of a half-written save, and it
 * would otherwise show up much later as tiles reading off the end of a row.
 */
export function decodeTiles(encoded: unknown, expectedLength: number): string[] | null {
  if (!isRecord(encoded)) return null;

  const { palette, runs } = encoded as { palette: unknown; runs: unknown };
  if (!Array.isArray(palette) || !palette.every((id) => typeof id === 'string')) return null;
  if (!Array.isArray(runs) || runs.length % 2 !== 0) return null;

  const tiles: string[] = [];
  for (let i = 0; i < runs.length; i += 2) {
    const paletteIndex = runs[i];
    const count = runs[i + 1];
    if (typeof paletteIndex !== 'number' || typeof count !== 'number') return null;
    if (!Number.isInteger(count) || count <= 0) return null;

    const id = palette[paletteIndex];
    if (typeof id !== 'string') return null;

    // Guard before filling rather than after: a corrupt count could otherwise ask for gigabytes
    // of string before we ever get to compare lengths.
    if (tiles.length + count > expectedLength) return null;
    for (let n = 0; n < count; n += 1) tiles.push(id);
  }

  return tiles.length === expectedLength ? tiles : null;
}

/**
 * Packs a flag per tile into base64, eight to the byte.
 *
 * `explored` is the one thing here that genuinely cannot be recomputed — it's a record of where
 * the player has been, not a function of the world — so unlike `visible` it has to be stored.
 * One bit is all it holds, and storing it as `[false,false,true,...]` spends six JSON characters
 * on each of them.
 */
export function encodeBits(bits: ArrayLike<number | boolean>): string {
  const bytes = new Uint8Array(Math.ceil(bits.length / 8));
  for (let i = 0; i < bits.length; i += 1) {
    if (bits[i]) bytes[i >> 3] = bytes[i >> 3]! | (1 << (i & 7));
  }
  return bytesToBase64(bytes);
}

/**
 * Unpacks exactly `length` flags, or null if the string isn't valid base64 or is too short to
 * hold them. A *longer* string is accepted and its trailing padding bits ignored, since the last
 * byte legitimately carries up to seven of them.
 */
export function decodeBits(encoded: unknown, length: number): Uint8Array | null {
  if (typeof encoded !== 'string') return null;

  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(encoded);
  } catch {
    return null;
  }

  if (bytes.length < Math.ceil(length / 8)) return null;

  const bits = new Uint8Array(length);
  for (let i = 0; i < length; i += 1) {
    bits[i] = (bytes[i >> 3]! >> (i & 7)) & 1;
  }
  return bits;
}

/**
 * Chunked deliberately: `String.fromCharCode(...bytes)` spreads every byte into an argument list,
 * which throws a stack overflow somewhere in the tens of thousands — reachable with a map barely
 * bigger than the one that motivated this file, and only on a big map, which is the worst kind of
 * bug to ship.
 */
const BASE64_CHUNK = 0x8000;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + BASE64_CHUNK));
  }
  return btoa(binary);
}

function base64ToBytes(encoded: string): Uint8Array {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
