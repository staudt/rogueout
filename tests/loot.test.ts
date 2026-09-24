import { describe, expect, it } from 'vitest';
import { dropLoot } from '../src/combat/Death';
import { nearestLoot, scavengeHere, scavenges } from '../src/ai/Scavenging';
import { runMonsterTurns } from '../src/ai/AIScheduler';
import { createItem } from '../src/items/Item';
import { ensureRegionLoaded } from '../src/world/regions/RegionRegistry';
import { areHostile } from '../src/world/Factions';
import { isWalkable } from '../src/world/GameMap';
import { createRNG } from '../src/utils/RNG';
import { callOutEnemy, noticeCorpses } from '../src/ai/Actors';
import { createMonster } from '../src/entities/Monster';
import { MONSTERS } from '../src/entities/MonsterData';
import { createNpc } from '../src/entities/Npc';
import { createPlayer } from '../src/entities/Player';
import { ITEMS } from '../src/items/ItemData';
import { createVisibility, markVisible } from '../src/fov/VisibilityState';
import { createGameMap, setTileId } from '../src/world/GameMap';
import { FACTION_LOOT } from '../src/world/LootTables';
import type { GameState, RegionState } from '../src/engine/GameState';

function region(): RegionState {
  const map = createGameMap(30, 14, 'wall');
  for (let y = 1; y < 13; y++) for (let x = 1; x < 29; x++) setTileId(map, x, y, 'floor');
  const visibility = createVisibility(30, 14);
  for (let y = 0; y < 14; y++) for (let x = 0; x < 30; x++) markVisible(visibility, x, y);
  return { map, daylight: false, monsters: [], groundItems: [], npcs: [], visibility };
}

function stateFor(r: RegionState): GameState {
  return {
    player: createPlayer(2, 2),
    regions: { r },
    activeRegionId: 'r',
    turnCount: 0,
    messageLog: [],
    gameOver: false,
  };
}

const always = () => 0;
const never = () => 0.999;
const dropped = (r: RegionState) => r.groundItems.map((g) => g.item.defId);

describe('what a body leaves', () => {
  it('drops the gear they were visibly using, without a roll', () => {
    // Being killed by someone holding a machete and finding no machete is the kind of small
    // dishonesty that makes a world feel like a slot machine.
    const r = region();
    const trooper = createNpc('t', 'Vance', '@', '#fff', 5, 5, 'hm', {
      faction: 'restoration',
      weapon: 'machete',
      armor: 'paddedVest',
    });

    dropLoot(trooper, r, never); // every chance roll fails

    expect(dropped(r)).toEqual(expect.arrayContaining(['machete', 'paddedVest']));
  });

  it('drops what their people carry, and it differs by faction', () => {
    const restoration = region();
    const wake = region();
    dropLoot(createNpc('a', 'A', '@', '#fff', 5, 5, 'hm', { faction: 'restoration' }), restoration, always);
    dropLoot(createNpc('b', 'B', '@', '#fff', 5, 5, 'hm', { faction: 'wake' }), wake, always);

    const restorationKit = new Set(dropped(restoration));
    const wakeKit = new Set(dropped(wake));

    expect(restorationKit).not.toEqual(wakeKit);
    // The militia issues armour; the Wake improvise.
    expect(restorationKit.has('paddedVest')).toBe(true);
    expect(wakeKit.has('paddedVest')).toBe(false);
  });

  it('every loot entry names a real item', () => {
    for (const [faction, table] of Object.entries(FACTION_LOOT)) {
      for (const entry of table ?? []) {
        expect(ITEMS[entry.defId], `${faction} drops ${entry.defId}`).toBeDefined();
      }
    }
  });

  it('drops caps in stacks rather than one at a time', () => {
    const r = region();
    dropLoot(createNpc('m', 'Maren', '@', '#fff', 5, 5, 'hm', { faction: 'reclamation' }), r, always);

    const caps = r.groundItems.find((g) => g.item.defId === 'caps');
    expect(caps).toBeDefined();
    expect(caps!.item.quantity).toBeGreaterThan(1);
  });

  it('leaves a body, tagged with who it was and whose fault', () => {
    const r = region();
    const victim = createNpc('v', 'Corporal Vance', '@', '#fff', 5, 5, 'hm', { faction: 'restoration' });

    dropLoot(victim, r, always, 'player');

    const corpse = r.groundItems.find((g) => g.item.corpse);
    expect(corpse!.item.corpse).toMatchObject({ faction: 'restoration', killedBy: 'player' });
    expect(corpse!.item.corpse!.name).toContain('Vance');
  });

  it('leaves no body when nobody killed them', () => {
    const r = region();
    dropLoot(createNpc('v', 'V', '@', '#fff', 5, 5, 'hm', {}), r, always);
    expect(r.groundItems.some((g) => g.item.corpse)).toBe(false);
  });
});

