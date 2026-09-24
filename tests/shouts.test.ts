import { describe, expect, it } from 'vitest';
import { narrateDistantFighting, narrateDistantShout, narrateShout, towards } from '../src/narrative/Shouts';
import { FACTIONS } from '../src/world/Factions';

describe('what people shout', () => {
  it('sounds like the faction doing the shouting', () => {
    const restoration = [0, 1, 2, 3].map((seed) => narrateShout('restoration', 'wake', seed));
    const wake = [0, 1, 2, 3].map((seed) => narrateShout('wake', 'restoration', seed));

    // No overlap at all: a militia barking orders and raiders enjoying themselves.
    expect(restoration.filter((line) => wake.includes(line))).toEqual([]);
    expect(restoration.join(' ')).toMatch(/Restoration|stand|Contact|Form up/);
    expect(wake.join(' ')).toMatch(/laugh|cheer|whoop|Company/);
  });

  it('names who they have seen when the line calls for it', () => {
    const lines = [0, 1, 2, 3].map((seed) => narrateShout('restoration', 'wake', seed));
    expect(lines.some((line) => line.includes(FACTIONS['wake']!.name))).toBe(true);
  });

  it('never leaves a placeholder showing, for any pair of factions', () => {
    for (const shouter of Object.keys(FACTIONS)) {
      for (const enemy of Object.keys(FACTIONS)) {
        for (let seed = 0; seed < 6; seed++) {
          expect(narrateShout(shouter, enemy, seed)).not.toMatch(/[{}]/);
        }
      }
    }
  });

  it('falls back to something plain for a faction with nothing to say', () => {
    expect(narrateShout('wildlife', 'player', 0)).toMatch(/shout|call/i);
  });

  it('varies, rather than repeating one line forever', () => {
    const lines = new Set([0, 1, 2, 3, 4, 5].map((seed) => narrateShout('wake', 'player', seed)));
    expect(lines.size).toBeGreaterThan(2);
  });
});

describe('hearing what you cannot see', () => {
  it('gives a direction and nothing more', () => {
    const heard = narrateDistantFighting({ x: 10, y: 10 }, { x: 30, y: 10 });

    expect(heard).toContain('east');
    // The point of the change: no names, no blow-by-blow, no idea who is winning.
    expect(heard).not.toMatch(/raider|trooper|hits|misses/);
  });

  it('reads the compass roughly, which is all you get by ear', () => {
    expect(towards({ x: 10, y: 10 }, { x: 30, y: 10 })).toContain('east');
    expect(towards({ x: 10, y: 10 }, { x: 10, y: 2 })).toContain('north');
    expect(towards({ x: 10, y: 10 }, { x: 2, y: 20 })).toMatch(/south-west/);
    expect(towards({ x: 10, y: 10 }, { x: 10, y: 10 })).toBe('nearby.');
  });

  it('a distant shout is a voice, not a speech', () => {
    const heard = narrateDistantShout({ x: 5, y: 5 }, { x: 5, y: 25 }, 1);
    expect(heard).toContain('south');
    expect(heard).not.toMatch(/Restoration|Wake|stand down/);
  });
});
