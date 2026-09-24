import { beforeEach, describe, expect, it } from 'vitest';
import { clearSave, hasSave, loadGame, saveGame } from '../src/persistence/SaveGame';
import { createLocalStorageAdapter, createMemoryStorage, SAVE_KEY } from '../src/persistence/LocalStorageAdapter';
import { migrate, SAVE_SCHEMA_VERSION, toSaveData } from '../src/persistence/SaveSchema';
import type { GameState, RegionState } from '../src/engine/GameState';
import { addMessage } from '../src/engine/GameState';
import { TurnManager } from '../src/engine/TurnManager';
import { EventBus, type GameEvents } from '../src/engine/EventBus';
import { createPlayer } from '../src/entities/Player';
import { createMonster } from '../src/entities/Monster';
import { MONSTERS } from '../src/entities/MonsterData';
import { createItem } from '../src/items/Item';
import { createRNG } from '../src/utils/RNG';
import { ensureRegionLoaded } from '../src/world/regions/RegionRegistry';
import { isExplored } from '../src/fov/VisibilityState';
import { OVERWORLD_SPAWN } from '../src/world/maps/overworld';

function makeRun(): { state: GameState; turnManager: TurnManager } {
  const regions: Record<string, RegionState> = {};
  ensureRegionLoaded(regions, 'overworld');

  const state: GameState = {
    player: createPlayer(OVERWORLD_SPAWN.x, OVERWORLD_SPAWN.y),
    regions,
    activeRegionId: 'overworld',
    turnCount: 0,
    messageLog: [],
    gameOver: false,
  };
  const turnManager = new TurnManager(state, new EventBus<GameEvents>(), createRNG(7));
  turnManager.recomputeFOV();
  return { state, turnManager };
}

describe('save/load round trip', () => {
  it('restores a run exactly where it was left', () => {
    const storage = createMemoryStorage();
    const { state, turnManager } = makeRun();

    turnManager.tryMovePlayer('E');
    turnManager.tryMovePlayer('E');
    state.player.caps = 42;
    state.player.hp = 17;
    state.player.inventory.push(createItem('machete'));
    addMessage(state, 'You do something memorable.');

    expect(saveGame(storage, state)).toBe(true);
    const loaded = loadGame(storage);

    expect(loaded).not.toBeNull();
    expect(loaded!.player.x).toBe(state.player.x);
    expect(loaded!.player.y).toBe(state.player.y);
    expect(loaded!.player.hp).toBe(17);
    expect(loaded!.player.caps).toBe(42);
    expect(loaded!.player.inventory.map((i) => i.defId)).toEqual(['machete']);
    expect(loaded!.turnCount).toBe(state.turnCount);
    expect(loaded!.activeRegionId).toBe('overworld');
    expect(loaded!.messageLog).toContain('You do something memorable.');
    expect(loaded!.gameOver).toBe(false);
  });

  it('remembers the map, what was explored, and where everything stood', () => {
    const storage = createMemoryStorage();
    const { state, turnManager } = makeRun();
    turnManager.tryMovePlayer('E');

    const before = state.regions['overworld']!;
    const raider = MONSTERS['wakeRaider']!;
    before.monsters.push(createMonster(raider, 30, 12));

    saveGame(storage, state);
    const after = loadGame(storage)!.regions['overworld']!;

    expect(after.map.tiles).toEqual(before.map.tiles);
    // Fog of war survives exactly: you don't re-explore ground you already walked, and ground
    // you never saw stays dark. (Compared wholesale rather than by sample tile, since under
    // daylight sight a single far-off coordinate may well be legitimately visible.)
    expect(isExplored(after.visibility, state.player.x, state.player.y)).toBe(true);
    expect(after.visibility.explored).toEqual(before.visibility.explored);
    expect(after.visibility.explored.some((seen) => !seen)).toBe(true); // something is still unseen
    expect(after.monsters.map((m) => [m.defId, m.x, m.y])).toContainEqual(['wakeRaider', 30, 12]);
    expect(after.groundItems.map((g) => g.item.defId)).toEqual(before.groundItems.map((g) => g.item.defId));
    expect(after.npcs.map((n) => n.id)).toEqual(before.npcs.map((n) => n.id));
  });

  it('keeps every visited region, not just the one you are standing in', () => {
    const storage = createMemoryStorage();
    const { state } = makeRun();
    ensureRegionLoaded(state.regions, 'dungeon-1');
    state.regions['dungeon-1']!.monsters = [];

    saveGame(storage, state);
    const loaded = loadGame(storage)!;

    expect(Object.keys(loaded.regions).sort()).toEqual(['dungeon-1', 'overworld']);
    // A cleared dungeon stays cleared.
    expect(loaded.regions['dungeon-1']!.monsters).toEqual([]);
  });

  it('does not hand a restored id to a newly created item or monster', () => {
    // The instance-id counters are module state that resets on reload; without reserving, a new
    // item could collide with a loaded one and inventory lookups (by id) would confuse the two.
    const storage = createMemoryStorage();
    const { state } = makeRun();
    for (let i = 0; i < 5; i++) state.player.inventory.push(createItem('medPack'));
    state.regions['overworld']!.monsters.push(createMonster(MONSTERS['dustRat']!, 25, 10));

    saveGame(storage, state);
    const loaded = loadGame(storage)!;

    const loadedItemIds = new Set(loaded.player.inventory.map((i) => i.id));
    expect(loadedItemIds.has(createItem('machete').id)).toBe(false);

    const loadedMonsterIds = new Set(loaded.regions['overworld']!.monsters.map((m) => m.id));
    expect(loadedMonsterIds.has(createMonster(MONSTERS['dustRat']!, 1, 1).id)).toBe(false);
  });
});

