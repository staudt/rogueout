import { describe, expect, it } from 'vitest';
import { fireAt, hasLineOfFire, lineOfFire } from '../src/combat/Ranged';
import type { GameState, RegionState } from '../src/engine/GameState';
import { createPlayer } from '../src/entities/Player';
import { createMonster } from '../src/entities/Monster';
import { MONSTERS } from '../src/entities/MonsterData';
import { ITEMS } from '../src/items/ItemData';
import { createGameMap, setTileId } from '../src/world/GameMap';
import { createVisibility, markVisible } from '../src/fov/VisibilityState';
import { chebyshevDistance } from '../src/utils/geometry';
import { wantsPlayerDead } from '../src/ai/Actors';

/**
 * Firearms: unreliable, loud and ammo-starved rather than weak.
 *
 * None of the cost is in the damage, so the tests are mostly about the costs — the jam, the
 * report, and what a missed shot does to whatever was standing behind the thing you missed.
 */
function arena(width = 30, height = 11) {
  const map = createGameMap(width, height, 'floor');
  const visibility = createVisibility(width, height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) markVisible(visibility, x, y);

  const region: RegionState = {
    name: 'test arena',
    transitions: [],
    map,
    daylight: false,
    monsters: [],
    groundItems: [],
    npcs: [],
    visibility,
  };
  const state: GameState = {
    player: createPlayer(3, 5),
    regions: { arena: region },
    activeRegionId: 'arena',
    turnCount: 0,
    messageLog: [],
    gameOver: false,
  };
  return { state, region, map };
}

const RIFLE = ITEMS['pipeRifle']!;

/**
 * The first draw of a shot is the jam check, which a *low* roll fails — and every draw after it is
 * a to-hit, which a low roll passes. So the two are opposites, and a naive "always roll low" RNG
 * jams every single time. Worth stating plainly: it caught me out writing these.
 */
function rngRolling(...values: number[]) {
  let next = 0;
  return () => values[Math.min(next++, values.length - 1)]!;
}

/** Clears the jam check, then lands everything after it. */
const cleanHit = () => rngRolling(0.999, 0.01);
/** Fails the jam check on the way out of the barrel. */
const jams = () => rngRolling(0.001, 0.01);

describe('line of fire', () => {
  it('runs from the shooter to the target, excluding the shooter', () => {
    const { state, map } = arena();
    const path = lineOfFire(state.player, { x: 9, y: 5 }, map, 20);

    expect(path[0]).toEqual({ x: 4, y: 5 });
    expect(path.at(-1)).toEqual({ x: 9, y: 5 });
    for (let i = 1; i < path.length; i++) {
      expect(chebyshevDistance(path[i - 1]!, path[i]!)).toBe(1);
    }
  });

  it('stops at anything it cannot see through', () => {
    const { state, map } = arena();
    setTileId(map, 6, 5, 'brick');

    const path = lineOfFire(state.player, { x: 9, y: 5 }, map, 20);

    expect(path.at(-1)).toEqual({ x: 5, y: 5 }); // stops short of the wall
    expect(hasLineOfFire(state.player, { x: 9, y: 5 }, map, 20)).toBe(false);
  });

  it('carries over things you can see across but not walk on', () => {
    // Water is impassable and transparent. A thrown bottle drops at its edge; a bullet does not.
    const { state, map } = arena();
    setTileId(map, 6, 5, 'water');

    expect(hasLineOfFire(state.player, { x: 9, y: 5 }, map, 20)).toBe(true);
  });

  it('stops at the weapon\'s range', () => {
    const { state, map } = arena();
    expect(lineOfFire(state.player, { x: 25, y: 5 }, map, 4)).toHaveLength(4);
    expect(hasLineOfFire(state.player, { x: 25, y: 5 }, map, 4)).toBe(false);
  });
});