describe('finding a body', () => {
  it('turns their people against whoever did it, even with nobody watching at the time', () => {
    const r = region();
    const victim = createNpc('v', 'Vance', '@', '#fff', 5, 5, 'hm', { faction: 'restoration' });
    dropLoot(victim, r, never, 'player');
    // Force the corpse to exist regardless of the chance roll.
    if (!r.groundItems.some((g) => g.item.corpse)) {
      dropLoot(victim, r, always, 'player');
    }

    const comrade = createMonster(MONSTERS['restorationTrooper']!, 6, 5);
    r.monsters.push(comrade);

    expect(noticeCorpses(stateFor(r), r, comrade)).toBe(true);
    expect(comrade.provokedBy).toContain('player');
  });

  it('is not moved by the body of someone they were at war with', () => {
    const r = region();
    const raider = createNpc('v', 'Raider', '@', '#fff', 5, 5, 'hm', { faction: 'wake' });
    dropLoot(raider, r, always, 'player');

    const trooper = createMonster(MONSTERS['restorationTrooper']!, 6, 5);
    r.monsters.push(trooper);

    expect(noticeCorpses(stateFor(r), r, trooper)).toBe(false);
    expect(trooper.provokedBy).toEqual([]);
  });

  it('has to be close enough to recognise', () => {
    const r = region();
    const victim = createNpc('v', 'Vance', '@', '#fff', 5, 5, 'hm', { faction: 'restoration' });
    dropLoot(victim, r, always, 'player');

    const distant = createMonster(MONSTERS['restorationTrooper']!, 20, 11);
    r.monsters.push(distant);

    expect(noticeCorpses(stateFor(r), r, distant)).toBe(false);
  });
});

describe('calling out an enemy', () => {
  it('brings their own side running', () => {
    const r = region();
    const spotter = createMonster(MONSTERS['restorationTrooper']!, 10, 6);
    const comrade = createMonster(MONSTERS['restorationTrooper']!, 16, 9);
    r.monsters.push(spotter, comrade);

    callOutEnemy(stateFor(r), r, spotter, 'wake');

    expect(comrade.investigating).not.toBeNull();
    expect(spotter.calledOut).toBe(true);
  });

  it('is said once, not every turn of a standoff', () => {
    const r = region();
    const spotter = createMonster(MONSTERS['restorationTrooper']!, 10, 6);
    r.monsters.push(spotter);
    const state = stateFor(r);

    callOutEnemy(state, r, spotter, 'wake');
    callOutEnemy(state, r, spotter, 'wake');
    callOutEnemy(state, r, spotter, 'wake');

    expect(state.messageLog.join(' ').match(/shouts a warning/g)).toHaveLength(1);
  });

  it('animals do not shout', () => {
    const r = region();
    const lizard = createMonster(MONSTERS['duneRunner']!, 10, 6);
    r.monsters.push(lizard);
    const state = stateFor(r);

    callOutEnemy(state, r, lizard, 'player');

    expect(lizard.calledOut).toBeFalsy();
    expect(state.messageLog.join(' ')).not.toMatch(/shouts/);
  });
});

