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

function arena(width = 20, height = 9): RegionState {
  const map = createGameMap(width, height, 'wall');
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) setTileId(map, x, y, 'floor');
  const visibility = createVisibility(width, height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) markVisible(visibility, x, y);
  return { map, daylight: false, monsters: [], groundItems: [], npcs: [], visibility };
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
    expect(knockbackTiles(3)).toBe(3); // a skink
    expect(knockbackTiles(15)).toBe(2); // a scorpion
    expect(knockbackTiles(75)).toBe(1); // a raider
    expect(knockbackTiles(400)).toBe(0);
  });
});

describe('applyKnockback', () => {
  it('shoves a creature the full distance across open ground', () => {
    const region = arena();
    const skink = createMonster(MONSTERS['sandSkink']!, 5, 4);
    region.monsters.push(skink);

    const result = applyKnockback(skink, 'E', 3, stateFor(region), region);

    expect([skink.x, skink.y]).toEqual([8, 4]);
    expect(result).toMatchObject({ moved: 3, collidedWith: null, hitWall: false });
  });

  it('stops at a wall instead of leaving the map', () => {
    const region = arena();
    const skink = createMonster(MONSTERS['sandSkink']!, 17, 4); // one tile from the east wall
    region.monsters.push(skink);

    const result = applyKnockback(skink, 'E', 3, stateFor(region), region);

    expect(skink.x).toBe(18);
    expect(result.hitWall).toBe(true);
    expect(result.moved).toBe(1);
  });

  it('stops against another creature, and says who', () => {
    const region = arena();
    const skink = createMonster(MONSTERS['sandSkink']!, 5, 4);
    const bystander = createMonster(MONSTERS['dustRat']!, 7, 4);
    region.monsters.push(skink, bystander);

    const result = applyKnockback(skink, 'E', 3, stateFor(region), region);

    expect(skink.x).toBe(6); // stopped adjacent to it
    expect(result.collidedWith).toBe(bystander);
  });

  it('never shoves anything onto the player', () => {
    const region = arena();
    const skink = createMonster(MONSTERS['sandSkink']!, 5, 4);
    region.monsters.push(skink);
    const state = stateFor(region, 7, 4); // directly in the flight path

    applyKnockback(skink, 'E', 3, state, region);

    expect(skink.x).toBe(6);
    expect([state.player.x, state.player.y]).toEqual([7, 4]);
  });
});

describe('kicking a creature', () => {
  it('does blunt damage whatever you are holding, and knocks it back', () => {
    // The point of the kick: a blunt answer to something your blade is wrong for, without
    // stopping to change weapons.
    const region = arena();
    const scorpion = createMonster(MONSTERS['paleScorpion']!, 3, 4);
    region.monsters.push(scorpion);
    const state = stateFor(region);
    const before = scorpion.hp;

    kickCreature(scorpion, 'E', state, region, createRNG(3));

    expect(scorpion.hp).toBeLessThan(before);
    expect(scorpion.x).toBeGreaterThan(3); // shoved away
    expect(state.messageLog.join(' ')).toContain('You kick the pale scorpion.');
  });

  it('makes an enemy of whatever you kicked', () => {
    const region = arena();
    const skink = createMonster(MONSTERS['sandSkink']!, 3, 4);
    region.monsters.push(skink);
    const state = stateFor(region);

    kickCreature(skink, 'E', state, region, createRNG(1));

    expect(skink.provokedBy).toContain('player');
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
    const rat = createMonster(MONSTERS['dustRat']!, 5, 4);
    region.monsters.push(rat);
    const state = stateFor(region);
    const before = rat.hp;

    const result = flingItem('machete', { x: 2, y: 4 }, 'E', 6, ITEMS['machete']!.damage, state, region, createRNG(2));

    expect(result.struck).toBe(rat);
    expect(rat.hp).toBeLessThan(before);
    expect(result.landedAt).toEqual({ x: 5, y: 4 }); // lands where it struck, retrievable
  });

  it('bounces off something the weapon cannot hurt, and says so', () => {
    const region = arena();
    const mold = createMonster(MONSTERS['crawlingMold']!, 5, 4); // immune to pierce
    region.monsters.push(mold);
    const state = stateFor(region);

    flingItem('scrapSpear', { x: 2, y: 4 }, 'E', 6, ITEMS['scrapSpear']!.damage, state, region, createRNG(1));

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