describe('firing', () => {
  it('hits what you aimed at and damages it', () => {
    const { state, region } = arena();
    const rat = createMonster(MONSTERS['alleyRat']!, 8, 5);
    region.monsters.push(rat);

    const outcome = fireAt(RIFLE, RIFLE.ranged!, rat, state, region, cleanHit());

    expect(outcome.kind).toBe('fired');
    expect(rat.hp).toBeLessThan(rat.maxHp);
  });

  it('carries on past what it missed, into whatever is behind', () => {
    // The rule the shared projectile walker exists for. A crowd must not be a wall of immunity.
    const { state, region } = arena();
    const front = createMonster(MONSTERS['alleyRat']!, 6, 5);
    const behind = createMonster(MONSTERS['alleyRat']!, 8, 5);
    region.monsters.push(front, behind);

    // Clears the jam, misses the first outright, then lands on the next.
    fireAt(RIFLE, RIFLE.ranged!, { x: 10, y: 5 }, state, region, rngRolling(0.999, 1.0, 0.01));

    expect(front.hp).toBe(front.maxHp);
    expect(behind.hp).toBeLessThan(behind.maxHp);
  });

  it('jams instead of firing, without spending the shot', () => {
    const { state, region } = arena();
    const rat = createMonster(MONSTERS['alleyRat']!, 8, 5);
    region.monsters.push(rat);

    const outcome = fireAt(RIFLE, RIFLE.ranged!, rat, state, region, jams());

    expect(outcome.kind).toBe('jammed');
    expect(rat.hp).toBe(rat.maxHp);
    expect(state.messageLog.join(' ')).toContain('jams');
  });

  it('stops in the wall when something is behind it', () => {
    const { state, region, map } = arena();
    setTileId(map, 6, 5, 'brick');
    const rat = createMonster(MONSTERS['alleyRat']!, 8, 5);
    region.monsters.push(rat);

    // The wall is at x=6, so the shot stops at x=5 and the rat at x=8 is untouched. Note this
    // still counts as *fired*: `no-line` is only for having nowhere at all to send it, and you
    // have spent the round either way. Aiming is the player's problem, which is why the fire
    // line is drawn while you aim.
    const outcome = fireAt(RIFLE, RIFLE.ranged!, rat, state, region, cleanHit());

    expect(outcome.kind).toBe('fired');
    expect(rat.hp).toBe(rat.maxHp); // the wall ate it
  });

  it('is heard far beyond what you can see', () => {
    // The real cost. Firing at something visible is how you summon things that are not, so the
    // report has to carry much further than sight or the trade-off never bites.
    const { state, region } = arena(80, 11);
    const distant = createMonster(MONSTERS['alleyRat']!, 40, 5);
    region.monsters.push(distant);
    expect(distant.investigating).toBeFalsy();

    fireAt(RIFLE, RIFLE.ranged!, { x: 10, y: 5 }, state, region, cleanHit());

    expect(distant.investigating).toBeTruthy();
    // ...and it comes to look, rather than arriving with a grudge: nobody screamed, and a bang
    // says only that something happened over there.
    expect(distant.investigating!.offender).toBeUndefined();
    expect(distant.provokedBy).toEqual([]);
  });

  it('never aims itself at somebody peaceful', () => {
    // Tab used to step through everything with a clear line, and two presses put the cursor on a
    // Vigil brother down the street. Starting a fight with someone peaceful has to take deliberate
    // input — the arrows will still take you there — never a convenience key.
    const { state, region } = arena();
    const rat = createMonster(MONSTERS['alleyRat']!, 9, 5); // predators: hostile
    const cat = createMonster(MONSTERS['feralCat']!, 6, 5); // wildlife: hostile to nobody
    region.monsters.push(rat, cat);

    expect(wantsPlayerDead(cat, state.player.faction)).toBe(false);
    expect(wantsPlayerDead(rat, state.player.faction)).toBe(true);
  });

  it('gives every gun a report louder than a shout', () => {
    for (const id of ['scrapPistol', 'pipeRifle', 'scattergun']) {
      const profile = ITEMS[id]!.ranged;
      expect(profile, `${id} should be a firearm`).toBeDefined();
      expect(profile!.noiseRadius).toBeGreaterThan(24); // SHOUT_RADIUS
      expect(profile!.jamChance).toBeGreaterThan(0); // and none of them is reliable
      expect(ITEMS[profile!.ammo], `${id}'s ammunition should exist`).toBeDefined();
    }
  });
});
