import { describe, expect, it } from 'vitest';
import { runMonsterTurns } from '../src/ai/AIScheduler';
import { createMonster } from '../src/entities/Monster';
import type { MonsterDef } from '../src/entities/MonsterData';
import { MONSTERS } from '../src/entities/MonsterData';
import { createPlayer } from '../src/entities/Player';
import { createVisibility, markVisible } from '../src/fov/VisibilityState';
import { createGameMap, setTileId } from '../src/world/GameMap';
import { NORMAL_SPEED } from '../src/config/constants';
import type { GameState, RegionState } from '../src/engine/GameState';
import { createRNG } from '../src/utils/RNG';

function arena(width = 30, height = 7): RegionState {
  const map = createGameMap(width, height, 'wall');
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) setTileId(map, x, y, 'floor');
  const visibility = createVisibility(width, height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) markVisible(visibility, x, y);
  return { map, daylight: false, monsters: [], groundItems: [], npcs: [], visibility };
}

function chaseState(speed: number | undefined, startX: number): { state: GameState; hunter: ReturnType<typeof createMonster> } {
  const region = arena();
  const def: MonsterDef = { ...MONSTERS['wakeRaider']!, speed, awarenessRadius: 40 };
  const hunter = createMonster(def, startX, 3);
  region.monsters.push(hunter);

  const state: GameState = {
    player: createPlayer(2, 3),
    regions: { arena: region },
    activeRegionId: 'arena',
    turnCount: 0,
    messageLog: [],
    gameOver: false,
  };
  return { state, hunter };
}

describe('speed', () => {
  it('an ordinary creature closes one tile per player turn', () => {
    const { state, hunter } = chaseState(undefined, 20);
    const rng = createRNG(1);

    runMonsterTurns(state, rng);
    expect(hunter.x).toBe(19);

    runMonsterTurns(state, rng);
    expect(hunter.x).toBe(18);
  });

  it('a creature at double speed closes two tiles while you take one turn', () => {
    const { state, hunter } = chaseState(NORMAL_SPEED * 2, 20);
    const rng = createRNG(1);

    runMonsterTurns(state, rng);

    expect(hunter.x).toBe(18);
  });

  it('carries leftover points over, so a 1.5x creature alternates one step and two', () => {
    const { state, hunter } = chaseState(NORMAL_SPEED * 1.5, 20);
    const rng = createRNG(1);
    const steps: number[] = [];

    let previous = hunter.x;
    for (let turn = 0; turn < 4; turn++) {
      runMonsterTurns(state, rng);
      steps.push(previous - hunter.x);
      previous = hunter.x;
    }

    expect(steps).toEqual([1, 2, 1, 2]);
  });

  it('hits you more than once between your own swings', () => {
    // Stood next to a fast creature: your turn ends, and it gets two attacks before you act again.
    const region = arena();
    const fast: MonsterDef = { ...MONSTERS['wakeRaider']!, speed: NORMAL_SPEED * 2, awarenessRadius: 40, accuracyBonus: 500 };
    region.monsters.push(createMonster(fast, 3, 3));
    const state: GameState = {
      player: createPlayer(2, 3),
      regions: { arena: region },
      activeRegionId: 'arena',
      turnCount: 0,
      messageLog: [],
      gameOver: false,
    };

    runMonsterTurns(state, createRNG(5));

    // Counted across the text, not per line: everything from one player turn shares a line now.
    const blows = state.messageLog.join(' ').match(/hits you|connects|lands a hit|tears into|slams|clips you|grazes you|catches you/g);
    expect(blows).toHaveLength(2);
  });

  it('is bounded, so an absurd speed cannot hang the turn', () => {
    const { state, hunter } = chaseState(NORMAL_SPEED * 1000, 25);
    const rng = createRNG(1);

    runMonsterTurns(state, rng);

    // Capped at MAX_ACTIONS_PER_TURN rather than walking the whole map in one turn.
    expect(25 - hunter.x).toBeLessThanOrEqual(8);
  });

  it('does not act at all below one action worth of points', () => {
    const { state, hunter } = chaseState(NORMAL_SPEED / 2, 20);
    const rng = createRNG(1);

    runMonsterTurns(state, rng);
    expect(hunter.x).toBe(20); // banked half an action, spent nothing

    runMonsterTurns(state, rng);
    expect(hunter.x).toBe(19); // now it can afford to move
  });
});
