import { describe, expect, it } from 'vitest';
import { alertAllies, canRaiseAlarm, raiseAlarm, reactToAttack } from '../src/ai/Actors';
import { runMonsterTurns, runNpcTurns } from '../src/ai/AIScheduler';
import { createMonster } from '../src/entities/Monster';
import { MONSTERS } from '../src/entities/MonsterData';
import { createNpc } from '../src/entities/Npc';
import { createPlayer } from '../src/entities/Player';
import { createVisibility, markVisible } from '../src/fov/VisibilityState';
import { createGameMap, setTileId } from '../src/world/GameMap';
import { chebyshevDistance } from '../src/utils/geometry';
import { createRNG } from '../src/utils/RNG';
import type { GameState, RegionState } from '../src/engine/GameState';

function town(width = 40, height = 20): RegionState {
  const map = createGameMap(width, height, 'wall');
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) setTileId(map, x, y, 'floor');
  const visibility = createVisibility(width, height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) markVisible(visibility, x, y);
  return { map, daylight: false, monsters: [], groundItems: [], npcs: [], visibility };
}

function stateFor(region: RegionState, x = 2, y = 2): GameState {
  return {
    player: createPlayer(x, y),
    regions: { town: region },
    activeRegionId: 'town',
    turnCount: 0,
    messageLog: [],
    gameOver: false,
  };
}

describe('who comes to whose aid', () => {
  it('help extends to allied factions, not just your own colours', () => {
    // Nobody told the Reclamation to defend the Vigil; they're friendly, so they do.
    const region = town();
    const almoner = createNpc('a', 'Sister Adel', '@', '#fff', 10, 5, 'hm', { faction: 'vigil', timid: true });
    const scrapper = createNpc('s', 'Maren', '@', '#fff', 12, 6, 'hm', { faction: 'reclamation' });
    region.npcs.push(almoner, scrapper);

    alertAllies(region, almoner, 'player');

    expect(scrapper.provokedBy).toContain('player');
  });

  it('does not rope in a faction that merely tolerates the victim', () => {
    const region = town();
    const almoner = createNpc('a', 'Sister Adel', '@', '#fff', 10, 5, 'hm', { faction: 'vigil' });
    const trooper = createMonster(MONSTERS['restorationTrooper']!, 12, 6); // neutral toward the Vigil
    region.npcs.push(almoner);
    region.monsters.push(trooper);

    alertAllies(region, almoner, 'player');

    expect(trooper.provokedBy).toEqual([]);
  });
});

describe('a scream and what everyone makes of it', () => {
  it('turns the screamer\'s own side against whoever caused it', () => {
    const region = town();
    const victim = createNpc('v', 'Vance', '@', '#fff', 10, 5, 'hm', { faction: 'restoration' });
    const comrade = createMonster(MONSTERS['restorationTrooper']!, 18, 9);
    region.npcs.push(victim);
    region.monsters.push(comrade);

    raiseAlarm(region, victim, 'restoration', 'player');

    expect(comrade.provokedBy).toContain('player');
  });

  it('sends everyone else to look, without deciding anything for them', () => {
    const region = town();
    const victim = createNpc('v', 'Vance', '@', '#fff', 10, 5, 'hm', { faction: 'restoration' });
    const raider = createMonster(MONSTERS['wakeRaider']!, 16, 8); // no love for the Restoration
    region.npcs.push(victim);
    region.monsters.push(raider);

    raiseAlarm(region, victim, 'restoration', 'player');

    expect(raider.provokedBy).toEqual([]); // it has formed no opinion
    expect(raider.investigating).toEqual({ x: 10, y: 5 }); // but it is coming to look
  });

  it('is ignored by whoever caused it', () => {
    const region = town();
    const victim = createNpc('v', 'Vance', '@', '#fff', 10, 5, 'hm', { faction: 'restoration' });
    const accomplice = createMonster({ ...MONSTERS['wakeRaider']!, faction: 'player' }, 12, 6);
    region.npcs.push(victim);
    region.monsters.push(accomplice);

    raiseAlarm(region, victim, 'restoration', 'player');

    expect(accomplice.investigating ?? null).toBeNull();
  });

  it('carries further than anyone can see, but not forever', () => {
    const region = town(60, 20);
    const victim = createNpc('v', 'Vance', '@', '#fff', 10, 5, 'hm', { faction: 'restoration' });
    const nearEnough = createMonster(MONSTERS['wakeRaider']!, 22, 10);
    const tooFar = createMonster(MONSTERS['wakeRaider']!, 50, 18);
    region.npcs.push(victim);
    region.monsters.push(nearEnough, tooFar);

    raiseAlarm(region, victim, 'restoration', 'player');

    expect(nearEnough.investigating).not.toBeNull();
    expect(tooFar.investigating ?? null).toBeNull();
  });

  it('actually walks them over to have a look', () => {
    const region = town();
    const onlooker = createMonster(MONSTERS['wakeRaider']!, 20, 10);
    region.monsters.push(onlooker);
    const state = stateFor(region, 38, 18);
    onlooker.investigating = { x: 10, y: 5 };

    const before = chebyshevDistance(onlooker, { x: 10, y: 5 });
    for (let turn = 0; turn < 6; turn++) {
      state.turnCount = turn;
      runMonsterTurns(state, createRNG(turn + 1));
    }

    expect(chebyshevDistance(onlooker, { x: 10, y: 5 })).toBeLessThan(before);
  });
});