describe('permadeath', () => {
  it('refuses to save a dead character', () => {
    const storage = createMemoryStorage();
    const { state } = makeRun();
    saveGame(storage, state);
    expect(hasSave(storage)).toBe(true);

    state.gameOver = true;
    state.player.hp = 0;

    expect(saveGame(storage, state)).toBe(false);
    // The pre-death save is still there — erasing it is Game's job, on the turn death happens.
    expect(loadGame(storage)!.player.hp).toBeGreaterThan(0);
  });

  it('has nothing to continue once the save is cleared', () => {
    const storage = createMemoryStorage();
    const { state } = makeRun();
    saveGame(storage, state);

    clearSave(storage);

    expect(hasSave(storage)).toBe(false);
    expect(loadGame(storage)).toBeNull();
  });
});

describe('malformed saves fall back to New Game', () => {
  const { state } = makeRun();
  const good = JSON.stringify(toSaveData(state));

  const corruptions: Array<[name: string, raw: string | null]> = [
    ['no save at all', null],
    ['empty string', ''],
    ['not JSON', '{oh no'],
    ['JSON but not an object', '"just a string"'],
    ['an array', '[]'],
    ['a future schema version', good.replace(`"schemaVersion":${SAVE_SCHEMA_VERSION}`, '"schemaVersion":99')],
    ['no schema version', good.replace(`"schemaVersion":${SAVE_SCHEMA_VERSION},`, '')],
    ['missing player', JSON.stringify({ ...JSON.parse(good), player: undefined })],
    ['player without coordinates', JSON.stringify({ ...JSON.parse(good), player: { hp: 5 } })],
    ['a dead player', JSON.stringify({ ...JSON.parse(good), player: { ...state.player, hp: 0 } })],
    ['missing regions', JSON.stringify({ ...JSON.parse(good), regions: undefined })],
    ['an active region that is not in regions', JSON.stringify({ ...JSON.parse(good), activeRegionId: 'atlantis' })],
    ['a truncated tile grid', truncateTiles(good)],
  ];

  for (const [name, raw] of corruptions) {
    it(`rejects ${name}`, () => {
      expect(migrate(raw)).toBeNull();
      expect(loadGame(createMemoryStorage(raw))).toBeNull();
      expect(hasSave(createMemoryStorage(raw))).toBe(false);
    });
  }

  it('accepts the save it just wrote', () => {
    expect(migrate(good)).not.toBeNull();
  });

  function truncateTiles(raw: string): string {
    const parsed = JSON.parse(raw);
    parsed.regions['overworld'].map.tiles = parsed.regions['overworld'].map.tiles.slice(0, 10);
    return JSON.stringify(parsed);
  }
});

describe('the rename from roguelite to rogueout', () => {
  const LEGACY_KEY = 'roguelite:save';

  beforeEach(() => {
    window.localStorage.clear();
  });

  it('picks up a run saved under the old key', () => {
    // Losing someone's in-progress run to a cosmetic rename would be exactly the failure the
    // permadeath save exists to prevent.
    const { state } = makeRun();
    state.player.caps = 99;
    window.localStorage.setItem(LEGACY_KEY, JSON.stringify(toSaveData(state)));

    const storage = createLocalStorageAdapter();

    expect(hasSave(storage)).toBe(true);
    expect(loadGame(storage)!.player.caps).toBe(99);
  });

  it('moves the run onto the new key on the next save, and leaves the old one behind', () => {
    const { state } = makeRun();
    window.localStorage.setItem(LEGACY_KEY, JSON.stringify(toSaveData(state)));
    const storage = createLocalStorageAdapter();

    saveGame(storage, loadGame(storage)!);

    expect(window.localStorage.getItem(SAVE_KEY)).not.toBeNull();
    expect(window.localStorage.getItem(LEGACY_KEY)).toBeNull();
  });

  it('erases both keys on death, so an old save cannot resurrect a dead run', () => {
    const { state } = makeRun();
    window.localStorage.setItem(LEGACY_KEY, JSON.stringify(toSaveData(state)));
    const storage = createLocalStorageAdapter();
    saveGame(storage, state);

    clearSave(storage);

    expect(hasSave(storage)).toBe(false);
    expect(window.localStorage.getItem(LEGACY_KEY)).toBeNull();
  });
});

describe('storage failures', () => {
  it('reports a failed write instead of throwing', () => {
    const { state } = makeRun();
    const storage = {
      read: () => null,
      write: () => {
        throw new Error('QuotaExceededError');
      },
      clear: () => {},
    };

    expect(() => saveGame(storage, state)).not.toThrow();
    expect(saveGame(storage, state)).toBe(false);
  });
});
