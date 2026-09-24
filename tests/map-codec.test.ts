import { describe, it, expect } from 'vitest';
import { encodeTiles, decodeTiles, encodeBits, decodeBits } from '../src/persistence/MapCodec';

/**
 * The codec is what makes a city-sized region affordable to save at all, so these tests care
 * about two things in particular: that a round trip is exact (a save that reshapes the world is
 * worse than no save), and that malformed input returns null rather than throwing or producing a
 * plausible-looking wrong grid.
 */

/** A grid shaped like a city block — long runs of one material, which is the case being exploited. */
function cityLikeTiles(width: number, height: number): string[] {
  const tiles: string[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const onStreet = x % 44 < 6 || y % 22 < 4;
      tiles.push(onStreet ? 'street' : (x * 7 + y * 13) % 11 === 0 ? 'rubble' : 'brick');
    }
  }
  return tiles;
}

describe('encodeTiles / decodeTiles', () => {
  it('round-trips an empty grid', () => {
    const encoded = encodeTiles([]);
    expect(decodeTiles(encoded, 0)).toEqual([]);
  });

  it('round-trips a single tile', () => {
    expect(decodeTiles(encodeTiles(['street']), 1)).toEqual(['street']);
  });

  it('round-trips a uniform grid as one run', () => {
    const tiles = new Array(500).fill('ruin');
    const encoded = encodeTiles(tiles);

    expect(encoded.palette).toEqual(['ruin']);
    expect(encoded.runs).toEqual([0, 500]);
    expect(decodeTiles(encoded, 500)).toEqual(tiles);
  });

  it('round-trips a grid where every tile differs from its neighbour', () => {
    // The worst case for run-length encoding: every run is length 1. It must still be *correct*,
    // which is the property that lets the encoder be unconditional with no raw fallback.
    const tiles = Array.from({ length: 300 }, (_, i) => `tile${i % 9}`);
    expect(decodeTiles(encodeTiles(tiles), 300)).toEqual(tiles);
  });

  it('round-trips a city-like grid exactly', () => {
    const tiles = cityLikeTiles(192, 192);
    expect(decodeTiles(encodeTiles(tiles), tiles.length)).toEqual(tiles);
  });

  it('builds the palette in first-seen order and reuses entries', () => {
    const encoded = encodeTiles(['a', 'b', 'a', 'a', 'c']);

    expect(encoded.palette).toEqual(['a', 'b', 'c']);
    expect(encoded.runs).toEqual([0, 1, 1, 1, 0, 2, 2, 1]);
  });

  it('keeps a 192x192 city region under 50 KB of JSON', () => {
    // The budget the whole plan rests on: a fully-explored area must be cheap enough that twenty
    // visited regions still fit a ~5 MB localStorage quota with room to spare.
    const tiles = cityLikeTiles(192, 192);
    const naive = JSON.stringify(tiles).length;
    const encoded = JSON.stringify(encodeTiles(tiles)).length;

    expect(encoded).toBeLessThan(50_000);
    expect(encoded).toBeLessThan(naive / 10);
  });

  it('returns null for a grid that decodes to the wrong length', () => {
    const encoded = encodeTiles(new Array(100).fill('sand'));

    expect(decodeTiles(encoded, 99)).toBeNull();
    expect(decodeTiles(encoded, 101)).toBeNull();
  });

  it('returns null for structurally malformed input', () => {
    expect(decodeTiles(null, 4)).toBeNull();
    expect(decodeTiles('not an object', 4)).toBeNull();
    expect(decodeTiles([], 4)).toBeNull();
    expect(decodeTiles({ palette: ['a'] }, 4)).toBeNull();
    expect(decodeTiles({ runs: [0, 4] }, 4)).toBeNull();
    expect(decodeTiles({ palette: [3], runs: [0, 4] }, 4)).toBeNull();
    expect(decodeTiles({ palette: ['a'], runs: [0, 4, 1] }, 4)).toBeNull(); // odd run length
  });

  it('returns null for a run naming a palette entry that does not exist', () => {
    expect(decodeTiles({ palette: ['a'], runs: [7, 4] }, 4)).toBeNull();
    expect(decodeTiles({ palette: ['a'], runs: [-1, 4] }, 4)).toBeNull();
  });

  it('returns null for a nonsensical run count without trying to allocate it', () => {
    // A corrupt count must be rejected on sight. Filling first and comparing lengths afterwards
    // would mean asking for gigabytes of string before discovering the save was broken.
    expect(decodeTiles({ palette: ['a'], runs: [0, 1e9] }, 4)).toBeNull();
    expect(decodeTiles({ palette: ['a'], runs: [0, 0] }, 4)).toBeNull();
    expect(decodeTiles({ palette: ['a'], runs: [0, -4] }, 4)).toBeNull();
    expect(decodeTiles({ palette: ['a'], runs: [0, 1.5] }, 4)).toBeNull();
  });
});