describe('who screams', () => {
  it('people do; animals do not', () => {
    const person = createNpc('p', 'Someone', '@', '#fff', 5, 5, 'hm', { faction: 'restoration' });
    expect(canRaiseAlarm(person)).toBe(true);
    expect(canRaiseAlarm(createMonster(MONSTERS['dustRat']!, 1, 1))).toBe(false);
    expect(canRaiseAlarm(createMonster(MONSTERS['wakeRaider']!, 1, 1))).toBe(true);
  });

  it('once per incident, not once per blow', () => {
    const region = town();
    const victim = createNpc('v', 'Vance', '@', '#fff', 10, 5, 'hm', { faction: 'restoration' });
    region.npcs.push(victim);
    const state = stateFor(region, 9, 5);

    reactToAttack(state, region, victim, 'player');
    reactToAttack(state, region, victim, 'player');
    reactToAttack(state, region, victim, 'player');

    const shouts = state.messageLog.join(' ').match(/shouts for help/g) ?? [];
    expect(shouts).toHaveLength(1);
  });
});

describe('the timid', () => {
  it('run and never fight, however badly they are treated', () => {
    const region = town();
    const almoner = createNpc('a', 'Sister Adel', '@', '#fff', 6, 5, 'hm', { faction: 'vigil', timid: true });
    region.npcs.push(almoner);
    const state = stateFor(region, 5, 5);
    almoner.provokedBy.push('player');

    const before = chebyshevDistance(almoner, state.player);
    const rng = createRNG(4);
    for (let turn = 0; turn < 6; turn++) {
      state.turnCount = turn;
      runNpcTurns(state, rng);
    }

    expect(chebyshevDistance(almoner, state.player)).toBeGreaterThan(before);
    expect(state.player.hp).toBe(state.player.maxHp);
  });

  it('but their scream is what brings someone who will', () => {
    const region = town();
    const almoner = createNpc('a', 'Sister Adel', '@', '#fff', 10, 5, 'hm', { faction: 'vigil', timid: true });
    const scrapper = createNpc('s', 'Maren', '@', '#fff', 16, 9, 'hm', { faction: 'reclamation', weapon: 'pipeWrench' });
    region.npcs.push(almoner, scrapper);
    const state = stateFor(region, 9, 5);

    reactToAttack(state, region, almoner, 'player');

    expect(scrapper.provokedBy).toContain('player');
    expect(state.messageLog.join(' ')).toMatch(/shouts for help/);
  });
});

describe('armed townsfolk', () => {
  it('fight with what they carry', () => {
    const unarmed = createNpc('u', 'Civilian', '@', '#fff', 1, 1, 'hm', {});
    const armed = createNpc('a', 'Corporal', '@', '#fff', 1, 1, 'hm', { weapon: 'machete' });

    expect(unarmed.damage[0]!.type).toBe('bludgeon');
    expect(armed.damage[0]!.type).toBe('cut');
    expect(armed.damage[0]!.max).toBeGreaterThan(unarmed.damage[0]!.max);
  });
});
