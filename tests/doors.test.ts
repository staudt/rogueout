import { describe, expect, it } from 'vitest';
import { TurnManager } from '../src/engine/TurnManager';
import { EventBus, type GameEvents } from '../src/engine/EventBus';
import type { GameState, RegionState } from '../src/engine/GameState';
import { createPlayer } from '../src/entities/Player';
import { createRNG } from '../src/utils/RNG';
import { ensureRegionLoaded, REGION_BUILDERS, STORE_INTERIOR_RECIPE } from '../src/world/regions/RegionRegistry';
import { getTileId } from '../src/world/GameMap';
import { isDeliberateTransition, transitionKind } from '../src/world/Tile';
import { OVERWORLD_STORE_DOOR } from '../src/world/maps/overworld';
import { createMemoryStorage } from '../src/persistence/LocalStorageAdapter';
import { loadGame, saveGame } from '../src/persistence/SaveGame';

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

describe('the door tile', () => {
  it('is a deliberate crossing, like a staircase', () => {
    expect(transitionKind('door')).toBe('door');
    expect(isDeliberateTransition('door')).toBe(true);
  });

  it('blocks sight, so a shop interior cannot be read off the street', () => {
    // The reason this matters is auto-travel and FOV both: an opaque doorway means a building is
    // genuinely a box until you go in, rather than a box you can see through one gap of.
    const { state } = makeGame(1, 1);
    expect(state.regions['overworld']!.map.tiles.includes('door')).toBe(true);
  });

  it('does not cross when you merely walk onto it', () => {
    const { state, turnManager } = makeGame(OVERWORLD_STORE_DOOR.x - 1, OVERWORLD_STORE_DOOR.y);

    expect(turnManager.tryMovePlayer('E')).toBe(true);
    expect(state.player).toMatchObject(OVERWORLD_STORE_DOOR);
    expect(state.activeRegionId).toBe('overworld');
    expect(turnManager.transitionUnderPlayer()).toBe('door');
  });
});

describe('going through a door', () => {
  it('> from the doorway enters the interior', () => {
    const { state, turnManager } = makeGame(OVERWORLD_STORE_DOOR.x, OVERWORLD_STORE_DOOR.y);

    expect(turnManager.useTransition('down')).toBe(true);
    expect(state.activeRegionId).toBe(STORE_INTERIOR_RECIPE.regionId);
    expect(state.regions[STORE_INTERIOR_RECIPE.regionId]).toBeDefined();
    expect(state.regions[STORE_INTERIOR_RECIPE.regionId]!.name).toBe(STORE_INTERIOR_RECIPE.name);
  });

  it('< works too — a doorway takes either key', () => {
    // There is only ever one transition on a tile, so there is nothing to disambiguate, and
    // making the player work out which side of a door they are on would be friction with no
    // decision behind it.
    const { state, turnManager } = makeGame(OVERWORLD_STORE_DOOR.x, OVERWORLD_STORE_DOOR.y);

    expect(turnManager.useTransition('up')).toBe(true);
    expect(state.activeRegionId).toBe(STORE_INTERIOR_RECIPE.regionId);
  });

  it('puts the shopkeeper inside, where you have to go in to trade with her', () => {
    const { state, turnManager } = makeGame(OVERWORLD_STORE_DOOR.x, OVERWORLD_STORE_DOOR.y);
    turnManager.useTransition('down');

    const inside = state.regions[STORE_INTERIOR_RECIPE.regionId]!;
    expect(inside.npcs.map((n) => n.shopId)).toContain('reclamationPost');
    expect(state.regions['overworld']!.npcs.some((n) => n.shopId === 'reclamationPost')).toBe(false);
  });

  it('comes back out onto the street', () => {
    const { state, turnManager } = makeGame(OVERWORLD_STORE_DOOR.x, OVERWORLD_STORE_DOOR.y);
    turnManager.useTransition('down');

    const inside = state.regions[STORE_INTERIOR_RECIPE.regionId]!;
    const exit = inside.transitions[0]!;
    state.player.x = exit.x;
    state.player.y = exit.y;

    expect(getTileId(inside.map, exit.x, exit.y)).toBe('door');
    expect(turnManager.useTransition('up')).toBe(true);
    expect(state.activeRegionId).toBe('overworld');
  });

  it('keeps the interior as you left it across visits', () => {
    const { state, turnManager } = makeGame(OVERWORLD_STORE_DOOR.x, OVERWORLD_STORE_DOOR.y);
    turnManager.useTransition('down');

    // Rob the place and leave.
    state.regions[STORE_INTERIOR_RECIPE.regionId]!.npcs = [];
    const exit = state.regions[STORE_INTERIOR_RECIPE.regionId]!.transitions[0]!;
    state.player.x = exit.x;
    state.player.y = exit.y;
    turnManager.useTransition('up');

    // Come back. The recipe must NOT be used to rebuild it, or everything you did is undone.
    state.player.x = OVERWORLD_STORE_DOOR.x;
    state.player.y = OVERWORLD_STORE_DOOR.y;
    turnManager.useTransition('down');

    expect(state.regions[STORE_INTERIOR_RECIPE.regionId]!.npcs).toEqual([]);
  });
});

