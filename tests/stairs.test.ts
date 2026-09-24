import { describe, expect, it } from 'vitest';
import { TurnManager } from '../src/engine/TurnManager';
import { EventBus, type GameEvents } from '../src/engine/EventBus';
import type { GameState, RegionState } from '../src/engine/GameState';
import { createPlayer } from '../src/entities/Player';
import { createRNG } from '../src/utils/RNG';
import { narrateWaiting } from '../src/narrative/Narration';
import { ensureRegionLoaded } from '../src/world/regions/RegionRegistry';
import { isWalkable } from '../src/world/GameMap';
import { OVERWORLD_DUNGEON_ENTRANCE } from '../src/world/maps/overworld';
import { DUNGEON1_EXIT_WEST, DUNGEON1_SPAWN_FROM_WILDERNESS } from '../src/world/maps/dungeonLevel1';

function makeGame(x: number, y: number, regionId = 'overworld') {
  const regions: Record<string, RegionState> = {};
  ensureRegionLoaded(regions, regionId);

  const state: GameState = {
    player: createPlayer(x, y),
    regions,
    activeRegionId: regionId,
    turnCount: 0,
    messageLog: [],
    gameOver: false,
  };
  const turnManager = new TurnManager(state, new EventBus<GameEvents>(), createRNG(1));
  turnManager.recomputeFOV();
  return { state, turnManager };
}

describe('stairways need a deliberate >/<', () => {
  it('walking onto a staircase does not transition — it just stands on it', () => {
    // This is what keeps auto-travel from dropping you into a dungeon because the route happened
    // to cross the entrance.
    const approach = { x: OVERWORLD_DUNGEON_ENTRANCE.x - 1, y: OVERWORLD_DUNGEON_ENTRANCE.y };
    const { state, turnManager } = makeGame(approach.x, approach.y);
    expect(isWalkable(state.regions['overworld']!.map, approach.x, approach.y)).toBe(true);

    expect(turnManager.tryMovePlayer('E')).toBe(true);

    expect(state.activeRegionId).toBe('overworld');
    expect(state.player).toMatchObject(OVERWORLD_DUNGEON_ENTRANCE);
    expect(turnManager.stairwayUnderPlayer()).toBe('down');
    expect(state.messageLog.join(' ')).toMatch(/stairs down/i);
  });

  it('> on the staircase crosses into the dungeon', () => {
    const { state, turnManager } = makeGame(OVERWORLD_DUNGEON_ENTRANCE.x, OVERWORLD_DUNGEON_ENTRANCE.y);

    expect(turnManager.useStairs('down')).toBe(true);

    expect(state.activeRegionId).toBe('dungeon-1');
    expect(state.player).toMatchObject(DUNGEON1_SPAWN_FROM_WILDERNESS);
    expect(state.turnCount).toBe(1);
  });

  it('the wrong stair key costs nothing', () => {
    const { state, turnManager } = makeGame(OVERWORLD_DUNGEON_ENTRANCE.x, OVERWORLD_DUNGEON_ENTRANCE.y);

    expect(turnManager.useStairs('up')).toBe(false);

    expect(state.activeRegionId).toBe('overworld');
    expect(state.turnCount).toBe(0);
    expect(state.messageLog.at(-1)).toContain('no staircase leading up');
  });

  it('> away from any staircase costs nothing', () => {
    const { state, turnManager } = makeGame(5, 15);

    expect(turnManager.useStairs('down')).toBe(false);

    expect(state.turnCount).toBe(0);
    expect(state.messageLog.at(-1)).toContain('no staircase leading down');
  });

  it('non-stairway transitions still fire on the step itself', () => {
    // Walking out of the dungeon's west mouth is an ordinary floor tile — nothing to decide, so
    // it crosses immediately, exactly as before.
    const { state, turnManager } = makeGame(
      DUNGEON1_EXIT_WEST.x + 1,
      DUNGEON1_EXIT_WEST.y,
      'dungeon-1',
    );

    expect(turnManager.tryMovePlayer('W')).toBe(true);

    expect(state.activeRegionId).toBe('overworld');
  });
});

describe('waiting', () => {
  it('consumes a turn and says so', () => {
    const { state, turnManager } = makeGame(5, 15);

    turnManager.wait();

    expect(state.turnCount).toBe(1);
    // Phrasing varies, but deterministically: the seed is the turn the wait happened on.
    expect(state.messageLog.join(' ')).toContain(narrateWaiting(0));
  });
});