describe('scavengers', () => {
  it('take what is underfoot, and it costs them the turn', () => {
    const r = region();
    const raider = createMonster(MONSTERS['wakeRaider']!, 5, 5);
    r.monsters.push(raider);
    r.groundItems.push({ item: createItem('machete'), x: 5, y: 5 });

    expect(scavengeHere(stateFor(r), r, raider)).toBe(true);
    expect(r.groundItems).toHaveLength(0);
    expect(raider.carried?.map((i) => i.defId)).toEqual(['machete']);
  });

  it('use a find when it beats what they are swinging', () => {
    const r = region();
    const raider = createMonster(MONSTERS['wakeRaider']!, 5, 5); // cut 2-4
    r.monsters.push(raider);
    r.groundItems.push({ item: createItem('pipeWrench'), x: 5, y: 5 }); // bludgeon 2-6

    scavengeHere(stateFor(r), r, raider);

    expect(raider.damage[0]!.type).toBe('bludgeon');
  });

  it('but not a worse one', () => {
    const r = region();
    const raider = createMonster(MONSTERS['wakeRaider']!, 5, 5);
    r.monsters.push(raider);
    r.groundItems.push({ item: createItem('dart'), x: 5, y: 5 }); // pierce 1-2

    scavengeHere(stateFor(r), r, raider);

    expect(raider.damage[0]!.type).toBe('cut'); // kept its blade
    expect(raider.carried?.map((i) => i.defId)).toEqual(['dart']); // took it anyway
  });

  it('leave bodies where they lie', () => {
    const r = region();
    const raider = createMonster(MONSTERS['wakeRaider']!, 5, 5);
    r.monsters.push(raider);
    const corpse = createItem('corpse');
    corpse.corpse = { name: 'someone', faction: 'settlers', killedBy: 'wake' };
    r.groundItems.push({ item: corpse, x: 5, y: 5 });

    expect(scavengeHere(stateFor(r), r, raider)).toBe(false);
    expect(r.groundItems).toHaveLength(1);
  });

  it('give everything back when killed — a raider is a moving pile of loot', () => {
    const r = region();
    const raider = createMonster(MONSTERS['wakeRaider']!, 5, 5);
    r.monsters.push(raider);
    for (const defId of ['machete', 'paddedVest', 'medPack']) {
      r.groundItems.push({ item: createItem(defId), x: 5, y: 5 });
      scavengeHere(stateFor(r), r, raider);
    }
    expect(r.groundItems).toHaveLength(0);

    dropLoot(raider, r, never);

    expect(dropped(r)).toEqual(expect.arrayContaining(['machete', 'paddedVest', 'medPack']));
    expect(raider.carried).toEqual([]);
  });

  it('will walk to something nearby, but not across the map for it', () => {
    const r = region();
    const raider = createMonster(MONSTERS['wakeRaider']!, 5, 5);
    r.groundItems.push({ item: createItem('machete'), x: 9, y: 7 });

    expect(nearestLoot(r, raider, 8)).toEqual({ x: 9, y: 7 });
    expect(nearestLoot(r, raider, 2)).toBeNull();
  });

  it('only some things scavenge', () => {
    expect(scavenges(createMonster(MONSTERS['wakeRaider']!, 1, 1))).toBe(true);
    expect(scavenges(createMonster(MONSTERS['duneRunner']!, 1, 1))).toBe(false);
  });
});

describe('patrols', () => {
  it('the overworld spawns two hostile bands on the same road', () => {
    const regions: Record<string, RegionState> = {};
    const overworld = ensureRegionLoaded(regions, 'overworld');

    const wake = overworld.monsters.filter((m) => m.defId === 'wakeRaider');
    const restoration = overworld.monsters.filter((m) => m.defId === 'restorationTrooper');

    expect(wake.length).toBeGreaterThanOrEqual(3);
    expect(restoration.length).toBeGreaterThanOrEqual(3);
    expect(areHostile('wake', 'restoration')).toBe(true);
  });

  it('puts them on the road, which is what makes them meet', () => {
    const regions: Record<string, RegionState> = {};
    const overworld = ensureRegionLoaded(regions, 'overworld');

    expect(overworld.patrolRoute?.length).toBeGreaterThan(3);
    const patrollers = overworld.monsters.filter((m) => m.patrolIndex !== undefined);
    expect(patrollers.length).toBeGreaterThanOrEqual(6);
    for (const patroller of patrollers) {
      expect(isWalkable(overworld.map, patroller.x, patroller.y)).toBe(true);
    }

    // Ruin guards are raiders too, and must stay at their ruin rather than wander off up the road.
    const guards = overworld.monsters.filter((m) => m.defId === 'wakeRaider' && m.patrolIndex === undefined);
    expect(guards.every((g) => g.patrolIndex === undefined)).toBe(true);
  });

  it('walks the route, rather than milling about', () => {
    const regions: Record<string, RegionState> = {};
    const overworld = ensureRegionLoaded(regions, 'overworld');
    const state: GameState = {
      player: createPlayer(2, 2),
      regions: { overworld },
      activeRegionId: 'overworld',
      turnCount: 0,
      messageLog: [],
      gameOver: false,
    };

    const band = overworld.monsters.filter((m) => m.defId === 'wakeRaider');
    const start = band.map((m) => `${m.x},${m.y}`);

    for (let turn = 0; turn < 12; turn++) {
      state.turnCount = turn;
      runMonsterTurns(state, createRNG(turn + 1));
    }

    const moved = band.filter((m, i) => `${m.x},${m.y}` !== start[i]).length;
    expect(moved).toBeGreaterThan(0);
  });
});
