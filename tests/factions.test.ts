import { describe, expect, it } from 'vitest';
import { areHostile, FACTIONS, standingBetween } from '../src/world/Factions';
import { runMonsterTurns } from '../src/ai/AIScheduler';
import { createMonster } from '../src/entities/Monster';
import { MONSTERS } from '../src/entities/MonsterData';
import { createPlayer } from '../src/entities/Player';
import { createVisibility, markVisible } from '../src/fov/VisibilityState';
import { createGameMap, setTileId } from '../src/world/GameMap';
import type { GameState, RegionState } from '../src/engine/GameState';
import type { RNG } from '../src/utils/RNG';
import { createRNG } from '../src/utils/RNG';

function openArena(width = 20, height = 9): RegionState {
  const map = createGameMap(width, height, 'wall');
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) setTileId(map, x, y, 'floor');
  const visibility = createVisibility(width, height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) markVisible(visibility, x, y);
  return { map, daylight: false, monsters: [], groundItems: [], npcs: [], visibility };
}

function arenaState(region: RegionState, playerX = 1, playerY = 1): GameState {
  return {
    player: createPlayer(playerX, playerY),
    regions: { arena: region },
    activeRegionId: 'arena',
    turnCount: 0,
    messageLog: [],
    gameOver: false,
  };
}

describe('standings are between factions, not toward the player', () => {
  it('is symmetric, however the pair is ordered', () => {
    expect(standingBetween('raiders', 'townsfolk')).toBe('hostile');
    expect(standingBetween('townsfolk', 'raiders')).toBe('hostile');
  });

  it('defaults to neutral for pairs nobody has an opinion about', () => {
    expect(standingBetween('raiders', 'vermin')).toBe('neutral');
  });

  it('never has a faction fighting itself', () => {
    for (const id of Object.keys(FACTIONS)) {
      expect(standingBetween(id, id)).toBe('friendly');
      expect(areHostile(id, id)).toBe(false);
    }
  });

  it('describes hostility that has nothing to do with the player', () => {
    // The property the whole battle idea rests on.
    expect(areHostile('raiders', 'townsfolk')).toBe(true);
    expect(areHostile('player', 'townsfolk')).toBe(false);
  });
});

describe('monsters fight each other without the player involved', () => {
  const militia = { ...MONSTERS['goblin']!, id: 'militia', name: 'militia', faction: 'townsfolk' };

  it('a raider closes on a hostile of another faction and attacks it', () => {
    const region = openArena();
    const raider = createMonster(MONSTERS['goblin']!, 5, 4); // faction: raiders
    const guard = createMonster(militia, 7, 4);
    region.monsters.push(raider, guard);
    // Player parked far away and out of everyone's awareness radius.
    const state = arenaState(region, 18, 7);
    const rng: RNG = createRNG(1);

    const before = guard.hp;
    for (let turn = 0; turn < 8; turn++) {
      state.turnCount = turn;
      runMonsterTurns(state, rng);
    }

    expect(guard.hp).toBeLessThan(before);
    expect(state.player.hp).toBe(state.player.maxHp); // never touched
    expect(state.messageLog.join(' ')).toMatch(/goblin|militia/);
  });

  it('leaves neutral factions alone even when they are adjacent', () => {
    const region = openArena();
    const raider = createMonster(MONSTERS['goblin']!, 5, 4); // raiders
    const rat = createMonster(MONSTERS['rat']!, 6, 4); // vermin — neutral to raiders
    region.monsters.push(raider, rat);
    const state = arenaState(region, 18, 7);
    const rng = createRNG(2);

    for (let turn = 0; turn < 10; turn++) {
      state.turnCount = turn;
      runMonsterTurns(state, rng);
    }

    expect(rat.hp).toBe(rat.maxHp);
    expect(raider.hp).toBe(raider.maxHp);
  });

  it('still comes for the player when the player is the nearest hostile', () => {
    const region = openArena();
    const raider = createMonster(MONSTERS['goblin']!, 4, 4);
    region.monsters.push(raider);
    const state = arenaState(region, 6, 4);
    const rng = createRNG(3);

    for (let turn = 0; turn < 6; turn++) {
      state.turnCount = turn;
      runMonsterTurns(state, rng);
    }

    expect(state.player.hp).toBeLessThan(state.player.maxHp);
  });

  it('picks the nearest hostile when it is spoilt for choice', () => {
    const region = openArena();
    const raider = createMonster(MONSTERS['goblin']!, 10, 4);
    const nearGuard = createMonster(militia, 11, 4);
    region.monsters.push(raider, nearGuard);
    const state = arenaState(region, 13, 4); // player is further off than the guard

    const rng = createRNG(4);
    for (let turn = 0; turn < 4; turn++) {
      state.turnCount = turn;
      runMonsterTurns(state, rng);
    }

    expect(nearGuard.hp).toBeLessThan(nearGuard.maxHp);
    expect(state.player.hp).toBe(state.player.maxHp);
  });
});
