import { describe, expect, it } from 'vitest';
import {
  BADLY_HURT,
  narrateCondition,
  narrateMonsterAttack,
  narratePlayerAttack,
  narrateWaiting,
  pickPhrase,
  severityOf,
  UNARMED_VERB,
} from '../src/narrative/Narration';

const attack = (over: Partial<Parameters<typeof narratePlayerAttack>[0]> = {}) =>
  narratePlayerAttack({
    target: 'giant rat',
    verb: 'slash',
    hit: true,
    damage: 3,
    targetMaxHp: 6,
    killed: false,
    seed: 0,
    ...over,
  });

describe('severity', () => {
  it('measures a blow against what the target can take, not in absolute damage', () => {
    // The same 3 damage is most of a rat and a scratch on something much tougher.
    expect(severityOf(3, 6)).toBe('solid');
    expect(severityOf(3, 60)).toBe('graze');
    expect(severityOf(5, 6)).toBe('heavy');
  });

  it('treats a blow against a zero-max-HP target as heavy rather than dividing by zero', () => {
    expect(severityOf(1, 0)).toBe('heavy');
  });
});

describe('narrating the player attacking', () => {
  it('never leaks a raw damage number into the prose', () => {
    for (let damage = 1; damage <= 12; damage++) {
      expect(attack({ damage })).not.toMatch(/\d/);
    }
  });

  it('names the target and uses the wielded weapon or a bare-handed verb', () => {
    expect(attack({ seed: 1 })).toContain('giant rat');
    const slashes = [0, 1, 2, 3, 4].map((seed) => attack({ seed }));
    expect(slashes.some((line) => line.includes('slash'))).toBe(true);

    const unarmed = [0, 1, 2, 3, 4].map((seed) => attack({ seed, verb: UNARMED_VERB }));
    expect(unarmed.some((line) => line.includes(UNARMED_VERB))).toBe(true);
    expect(unarmed.every((line) => !line.includes('slash'))).toBe(true);
  });

  it('reads differently for a graze, a solid hit and a heavy one', () => {
    const light = attack({ damage: 1, targetMaxHp: 20 });
    const solid = attack({ damage: 8, targetMaxHp: 20 });
    const heavy = attack({ damage: 18, targetMaxHp: 20 });
    expect(new Set([light, solid, heavy]).size).toBe(3);
  });

  it('folds the kill into the blow instead of adding a second line', () => {
    const killed = attack({ killed: true, seed: 2 });
    expect(killed).toMatch(/does not get up|puts an end|lies still/);
    expect(killed).toContain('giant rat');
  });

  it('describes a miss as a miss, and never as a landed blow', () => {
    const misses = [0, 1, 2, 3, 4].map((seed) => attack({ hit: false, seed }));
    const hits = [0, 1, 2, 3, 4].map((seed) => attack({ seed }));

    expect(new Set(misses).size).toBe(misses.length); // a full rotation, all distinct
    for (const line of misses) {
      expect(hits).not.toContain(line);
      expect(line).toMatch(/miss|twists away|goes wide|nothing but air|not where/);
    }
  });

  it('leaves no placeholder unfilled, whatever the seed', () => {
    for (let seed = 0; seed < 60; seed++) {
      for (const over of [{}, { hit: false }, { killed: true }, { damage: 1, targetMaxHp: 40 }]) {
        expect(attack({ ...over, seed })).not.toMatch(/[{}]/);
      }
    }
  });
});

describe('narrating a monster attacking', () => {
  const bite = (over = {}) =>
    narrateMonsterAttack({ attacker: 'goblin', hit: true, damage: 4, targetMaxHp: 25, seed: 0, ...over });

  it('names the attacker and keeps numbers out of it', () => {
    expect(bite()).toContain('goblin');
    expect(bite()).not.toMatch(/\d/);
  });

  it('distinguishes a scratch from a mauling', () => {
    expect(bite({ damage: 1 })).not.toBe(bite({ damage: 20 }));
  });

  it('leaves no placeholder unfilled', () => {
    for (let seed = 0; seed < 60; seed++) {
      expect(bite({ seed })).not.toMatch(/[{}]/);
      expect(bite({ seed, hit: false })).not.toMatch(/[{}]/);
    }
  });
});

describe('condition', () => {
  it('speaks up only once things are genuinely bad', () => {
    expect(narrateCondition(30, 30)).toBeNull();
    expect(narrateCondition(Math.floor(30 * BADLY_HURT), 30)).not.toBeNull();
    expect(narrateCondition(Math.ceil(30 * BADLY_HURT) + 1, 30)).toBeNull();
  });

  it('says nothing about the dead — the killing blow already did', () => {
    expect(narrateCondition(0, 30)).toBeNull();
  });
});

describe('phrase variety', () => {
  it('is deterministic: the same turn always reads the same', () => {
    expect(narrateWaiting(7)).toBe(narrateWaiting(7));
    expect(pickPhrase(['a', 'b', 'c'], 12)).toBe(pickPhrase(['a', 'b', 'c'], 12));
  });

  it('actually varies across turns, rather than repeating one line forever', () => {
    const seen = new Set(Array.from({ length: 40 }, (_, seed) => pickPhrase(['a', 'b', 'c'], seed)));
    expect(seen.size).toBe(3);
  });

  it('never repeats itself on consecutive turns', () => {
    // The defect this replaced: a fight read "Your blow goes wide" three exchanges running.
    for (const table of [['a', 'b'], ['a', 'b', 'c'], ['a', 'b', 'c', 'd', 'e']]) {
      for (let seed = -20; seed < 60; seed++) {
        expect(pickPhrase(table, seed)).not.toBe(pickPhrase(table, seed + 1));
      }
    }
  });

  it('gives a fight varied phrasing over a long exchange', () => {
    // Both combatants draw once per turn from their own table, so a 12-turn fight should not
    // read like two lines on a loop.
    const lines = Array.from({ length: 12 }, (_, turn) =>
      narratePlayerAttack({
        target: 'goblin', verb: 'slash', hit: false, damage: 0, targetMaxHp: 12, killed: false, seed: turn,
      }),
    );
    expect(new Set(lines).size).toBeGreaterThanOrEqual(4);
  });

  it('copes with negative and huge seeds without falling off the list', () => {
    for (const seed of [-1, -999, 0, 2 ** 31 - 1, Number.MAX_SAFE_INTEGER]) {
      expect(['a', 'b', 'c']).toContain(pickPhrase(['a', 'b', 'c'], seed));
    }
  });

  it('returns an empty string rather than undefined for an empty table', () => {
    expect(pickPhrase([], 1)).toBe('');
  });
});