describe('encodeBits / decodeBits', () => {
  it('round-trips an empty bitmap', () => {
    expect(Array.from(decodeBits(encodeBits([]), 0) ?? [])).toEqual([]);
  });

  it('round-trips a bitmap whose length is not a multiple of 8', () => {
    // The interesting case: the final byte carries padding bits that must not read back as set.
    for (const length of [1, 7, 8, 9, 13, 63, 65]) {
      const bits = Array.from({ length }, (_, i) => (i % 3 === 0 ? 1 : 0));
      const decoded = decodeBits(encodeBits(bits), length);

      expect(decoded).not.toBeNull();
      expect(decoded!.length).toBe(length);
      expect(Array.from(decoded!)).toEqual(bits);
    }
  });

  it('round-trips a Uint8Array, which is what VisibilityData actually holds', () => {
    const bits = new Uint8Array(1000);
    for (let i = 0; i < bits.length; i += 7) bits[i] = 1;

    expect(Array.from(decodeBits(encodeBits(bits), bits.length)!)).toEqual(Array.from(bits));
  });

  it('treats booleans and 0/1 identically', () => {
    expect(encodeBits([true, false, true])).toBe(encodeBits([1, 0, 1]));
  });

  it('round-trips an all-set and an all-clear bitmap', () => {
    const size = 36_864; // 192x192
    expect(decodeBits(encodeBits(new Uint8Array(size)), size)!.every((bit) => bit === 0)).toBe(true);

    const all = new Uint8Array(size).fill(1);
    expect(decodeBits(encodeBits(all), size)!.every((bit) => bit === 1)).toBe(true);
  });

  it('encodes a 192x192 explored bitmap in well under 10 KB', () => {
    const explored = new Uint8Array(36_864).fill(1);
    expect(encodeBits(explored).length).toBeLessThan(10_000);
  });

  it('survives a bitmap large enough to break a spread-argument encoder', () => {
    // String.fromCharCode(...bytes) blows the stack somewhere in the tens of thousands of
    // arguments. 400x400 is 20,000 bytes — comfortably past it, and an entirely plausible map.
    const size = 400 * 400;
    const bits = new Uint8Array(size);
    bits[0] = 1;
    bits[size - 1] = 1;

    const decoded = decodeBits(encodeBits(bits), size);
    expect(decoded![0]).toBe(1);
    expect(decoded![size - 1]).toBe(1);
    expect(decoded!.reduce((sum, bit) => sum + bit, 0)).toBe(2);
  });

  it('returns null when the payload is too short for the requested length', () => {
    const encoded = encodeBits(new Uint8Array(64));
    expect(decodeBits(encoded, 65)).toBeNull();
  });

  it('returns null for non-string or non-base64 input', () => {
    expect(decodeBits(null, 8)).toBeNull();
    expect(decodeBits(42, 8)).toBeNull();
    expect(decodeBits(['AAA'], 8)).toBeNull();
    expect(decodeBits('!!!!not base64!!!!', 8)).toBeNull();
  });
});
