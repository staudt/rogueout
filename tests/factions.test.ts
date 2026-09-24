import { describe, expect, it } from 'vitest';
import { areHostile, FACTIONS, standingBetween } from '../src/world/Factions';
import { runMonsterTurns, runNpcTurns } from '../src/ai/AIScheduler';
import { createMonster } from '../src/entities/Monster';
import { MONSTERS } from '../src/entities/MonsterData';
import { createPlayer } from '../src/entities/Player';
import { createNpc } from '../src/entities/Npc';
import { dropLoot } from '../src/combat/Death';
import { ITEMS } from '../src/items/ItemData';
import { chebyshevDistance } from '../src/utils/geometry';
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
    expect(standingBetween('wake', 'restoration')).toBe('hostile');
    expect(standingBetween('restoration', 'wake')).toBe('hostile');
  });

  it('defaults to neutral for pairs nobody has an opinion about', () => {
    // Deliberate: the Restoration and the Reclamation are cold rivals with confusingly similar
    // names, not open enemies — open war would stop them ever sharing a settlement.
    expect(standingBetween('restoration', 'reclamation')).toBe('neutral');
    expect(standingBetween('wake', 'reclamation')).toBe('neutral');
  });

  it('never has a faction fighting itself', () => {
    for (const id of Object.keys(FACTIONS)) {
      expect(standingBetween(id, id)).toBe('friendly');
      expect(areHostile(id, id)).toBe(false);
    }
  });

  it('describes hostility that has nothing to do with the player', () => {
    // The property the whole battle idea rests on.
    expect(areHostile('wake', 'restoration')).toBe(true);
    expect(areHostile('player', 'restoration')).toBe(false);
  });
});

describe('monsters fight each other without the player involved', () => {
  it('a raider closes on a hostile of another faction and attacks it', () => {
    const region = openArena();
    const raider = createMonster(MONSTERS['wakeRaider']!, 5, 4); // faction: raiders
    const guard = createMonster(MONSTERS['restorationTrooper']!, 7, 4);
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
    expect(state.messageLog.join(' ')).toMatch(/raider|trooper/i);
  });

  it('leaves neutral factions alone even when they are adjacent', () => {
    const region = openArena();
    const raider = createMonster(MONSTERS['wakeRaider']!, 5, 4); // raiders
    // A Reclamation scavenger: the Wake needs somebody to sell loot to, so they leave it alone.
    const scavenger = createMonster({ ...MONSTERS['dustRat']!, faction: 'reclamation' }, 6, 4);
    region.monsters.push(raider, scavenger);
    const state = arenaState(region, 18, 7);
    const rng = createRNG(2);

    for (let turn = 0; turn < 10; turn++) {
      state.turnCount = turn;
      runMonsterTurns(state, rng);
    }

    expect(scavenger.hp).toBe(scavenger.maxHp);
    expect(raider.hp).toBe(raider.maxHp);
  });

  it('still comes for the player when the player is the nearest hostile', () => {
    const region = openArena();
    const raider = createMonster(MONSTERS['wakeRaider']!, 4, 4);
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
    const raider = createMonster(MONSTERS['wakeRaider']!, 10, 4);
    const nearGuard = createMonster(MONSTERS['restorationTrooper']!, 11, 4);
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

describe('provocation, fleeing and loot', () => {
  it('a skittish animal runs from you rather than fighting', () => {
    const region = openArena();
    const skink = createMonster(MONSTERS['sandSkink']!, 5, 4);
    region.monsters.push(skink);
    const state = arenaState(region, 3, 4);

    const before = chebyshevDistance(skink, state.player);
    for (let turn = 0; turn < 3; turn++) {
      state.turnCount = turn;
      runMonsterTurns(state, createRNG(turn + 1));
    }

    expect(chebyshevDistance(skink, state.player)).toBeGreaterThan(before);
    expect(state.player.hp).toBe(state.player.maxHp);
  });

  it('but turns on you once you hit it — neutrality has to be earned', () => {
    const region = openArena();
    const skink = createMonster(MONSTERS['sandSkink']!, 4, 4);
    region.monsters.push(skink);
    const state = arenaState(region, 3, 4);

    skink.provokedBy.push('player'); // what TurnManager records when you swing at it

    for (let turn = 0; turn < 4; turn++) {
      state.turnCount = turn;
      runMonsterTurns(state, createRNG(turn + 1));
    }

    expect(chebyshevDistance(skink, state.player)).toBe(1); // it closed instead of running
  });

  it('provoking one animal does not turn its whole species against you', () => {
    const region = openArena();
    const angry = createMonster(MONSTERS['sandSkink']!, 5, 4);
    const calm = createMonster(MONSTERS['sandSkink']!, 5, 6);
    region.monsters.push(angry, calm);
    angry.provokedBy.push('player');

    expect(calm.provokedBy).toEqual([]);
    expect(angry.provokedBy).toEqual(['player']);
  });

  it('people leave their gear behind; animals leave nothing', () => {
    const region = openArena();
    const raider = createMonster(MONSTERS['wakeRaider']!, 5, 4);
    const lizard = createMonster(MONSTERS['duneRunner']!, 8, 4);

    dropLoot(raider, region, () => 0); // every roll succeeds
    const afterRaider = region.groundItems.length;
    dropLoot(lizard, region, () => 0);

    expect(afterRaider).toBeGreaterThan(0);
    expect(region.groundItems.length).toBe(afterRaider); // the lizard added nothing
    for (const ground of region.groundItems) {
      expect(ITEMS[ground.item.defId]).toBeDefined();
      expect([ground.x, ground.y]).toEqual([raider.x, raider.y]);
    }
  });

  it('drops nothing when the rolls go against it', () => {
    const region = openArena();
    const raider = createMonster(MONSTERS['wakeRaider']!, 5, 4);

    dropLoot(raider, region, () => 0.999); // every roll fails

    expect(region.groundItems).toEqual([]);
  });
});

describe('townsfolk', () => {
  it('drift around their patch but never leave it', () => {
    const region = openArena(30, 15);
    region.npcs.push({
      ...createNpc('walker', 'Walker', '@', '#fff', 10, 7, 'hm', undefined, 'vigil'),
      wanderRadius: 3,
    });
    const state = arenaState(region, 28, 13);
    const home = { x: 10, y: 7 };

    const seen = new Set<string>();
    for (let turn = 0; turn < 60; turn++) {
      runNpcTurns(state, createRNG(turn + 1));
      const npc = region.npcs[0]!;
      seen.add(`${npc.x},${npc.y}`);
      expect(chebyshevDistance(npc, home)).toBeLessThanOrEqual(3);
    }

    expect(seen.size).toBeGreaterThan(1); // they actually moved
  });

  it('a shopkeeper stays at the counter', () => {
    const region = openArena();
    region.npcs.push(createNpc('keeper', 'Keeper', '@', '#fff', 6, 4, 'hm', 'reclamationPost', 'reclamation'));
    const state = arenaState(region, 2, 2);

    for (let turn = 0; turn < 20; turn++) runNpcTurns(state, createRNG(turn + 1));

    expect(region.npcs[0]).toMatchObject({ x: 6, y: 4 });
  });
});
