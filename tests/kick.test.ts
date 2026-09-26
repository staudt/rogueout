import { describe, expect, it } from 'vitest';
import { applyKnockback, flingItem, kickCreature, knockbackTiles } from '../src/combat/Kick';
import { createMonster } from '../src/entities/Monster';
import { MONSTERS } from '../src/entities/MonsterData';
import { createPlayer } from '../src/entities/Player';
import { createVisibility, markVisible } from '../src/fov/VisibilityState';
import { createGameMap, setTileId } from '../src/world/GameMap';
import { ITEMS } from '../src/items/ItemData';
import type { GameState, RegionState } from '../src/engine/GameState';
import { createRNG } from '../src/utils/RNG';
import { chebyshevDistance } from '../src/utils/geometry';

function arena(width = 20, height = 9): RegionState {
  const map = createGameMap(width, height, 'wall');
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) setTileId(map, x, y, 'floor');
  const visibility = createVisibility(width, height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) markVisible(visibility, x, y);
  return { map, daylight: false, monsters: [], groundItems: [], npcs: [], visibility, name: 'test arena', transitions: [] };
}

function stateFor(region: RegionState, x = 2, y = 4): GameState {
  return {
    player: createPlayer(x, y),
    regions: { arena: region },
    activeRegionId: 'arena',
    turnCount: 0,
    messageLog: [],
    gameOver: false,
  };
}

describe('knockback distance', () => {
  it('scales with weight: light things tumble, people take a step, heavy things stand there', () => {
    expect(knockbackTiles(3)).toBe(3); // a cat
    expect(knockbackTiles(15)).toBe(2); // a roach
    expect(knockbackTiles(75)).toBe(1); // a raider
    expect(knockbackTiles(400)).toBe(0);
  });
});

describe('applyKnockback', () => {
  it('shoves a creature the full distance across open ground', () => {
    const region = arena();
    const cat = createMonster(MONSTERS['feralCat']!, 5, 4);
    region.monsters.push(cat);

    const result = applyKnockback(cat, 'E', 3, stateFor(region), region);

    expect([cat.x, cat.y]).toEqual([8, 4]);
    expect(result).toMatchObject({ moved: 3, collidedWith: null, hitWall: false });
  });

  it('stops at a wall instead of leaving the map', () => {
    const region = arena();
    const cat = createMonster(MONSTERS['feralCat']!, 17, 4); // one tile from the east wall
    region.monsters.push(cat);

    const result = applyKnockback(cat, 'E', 3, stateFor(region), region);

    expect(cat.x).toBe(18);
    expect(result.hitWall).toBe(true);
    expect(result.moved).toBe(1);
  });

  it('stops against another creature, and says who', () => {
    const region = arena();
    const cat = createMonster(MONSTERS['feralCat']!, 5, 4);
    const bystander = createMonster(MONSTERS['alleyRat']!, 7, 4);
    region.monsters.push(cat, bystander);

    const result = applyKnockback(cat, 'E', 3, stateFor(region), region);

    expect(cat.x).toBe(6); // stopped adjacent to it
    expect(result.collidedWith).toBe(bystander);
  });

  it('never shoves anything onto the player', () => {
    const region = arena();
    const cat = createMonster(MONSTERS['feralCat']!, 5, 4);
    region.monsters.push(cat);
    const state = stateFor(region, 7, 4); // directly in the flight path

    applyKnockback(cat, 'E', 3, state, region);

    expect(cat.x).toBe(6);
    expect([state.player.x, state.player.y]).toEqual([7, 4]);
  });
});

describe('kicking a creature', () => {
  it('does blunt damage whatever you are holding, and knocks it back', () => {
    // The point of the kick: a blunt answer to something your blade is wrong for, without
    // stopping to change weapons.
    const region = arena();
    const roach = createMonster(MONSTERS['ironRoach']!, 3, 4);
    region.monsters.push(roach);
    const state = stateFor(region);
    const before = roach.hp;

    kickCreature(roach, 'E', state, region, createRNG(3));

    expect(roach.hp).toBeLessThan(before);
    expect(roach.x).toBeGreaterThan(3); // shoved away
    expect(state.messageLog.join(' ')).toContain('You kick the iron roach.');
  });

  it('makes an enemy of whatever you kicked', () => {
    const region = arena();
    const cat = createMonster(MONSTERS['feralCat']!, 3, 4);
    region.monsters.push(cat);
    const state = stateFor(region);

    kickCreature(cat, 'E', state, region, createRNG(1));

    expect(cat.provokedBy).toContain('player');
  });

  it('says so when the target is too heavy to move', () => {
    const region = arena();
    const heavy = createMonster({ ...MONSTERS['wakeRaider']!, weight: 500 }, 3, 4);
    region.monsters.push(heavy);
    const state = stateFor(region);

    kickCreature(heavy, 'E', state, region, createRNG(1));

    expect(heavy.x).toBe(3);
    expect(state.messageLog.join(' ')).toMatch(/does not budge/);
  });

  it('drops loot when the kick is what finishes it', () => {
    const region = arena();
    const raider = createMonster(MONSTERS['wakeRaider']!, 3, 4);
    raider.hp = 1;
    region.monsters.push(raider);
    const state = stateFor(region);

    kickCreature(raider, 'E', state, region, () => 0); // every drop roll succeeds

    expect(region.monsters).not.toContain(raider);
    expect(region.groundItems.length).toBeGreaterThan(0);
  });
});