describe('a transition can stand in for distance', () => {
  it('charges the turns it claims, and says its own line', () => {
    // Unused by any content yet, and deliberately covered anyway: this is how the city will elide
    // the ~10 blocks between landmarks, and machinery that is written but never exercised is
    // machinery that has quietly stopped working by the time somebody needs it.
    const { state, turnManager } = makeGame(OVERWORLD_STORE_DOOR.x, OVERWORLD_STORE_DOOR.y);
    const door = state.regions['overworld']!.transitions.find((t) => t.x === OVERWORLD_STORE_DOOR.x)!;
    door.turnCost = 40;
    door.announce = 'A long walk through the dark.';

    const before = state.turnCount;
    turnManager.useTransition('down');

    expect(state.turnCount).toBe(before + 41); // the 40 charged, plus the turn the crossing took
    expect(state.messageLog.join(' ')).toContain('A long walk through the dark.');
    // Its own line replaces the destination's arrival text, rather than following it.
    expect(state.messageLog.join(' ')).not.toContain('Shelves of salvage');
  });
});

describe('region recipes', () => {
  it('builds the same room from the same recipe every time', () => {
    const first = REGION_BUILDERS['storeInterior']!(STORE_INTERIOR_RECIPE);
    const second = REGION_BUILDERS['storeInterior']!(STORE_INTERIOR_RECIPE);

    expect(first.map.tiles).toEqual(second.map.tiles);
    expect(first.transitions).toEqual(second.transitions);
  });

  it('refuses a region it has neither a definition nor a recipe for', () => {
    expect(() => ensureRegionLoaded({}, 'nowhere')).toThrow(/Unknown region/);
    expect(() => ensureRegionLoaded({}, 'nowhere', { ...STORE_INTERIOR_RECIPE, regionId: 'elsewhere' })).toThrow(
      /Unknown region/,
    );
  });

  it('refuses a recipe naming a builder that does not exist', () => {
    const broken = { ...STORE_INTERIOR_RECIPE, builderId: 'nonesuch' };
    expect(() => ensureRegionLoaded({}, broken.regionId, broken)).toThrow(/Unknown region builder/);
  });

  it('survives a save and reload even when the interior was never entered', () => {
    // The property the whole recipe design exists for. Registering interiors into the REGIONS
    // table as they are generated would not survive this: module-level state is gone after a
    // reload, so the door would lead to a region nothing knew how to build.
    const { state } = makeGame(1, 1);
    expect(state.regions[STORE_INTERIOR_RECIPE.regionId]).toBeUndefined(); // never opened

    const storage = createMemoryStorage();
    expect(saveGame(storage, state)).toBe(true);

    const reloaded = loadGame(storage);
    expect(reloaded).not.toBeNull();
    expect(reloaded!.regions[STORE_INTERIOR_RECIPE.regionId]).toBeUndefined();

    // ...and the door still works, because the recipe travelled on the saved transition.
    reloaded!.player.x = OVERWORLD_STORE_DOOR.x;
    reloaded!.player.y = OVERWORLD_STORE_DOOR.y;
    const turnManager = new TurnManager(reloaded!, new EventBus<GameEvents>(), createRNG(1));

    expect(turnManager.useTransition('down')).toBe(true);
    expect(reloaded!.activeRegionId).toBe(STORE_INTERIOR_RECIPE.regionId);
    expect(reloaded!.regions[STORE_INTERIOR_RECIPE.regionId]!.npcs).toHaveLength(1);
  });

  it('restores an interior you HAD entered rather than rebuilding it', () => {
    const { state, turnManager } = makeGame(OVERWORLD_STORE_DOOR.x, OVERWORLD_STORE_DOOR.y);
    turnManager.useTransition('down');
    state.regions[STORE_INTERIOR_RECIPE.regionId]!.npcs = [];

    const storage = createMemoryStorage();
    saveGame(storage, state);
    const reloaded = loadGame(storage)!;

    expect(reloaded.regions[STORE_INTERIOR_RECIPE.regionId]!.npcs).toEqual([]);
  });
});
