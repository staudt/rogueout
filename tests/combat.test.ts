import { describe, expect, it } from 'vitest';
import {
  computeAC,
  computeFovRadius,
  computeMaxHP,
  computeToHitChance,
  rollDamage,
} from '../src/combat/CombatFormulas';
import { resolveMeleeAttack } from '../src/combat/CombatResolver';
import type { Combatant } from '../src/combat/Combatant';
import type { RNG } from '../src/utils/RNG';

/** Deterministic fake RNG for tests: replays a fixed sequence of [0,1) values, then repeats the last. */
function fakeRNG(values: number[]): RNG {
  let i = 0;
  return () => {
    const v = values[Math.min(i, values.length - 1)] ?? 0;
    i += 1;
    return v;
  };
}

function makeCombatant(overrides: Partial<Combatant> = {}): Combatant {
  return {
    hp: 10,
    maxHp: 10,
    ac: 10,
    strength: 5,
    agility: 5,
    accuracyBonus: 0,
    minDamage: 1,
    maxDamage: 2,
    ...overrides,
  };
}

describe('CombatFormulas', () => {
  it('computeMaxHP scales with endurance', () => {
    expect(computeMaxHP(5)).toBe(25);
    expect(computeMaxHP(1)).toBe(13);
  });

  it('computeAC includes agility and armor', () => {
    expect(computeAC(5)).toBe(12); // 10 + floor(5/2) + 0
    expect(computeAC(5, 3)).toBe(15);
  });

  it('computeToHitChance clamps to [5, 95]', () => {
    expect(computeToHitChance(5, 0, 10)).toBe(30); // 50 + 0 + 0 - 20
    expect(computeToHitChance(20, 50, 0)).toBe(95); // would be way over 100
    expect(computeToHitChance(1, 0, 50)).toBe(5); // would be deeply negative
  });

  it('rollDamage never goes below 1 even against heavy resistance', () => {
    const rng = fakeRNG([0]); // lowest possible roll
    expect(rollDamage(rng, 1, 2, 0, 100)).toBe(1);
  });

  it('computeFovRadius scales with perception', () => {
    expect(computeFovRadius(5)).toBe(7); // 6 + floor(5/3)
    expect(computeFovRadius(0)).toBe(6);
  });
});

describe('resolveMeleeAttack', () => {
  it('applies damage to the defender on a hit', () => {
    const attacker = makeCombatant({ agility: 5, strength: 5 });
    const defender = makeCombatant({ ac: 10, hp: 10 });
    // toHitChance = 30. First roll (to-hit) = 1 -> hit. Second roll (damage) low -> minimal damage.
    const rng = fakeRNG([0, 0]);

    const result = resolveMeleeAttack(rng, attacker, defender);

    expect(result.hit).toBe(true);
    expect(result.damage).toBeGreaterThan(0);
    expect(defender.hp).toBe(10 - result.damage);
  });

  it('does not touch the defender on a miss', () => {
    const attacker = makeCombatant({ agility: 5, strength: 5 });
    const defender = makeCombatant({ ac: 10, hp: 10 });
    // toHitChance = 30. Roll close to 1.0 -> randomInt(1,100) = 100 -> miss.
    const rng = fakeRNG([0.999999]);

    const result = resolveMeleeAttack(rng, attacker, defender);

    expect(result.hit).toBe(false);
    expect(result.damage).toBe(0);
    expect(defender.hp).toBe(10);
  });

  it('never drops hp below 0', () => {
    const attacker = makeCombatant({ agility: 20, strength: 20, minDamage: 50, maxDamage: 50 });
    const defender = makeCombatant({ ac: 0, hp: 3 });
    const rng = fakeRNG([0, 0]);

    resolveMeleeAttack(rng, attacker, defender);

    expect(defender.hp).toBe(0);
  });
});
