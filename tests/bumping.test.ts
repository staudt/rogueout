import { describe, expect, it } from 'vitest';
import { TurnManager } from '../src/engine/TurnManager';
import { EventBus, type GameEvents } from '../src/engine/EventBus';
import type { GameState, RegionState } from '../src/engine/GameState';
import { createPlayer } from '../src/entities/Player';
import { createMonster } from '../src/entities/Monster';
import { MONSTERS } from '../src/entities/MonsterData';
import { createNpc } from '../src/entities/Npc';
import { createRNG } from '../src/utils/RNG';
import { createGameMap } from '../src/world/GameMap';
import { createVisibility } from '../src/fov/VisibilityState';
import { wantsPlayerDead } from '../src/ai/Actors';
import { runNpcTurns } from '../src/ai/AIScheduler';

/**
 * What walking into somebody does.
 *
 * The rule has to be the same whoever they are, because the player cannot tell from the keyboard
 * which case they are in: **anything that already wants you dead gets hit, anything that will talk
 * gets talked to, and anything else gets asked about.** Bumping used to attack every creature
 * outright, so a misstep beside an animal with no quarrel with you started a fight you never
 * chose — while the identical misstep beside a person opened a conversation.
 */
function arena() {
  const map = createGameMap(20, 10, 'floor');
  const region: RegionState = {
    name: 'test arena',
    transitions: [],
    map,
    daylight: false,
    monsters: [],
    groundItems: [],
    npcs: [],
    visibility: createVisibility(20, 10),
  };
  const state: GameState = {
    player: createPlayer(5, 5),
    regions: { arena: region },
    activeRegionId: 'arena',
    turnCount: 0,
    messageLog: [],
    gameOver: false,
  };

  const events = new EventBus<GameEvents>();
  const prompted: string[] = [];
  const talkedTo: string[] = [];
  events.on('attack-prompted', ({ target }) => prompted.push(target.id));
  events.on('npc-interacted', ({ npc }) => talkedTo.push(npc.id));

  const turnManager = new TurnManager(state, events, createRNG(1));
  turnManager.recomputeFOV();
  return { state, region, turnManager, prompted, talkedTo };
}

describe('walking into something', () => {
  it('hits anything that already wants you dead, with no questions', () => {
    const { state, region, turnManager, prompted } = arena();
    const rat = createMonster(MONSTERS['alleyRat']!, 6, 5); // predators: hostile to the player
    region.monsters.push(rat);
    expect(wantsPlayerDead(rat, state.player.faction)).toBe(true);

    expect(turnManager.tryMovePlayer('E')).toBe(true);
    expect(rat.hp).toBeLessThanOrEqual(rat.maxHp);
    expect(prompted).toEqual([]);
    expect(state.turnCount).toBe(1);
  });

  it('asks before starting a fight with an animal that has no quarrel with you', () => {
    const { state, region, turnManager, prompted } = arena();
    const cat = createMonster(MONSTERS['feralCat']!, 6, 5); // wildlife: hostile to nobody
    region.monsters.push(cat);
    expect(wantsPlayerDead(cat, state.player.faction)).toBe(false);

    const moved = turnManager.tryMovePlayer('E');

    expect(prompted).toEqual([cat.id]);
    expect(cat.hp).toBe(cat.maxHp); // not hit
    expect(cat.provokedBy).toEqual([]); // and so not provoked either
    expect(moved).toBe(false);
    expect(state.turnCount).toBe(0); // asking is free, like bumping a wall
    expect(state.player).toMatchObject({ x: 5, y: 5 }); // and you stay put
  });

  it('talks to someone who will talk, rather than asking whether to hit them', () => {
    const { region, turnManager, prompted, talkedTo } = arena();
    const maren = createNpc('shopkeeper', 'Maren', '@', '#fff', 6, 5, 'Reclamation post.', {
      faction: 'reclamation',
    });
    region.npcs.push(maren);

    expect(turnManager.tryMovePlayer('E')).toBe(false);
    expect(talkedTo).toEqual([maren.id]);
    expect(prompted).toEqual([]); // chat wins outright where there is chat to be had
  });

  it('stops asking once it is hostile, so a fight does not need confirming every swing', () => {
    const { state, region, turnManager, prompted } = arena();
    const cat = createMonster(MONSTERS['feralCat']!, 6, 5);
    region.monsters.push(cat);

    // The player has taken the first swing; now it wants them dead.
    cat.provokedBy.push(state.player.faction);

    expect(turnManager.tryMovePlayer('E')).toBe(true);
    expect(prompted).toEqual([]);
  });

  it('attacks a person you have already fallen out with instead of chatting', () => {
    const { state, region, turnManager, prompted, talkedTo } = arena();
    const adel = createNpc('almoner', 'Sister Adel', '@', '#fff', 6, 5, 'Sit a while.', {
      faction: 'vigil',
    });
    adel.provokedBy.push(state.player.faction);
    region.npcs.push(adel);

    expect(turnManager.tryMovePlayer('E')).toBe(true);
    expect(talkedTo).toEqual([]);
    expect(prompted).toEqual([]);
  });

  it('leaves the ring and the bump agreeing about who is coming for you', () => {
    // Both read `wantsPlayerDead`, so a creature drawn without a red ring is exactly a creature
    // that walking into will ask about. They disagreed before, which is what made this a bug
    // rather than a quirk: no ring said "harmless", and bumping it swung anyway.
    const { state } = arena();
    const cat = createMonster(MONSTERS['feralCat']!, 1, 1);
    const rat = createMonster(MONSTERS['alleyRat']!, 2, 2);

    expect(wantsPlayerDead(cat, state.player.faction)).toBe(false);
    expect(wantsPlayerDead(rat, state.player.faction)).toBe(true);

    cat.provokedBy.push(state.player.faction);
    expect(wantsPlayerDead(cat, state.player.faction)).toBe(true);
  });
});