describe('flinging an object', () => {
  it('flies until it runs out of range and lands on the floor', () => {
    const region = arena();
    const state = stateFor(region);

    const result = flingItem('machete', { x: 2, y: 4 }, 'E', 6, ITEMS['machete']!.damage, state, region, createRNG(1));

    expect(result.landedAt).toEqual({ x: 8, y: 4 });
    expect(result.struck).toBeNull();
  });

  it('hits the first creature in the way, for the weapon\'s own damage', () => {
    const region = arena();
    const rat = createMonster(MONSTERS['alleyRat']!, 5, 4);
    region.monsters.push(rat);
    const state = stateFor(region);
    const before = rat.hp;

    // A generous throw bonus so this test is about damage, not about aim.
    const result = flingItem('machete', { x: 2, y: 4 }, 'E', 6, ITEMS['machete']!.damage, state, region, createRNG(2), 200);

    expect(result.struck).toBe(rat);
    expect(rat.hp).toBeLessThan(before);
    expect(result.landedAt).toEqual({ x: 5, y: 4 }); // lands where it struck, retrievable
  });

  it('bounces off something the weapon cannot hurt, and says so', () => {
    const region = arena();
    const mold = createMonster(MONSTERS['blackMold']!, 5, 4); // immune to pierce
    region.monsters.push(mold);
    const state = stateFor(region);

    flingItem('scrapSpear', { x: 2, y: 4 }, 'E', 6, ITEMS['scrapSpear']!.damage, state, region, createRNG(1), 200);

    expect(mold.hp).toBe(mold.maxHp);
    expect(state.messageLog.join(' ')).toMatch(/bounces off/);
  });

  it('stops at a wall rather than flying through it', () => {
    const region = arena();
    const state = stateFor(region);

    const result = flingItem('machete', { x: 15, y: 4 }, 'E', 6, undefined, state, region, createRNG(1));

    expect(result.landedAt).toEqual({ x: 18, y: 4 }); // last open tile before the wall
  });
});


describe('some things are made for throwing and some are not', () => {
  /** Throws the same object at the same target many times and counts the hits. */
  function hitRate(throwBonus: number): number {
    let hits = 0;
    const attempts = 200;
    for (let seed = 0; seed < attempts; seed++) {
      const region = arena();
      const rat = createMonster(MONSTERS['alleyRat']!, 5, 4);
      region.monsters.push(rat);
      const result = flingItem('x', { x: 2, y: 4 }, 'E', 6, undefined, stateFor(region), region, createRNG(seed), throwBonus);
      if (result.struck) hits++;
    }
    return hits / attempts;
  }

  it('a knife lands far more often than a machete', () => {
    const knife = hitRate(ITEMS['throwingKnife']!.throwBonus!);
    const machete = hitRate(ITEMS['machete']!.throwBonus!);

    expect(knife).toBeGreaterThan(machete + 0.2);
  });

  it('darts are the best thing you can throw', () => {
    expect(ITEMS['dart']!.throwBonus!).toBeGreaterThan(ITEMS['scrapSpear']!.throwBonus!);
    expect(ITEMS['scrapSpear']!.throwBonus!).toBeGreaterThan(ITEMS['machete']!.throwBonus!);
  });

  it('a missed throw sails past and keeps going, rather than stopping in mid-air', () => {
    const region = arena();
    region.monsters.push(createMonster(MONSTERS['alleyRat']!, 4, 4));
    const state = stateFor(region);

    // Hopeless aim: it cannot connect, so it must travel the full range.
    const result = flingItem('x', { x: 2, y: 4 }, 'E', 5, undefined, state, region, createRNG(1), -500);

    expect(result.struck).toBeNull();
    expect(result.landedAt.x).toBe(7);
    expect(state.messageLog.join(' ')).toMatch(/sails past/);
  });
});

describe('a throw that misses keeps travelling', () => {
  /**
   * Reported as "a miss does not seem to be considered against the creature behind it". The logic
   * was already right — but you could not *tell*, because the log read "It sails past the alley
   * rat. It hits the alley rat.", which is two different rats with the same name and no way to see
   * which was which. The animation is the actual fix for that; this pins the behaviour so it stays
   * true, and documents that it was never the bug.
   */
  it('rolls against the next creature in line, and can hit it', () => {
    const region = arena();
    const first = createMonster(MONSTERS['alleyRat']!, 5, 4);
    const behind = createMonster(MONSTERS['alleyRat']!, 7, 4);
    region.monsters.push(first, behind);
    const state = stateFor(region);

    // A certain miss on the first, then rolls low enough to land everything after.
    const rolls = [1.0, 0.01, 0.01, 0.01, 0.01, 0.01];
    let next = 0;
    const rng = () => rolls[Math.min(next++, rolls.length - 1)]!;

    const result = flingItem('dart', { x: 2, y: 4 }, 'E', 8, [{ type: 'pierce', min: 2, max: 3 }], state, region, rng, 20);

    expect(first.hp).toBe(first.maxHp); // sailed past
    expect(behind.hp).toBeLessThan(behind.maxHp); // and struck the one behind
    expect(result.struck).toBe(behind);
  });

  it('reports every tile it crossed, so the flight can be drawn', () => {
    // The path exists only so the throw can be animated: resolution has already happened by the
    // time any of it is shown, so this cannot change an outcome — only make one legible.
    const region = arena();
    const state = stateFor(region);
    const rng = () => 0.01;

    const from = { x: 2, y: 4 };
    const result = flingItem('dart', from, 'E', 4, undefined, state, region, rng, 20);

    expect(result.path.length).toBeGreaterThan(0);
    expect(result.path.at(-1)).toEqual(result.landedAt);
    // Contiguous, and starting one tile from the thrower rather than on them.
    expect(result.path[0]).toEqual({ x: from.x + 1, y: from.y });
    for (let i = 1; i < result.path.length; i++) {
      expect(chebyshevDistance(result.path[i - 1]!, result.path[i]!)).toBe(1);
    }
  });
});
