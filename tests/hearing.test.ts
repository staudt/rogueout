import { describe, expect, it } from 'vitest';
import { hearsFighting, hearsShout, soundDistance, withinEarshot } from '../src/ai/Hearing';
import { FIGHT_NOISE_RADIUS, SHOUT_RADIUS } from '../src/config/constants';
import { computeSpotRadius } from '../src/combat/CombatFormulas';
import { raiseAlarm } from '../src/ai/Actors';
import { createMonster } from '../src/entities/Monster';
import { MONSTERS } from '../src/entities/MonsterData';
import { createNpc } from '../src/entities/Npc';
import { createVisibility } from '../src/fov/VisibilityState';
import { createGameMap } from '../src/world/GameMap';
import type { RegionState } from '../src/engine/GameState';

describe('sound is radial, not square', () => {
  it('carries the same distance in every direction', () => {
    // Everything else measures in Chebyshev steps, because that's how movement works. Applying
    // that to sound made the audible area a square, audible ~40% further on the diagonal.
    const origin = { x: 50, y: 50 };
    const straight = { x: 50 + SHOUT_RADIUS, y: 50 };
    const diagonal = { x: 50 + SHOUT_RADIUS, y: 50 + SHOUT_RADIUS };

    expect(hearsShout(origin, straight)).toBe(true);
    expect(hearsShout(origin, diagonal)).toBe(false); // a corner of the old square
  });

  it('measures the way sound actually spreads', () => {
    expect(soundDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(withinEarshot({ x: 0, y: 0 }, { x: 3, y: 4 }, 5)).toBe(true);
    expect(withinEarshot({ x: 0, y: 0 }, { x: 3, y: 4 }, 4.9)).toBe(false);
  });
});

describe('how far different noises reach', () => {
  it('a shout carries further than a scuffle', () => {
    expect(SHOUT_RADIUS).toBeGreaterThan(FIGHT_NOISE_RADIUS);

    const far = { x: FIGHT_NOISE_RADIUS + 4, y: 0 };
    expect(hearsShout({ x: 0, y: 0 }, far)).toBe(true);
    expect(hearsFighting({ x: 0, y: 0 }, far)).toBe(false);
  });

  it('both reach further than you can make anyone out', () => {
    // Otherwise "you hear fighting somewhere east" is a thing nobody ever experiences: you'd
    // always be close enough to just watch it.
    const spot = computeSpotRadius(5); // average Perception
    expect(FIGHT_NOISE_RADIUS).toBeGreaterThan(spot);
    expect(SHOUT_RADIUS).toBeGreaterThan(spot);
  });

  it('but not so far that a wasteland stops feeling like one', () => {
    // The overworld is 70 wide. A shout should not cross most of it.
    expect(SHOUT_RADIUS).toBeLessThan(35);
  });
});

describe('who a shout reaches', () => {
  function region(): RegionState {
    return {
      map: createGameMap(80, 80, 'floor'),
      daylight: false,
      monsters: [],
      groundItems: [],
      npcs: [],
      visibility: createVisibility(80, 80),
      name: 'test arena',
      transitions: [],
    };
  }

  it('reaches people within earshot and nobody beyond it', () => {
    const r = region();
    const near = createMonster(MONSTERS['restorationTrooper']!, 40 + SHOUT_RADIUS - 2, 40);
    const far = createMonster(MONSTERS['restorationTrooper']!, 40 + SHOUT_RADIUS + 3, 40);
    r.monsters.push(near, far);
    const victim = createNpc('v', 'Vance', '@', '#fff', 40, 40, 'hm', { faction: 'restoration' });
    r.npcs.push(victim);

    raiseAlarm(r, victim, 'restoration', 'player');

    expect(near.provokedBy).toContain('player');
    expect(far.provokedBy).toEqual([]);
  });

  it('reaches round a corner — walls do not stop it', () => {
    // Deliberate: hearing what you can't see is the entire point of a shout.
    const r = region();
    for (let y = 0; y < 80; y++) r.map.tiles[y * 80 + 45] = 'wall';
    const behindTheWall = createMonster(MONSTERS['restorationTrooper']!, 50, 40);
    r.monsters.push(behindTheWall);
    const victim = createNpc('v', 'Vance', '@', '#fff', 40, 40, 'hm', { faction: 'restoration' });
    r.npcs.push(victim);

    raiseAlarm(r, victim, 'restoration', 'player');

    expect(behindTheWall.provokedBy).toContain('player');
  });
});