describe('townspeople going about their day', () => {
  it('holds still when you are standing next to them, so you can actually talk', () => {
    // They used to drift every turn, which made walking up to somebody a chase you could not win:
    // each step toward them was a step they took away, at exactly your speed, forever.
    const map = createGameMap(30, 20, 'floor');
    const region: RegionState = {
      name: 'town',
      transitions: [],
      map,
      daylight: false,
      monsters: [],
      groundItems: [],
      npcs: [],
      visibility: createVisibility(30, 20),
    };
    const maren = createNpc('shopkeeper', 'Maren', '@', '#fff', 11, 10, 'Hello.', {
      faction: 'reclamation',
      wanderRadius: 6,
    });
    region.npcs.push(maren);

    const state: GameState = {
      player: createPlayer(10, 10), // adjacent
      regions: { town: region },
      activeRegionId: 'town',
      turnCount: 0,
      messageLog: [],
      gameOver: false,
    };

    const rng = createRNG(3);
    for (let i = 0; i < 40; i++) runNpcTurns(state, rng);

    expect({ x: maren.x, y: maren.y }).toEqual({ x: 11, y: 10 });
  });

  it('drifts when left alone, but nothing like every turn', () => {
    const map = createGameMap(30, 20, 'floor');
    const region: RegionState = {
      name: 'town',
      transitions: [],
      map,
      daylight: false,
      monsters: [],
      groundItems: [],
      npcs: [],
      visibility: createVisibility(30, 20),
    };
    const cass = createNpc('waterbearer', 'Cass', '@', '#fff', 20, 10, 'Water.', {
      faction: 'vigil',
      wanderRadius: 6,
    });
    region.npcs.push(cass);

    const state: GameState = {
      player: createPlayer(2, 2), // far away, so the hold-still rule isn't what's being measured
      regions: { town: region },
      activeRegionId: 'town',
      turnCount: 0,
      messageLog: [],
      gameOver: false,
    };

    const rng = createRNG(5);
    let moved = 0;
    let previous = { x: cass.x, y: cass.y };
    for (let i = 0; i < 100; i++) {
      runNpcTurns(state, rng);
      if (cass.x !== previous.x || cass.y !== previous.y) moved += 1;
      previous = { x: cass.x, y: cass.y };
    }

    expect(moved).toBeGreaterThan(0); // still alive, not a statue
    expect(moved).toBeLessThan(45); // but not stepping every turn the way they used to
  });
});
