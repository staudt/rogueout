import { describe, expect, it } from 'vitest';
import type { GameState, RegionState } from '../src/engine/GameState';
import { createPlayer } from '../src/entities/Player';
import { createMonster } from '../src/entities/Monster';
import { MONSTERS } from '../src/entities/MonsterData';
import { createRNG } from '../src/utils/RNG';
import { runMonsterTurns } from '../src/ai/AIScheduler';
import { createGameMap } from '../src/world/GameMap';
import { createVisibility } from '../src/fov/VisibilityState';
import { chebyshevDistance } from '../src/utils/geometry';
import { PACK_RADIUS } from '../src/config/constants';

/**
 * Dogs, and the difference between them and wolves.
 *
 * A stray on its own hangs back; three together come straight in; and thinning the pack breaks the
 * survivors rather than cornering them. Nothing here coordinates anything — each animal separately
 * decides whether the odds look good, which is the whole of what "a pack, but less organised than
 * wolves" comes to.
 */
function arena(width = 40, height = 12) {
  const map = createGameMap(width, height, 'floor');
  const region: RegionState = {
    name: 'test arena',
    transitions: [],
    map,
    daylight: false,
    monsters: [],
    groundItems: [],
    npcs: [],
    visibility: createVisibility(width, height),
  };
  const state: GameState = {
    player: createPlayer(20, 6),
    regions: { arena: region },
    activeRegionId: 'arena',
    turnCount: 0,
    messageLog: [],
    gameOver: false,
  };
  return { state, region };
}

function dogsAt(region: RegionState, ...spots: Array<[number, number]>) {
  const def = MONSTERS['strayDog']!;
  const pack = spots.map(([x, y]) => createMonster(def, x, y));
  region.monsters.push(...pack);
  return pack;
}

function run(state: GameState, turns: number) {
  const rng = createRNG(7);
  for (let i = 0; i < turns; i++) {
    state.turnCount += 1;
    runMonsterTurns(state, rng);
  }
}

describe('pack animals', () => {
  it('is declared as data, not special-cased for dogs', () => {
    expect(MONSTERS['strayDog']!.pack).toBeGreaterThan(0);
    // The big one hunts alone; that is what makes it the big one.
    expect(MONSTERS['junkyardDog']!.pack).toBeUndefined();
  });

  // Distances here are deliberately inside `awarenessRadius` (9). Placed further out, a dog never
  // notices the player at all and every one of these passes whether the mechanic exists or not —
  // which is exactly how two of them were vacuous when first written.
  it('a lone stray will not close on you', () => {
    const { state, region } = arena();
    const [dog] = dogsAt(region, [13, 6]); // 7 away: well within sight
    expect(chebyshevDistance(dog!, state.player)).toBeLessThan(MONSTERS['strayDog']!.awarenessRadius);

    run(state, 8);

    // It mills about rather than hunting. Eight turns at speed 15 is ten actions — more than
    // enough to reach the player, if it wanted to.
    expect(chebyshevDistance(dog!, state.player)).toBeGreaterThan(3);
  });

  it('a pack comes straight in', () => {
    const { state, region } = arena();
    const pack = dogsAt(region, [13, 5], [13, 6], [13, 7]);

    run(state, 8);

    expect(Math.min(...pack.map((d) => chebyshevDistance(d, state.player)))).toBeLessThanOrEqual(1);
  });

  it('counts only companions close enough to be any use', () => {
    // Two strays, both of which can see the player, but too far apart to embolden each other.
    // The radius is what makes a pack a pack.
    const { state, region } = arena(60);
    const far = dogsAt(region, [13, 6], [13 + PACK_RADIUS + 8, 6]);
    for (const dog of far) {
      expect(chebyshevDistance(dog, state.player)).toBeLessThan(MONSTERS['strayDog']!.awarenessRadius);
    }
    expect(chebyshevDistance(far[0]!, far[1]!)).toBeGreaterThan(PACK_RADIUS);

    run(state, 8);

    expect(Math.min(...far.map((d) => chebyshevDistance(d, state.player)))).toBeGreaterThan(3);
  });

  it('breaks when its pack is killed, rather than fighting to the death', () => {
    const { state, region } = arena();
    const pack = dogsAt(region, [15, 6], [15, 5], [15, 7]);

    // Two die; the survivor is barely scratched but now alone.
    pack[1]!.hp = 0;
    pack[2]!.hp = 0;
    const survivor = pack[0]!;
    survivor.hp = survivor.maxHp - 1;

    const before = chebyshevDistance(survivor, state.player);
    run(state, 6);

    expect(chebyshevDistance(survivor, state.player)).toBeGreaterThan(before);
  });

  it('a wounded animal with its pack around it keeps coming', () => {
    // The mirror of the last one: the same injury, with company, and it presses instead.
    const { state, region } = arena();
    const pack = dogsAt(region, [14, 6], [14, 5], [14, 7]);
    for (const dog of pack) dog.hp = dog.maxHp - 1;

    const before = Math.min(...pack.map((d) => chebyshevDistance(d, state.player)));
    run(state, 6);

    expect(Math.min(...pack.map((d) => chebyshevDistance(d, state.player)))).toBeLessThan(before);
  });

  it('still fights back when attacked alone, pack or no pack', () => {
    // Provocation outranks nerve: cornering one animal has to work, or kicking something would
    // be free whenever it happened to be on its own.
    const { state, region } = arena();
    const [dog] = dogsAt(region, [14, 6]);
    dog!.provokedBy.push('player');

    const before = chebyshevDistance(dog!, state.player);
    run(state, 6);

    expect(chebyshevDistance(dog!, state.player)).toBeLessThan(before);
  });
});

describe('things that stay put', () => {
  it('a mold never takes a step, however long you leave it', () => {
    // Rooted, and it has to be `sessile` rather than merely slow: a very low speed still crawls
    // across the map eventually, and a speed of zero would stop it defending itself too.
    const { state, region } = arena();
    const mold = createMonster(MONSTERS['blackMold']!, 10, 6);
    region.monsters.push(mold);

    run(state, 60);

    expect({ x: mold.x, y: mold.y }).toEqual({ x: 10, y: 6 });
  });

  it('but still strikes whatever comes within reach of it', () => {
    // The point of being a hazard rather than a hunter: you can walk away from it, and you cannot
    // stand next to it for free.
    const { state, region } = arena();
    const mold = createMonster(MONSTERS['blackMold']!, 21, 6); // right beside the player at 20,6
    region.monsters.push(mold);

    const before = state.player.hp;
    run(state, 40);

    expect(state.player.hp).toBeLessThan(before);
    expect({ x: mold.x, y: mold.y }).toEqual({ x: 21, y: 6 });
  });
});
