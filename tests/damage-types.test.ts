import { describe, expect, it } from 'vitest';
import {
  combineResistances,
  dominantType,
  hasTag,
  resistanceMultiplier,
  rollTypedDamage,
  type DamagePacket,
} from '../src/combat/DamageTypes';
import { resolveMeleeAttack } from '../src/combat/CombatResolver';
import type { Combatant } from '../src/combat/Combatant';
import { MONSTERS } from '../src/entities/MonsterData';
import { ITEMS } from '../src/items/ItemData';
import type { RNG } from '../src/utils/RNG';

/** Always rolls the top of any range, so damage is exact and the maths is checkable by hand. */
const maxRolls: RNG = () => 0.999999;
/** Always the bottom of the range. */
const minRolls: RNG = () => 0;

/**
 * A fresh RNG that lands the to-hit roll and then rolls maximum damage.
 *
 * `maxRolls` can't be used through resolveMeleeAttack: its first draw is the to-hit roll, and
 * 0.999999 becomes 100, which beats the 95% cap and always misses.
 */
function hitHard(): RNG {
  let first = true;
  return () => {
    if (first) {
      first = false;
      return 0; // to-hit roll of 1: always lands
    }
    return 0.999999;
  };
}

function combatant(over: Partial<Combatant> = {}): Combatant {
  return {
    hp: 30,
    maxHp: 30,
    ac: 10,
    strength: 0,
    agility: 5,
    accuracyBonus: 0,
    damage: [{ type: 'bludgeon', min: 2, max: 2 }],
    resistances: {},
    tags: ['living'],
    ...over,
  };
}

describe('resistances', () => {
  it('scale damage, with 1 meaning immune and a negative meaning vulnerable', () => {
    expect(resistanceMultiplier({ cut: 0 }, 'cut')).toBe(1);
    expect(resistanceMultiplier({ cut: 0.5 }, 'cut')).toBe(0.5);
    expect(resistanceMultiplier({ cut: 1 }, 'cut')).toBe(0);
    expect(resistanceMultiplier({ fire: -1 }, 'fire')).toBe(2);
    expect(resistanceMultiplier(undefined, 'cut')).toBe(1);
  });

  it('cannot turn a blow into healing, however absurd the numbers', () => {
    expect(resistanceMultiplier({ cut: 5 }, 'cut')).toBe(0);
  });

  it('stack across sources — your hide and what you are wearing', () => {
    const hide = { cut: 0.2 };
    const armor = { cut: 0.35, pierce: 0.1 };
    expect(combineResistances(hide, armor)).toEqual({ cut: 0.55, pierce: 0.1 });
    expect(combineResistances(undefined, armor)).toEqual({ cut: 0.35, pierce: 0.1 });
  });
});

describe('typed damage', () => {
  const cut: DamagePacket[] = [{ type: 'cut', min: 4, max: 4 }];

  it('applies the defender resistance for that specific type', () => {
    expect(rollTypedDamage(maxRolls, cut, 0, {}).total).toBe(4);
    expect(rollTypedDamage(maxRolls, cut, 0, { cut: 0.5 }).total).toBe(2);
    expect(rollTypedDamage(maxRolls, cut, 0, { pierce: 0.9 }).total).toBe(4); // wrong type, no help
  });

  it('reports a fully resisted blow as zero, not as the usual minimum of one', () => {
    // Immunity has to actually mean immunity, or "a spear does nothing to mold" is a lie.
    const roll = rollTypedDamage(maxRolls, [{ type: 'pierce', min: 9, max: 9 }], 10, { pierce: 1 });
    expect(roll.total).toBe(0);
    expect(roll.shrugged).toBe(true);
  });

  it('still does at least 1 when something gets through but rounds to nothing', () => {
    const roll = rollTypedDamage(minRolls, [{ type: 'cut', min: 1, max: 1 }], 0, { cut: 0.9 });
    expect(roll.total).toBe(1);
    expect(roll.shrugged).toBe(false);
  });

  it('adds the Strength bonus once, to the biggest physical component', () => {
    // A katana is cut *and* pierce; describing itself twice must not pay twice.
    const katana: DamagePacket[] = [
      { type: 'cut', min: 6, max: 6 },
      { type: 'pierce', min: 2, max: 2 },
    ];
    expect(rollTypedDamage(maxRolls, katana, 9, {}).total).toBe(6 + 3 + 2);
  });

  it('gives no Strength bonus to energy damage', () => {
    const flame: DamagePacket[] = [{ type: 'fire', min: 5, max: 5 }];
    expect(rollTypedDamage(maxRolls, flame, 30, {}).total).toBe(5);
  });

  it('names the type that did the most, for the log to describe', () => {
    const katana: DamagePacket[] = [
      { type: 'cut', min: 6, max: 6 },
      { type: 'pierce', min: 2, max: 2 },
    ];
    expect(dominantType(rollTypedDamage(maxRolls, katana, 0, {}))).toBe('cut');
    // Armour that turns cuts flips which half of the weapon is doing the work.
    expect(dominantType(rollTypedDamage(maxRolls, katana, 0, { cut: 0.9 }))).toBe('pierce');
  });
});

describe('the mold case, end to end', () => {
  // The reason tags exist: no special-casing anywhere, just tags and resistances meeting.
  const mold = () => {
    const def = MONSTERS['crawlingMold']!;
    return combatant({
      hp: def.maxHp,
      maxHp: def.maxHp,
      ac: 0, // so the to-hit roll always lands and the test is about damage
      damage: def.damage,
      resistances: def.resist ?? {},
      tags: def.tags,
    });
  };

  it('has no head to take off and no mind to read', () => {
    expect(hasTag(mold().tags, 'head')).toBe(false);
    expect(hasTag(mold().tags, 'mindless')).toBe(true);
  });

  it('shrugs off a spear entirely — there is nothing in it to puncture', () => {
    const spear = combatant({ agility: 20, strength: 5, damage: ITEMS['scrapSpear']!.damage! });
    const target = mold();

    const result = resolveMeleeAttack(hitHard(), spear, target);

    expect(result.hit).toBe(true);
    expect(result.damage).toBe(0);
    expect(result.shrugged).toBe(true);
    expect(target.hp).toBe(target.maxHp);
  });

  it('takes half from a sword, which at least has an edge', () => {
    const sword = combatant({ agility: 20, strength: 0, damage: ITEMS['machete']!.damage! });
    const target = mold();

    const result = resolveMeleeAttack(hitHard(), sword, target);

    expect(result.damage).toBe(2); // 4 cut, halved
    expect(result.shrugged).toBe(false);
  });

  it('burns: a vulnerability doubles the damage instead of reducing it', () => {
    const torch = combatant({ agility: 20, damage: [{ type: 'fire', min: 3, max: 3 }] });

    expect(resolveMeleeAttack(hitHard(), torch, mold()).damage).toBe(6);
  });
});

describe('armour turns a cut better than a thrust', () => {
  const armored = () => combatant({ ac: 0, resistances: ITEMS['paddedVest']!.resist! });

  it('the sword loses more to armour than the spear does', () => {
    const sword = combatant({ agility: 20, strength: 0, damage: ITEMS['machete']!.damage! });
    const spear = combatant({ agility: 20, strength: 0, damage: ITEMS['scrapSpear']!.damage! });

    const cut = resolveMeleeAttack(hitHard(), sword, armored());
    const thrust = resolveMeleeAttack(hitHard(), spear, armored());

    // Unarmoured the sword and spear are close; through leather the spear wins outright.
    expect(cut.damage).toBeLessThan(thrust.damage);
  });
});
