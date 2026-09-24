import { describe, expect, it } from 'vitest';
import { describeTile } from '../src/ui/Describe';
import { createMonster } from '../src/entities/Monster';
import { MONSTERS } from '../src/entities/MonsterData';
import { createPlayer } from '../src/entities/Player';
import { createNpc } from '../src/entities/Npc';
import { createItem } from '../src/items/Item';
import { createVisibility, markVisible } from '../src/fov/VisibilityState';
import { createGameMap, setTileId } from '../src/world/GameMap';
import type { GameState, RegionState } from '../src/engine/GameState';

function region(): RegionState {
  const map = createGameMap(12, 8, 'wall');
  for (let y = 1; y < 7; y++) for (let x = 1; x < 11; x++) setTileId(map, x, y, 'sand');
  return { map, daylight: true, monsters: [], groundItems: [], npcs: [], visibility: createVisibility(12, 8) };
}

function state(r: RegionState): GameState {
  return {
    player: createPlayer(2, 2),
    regions: { r },
    activeRegionId: 'r',
    turnCount: 0,
    messageLog: [],
    gameOver: false,
  };
}

const see = (r: RegionState, x: number, y: number) => markVisible(r.visibility, x, y);

describe('describing a creature', () => {
  it('leads with what it means for you, not with taxonomy', () => {
    const r = region();
    r.monsters.push(createMonster(MONSTERS['feralGhoul']!, 5, 3));
    see(r, 5, 3);

    const description = describeTile(state(r), 5, 3);

    expect(description.title).toBe('feral ghoul');
    expect(description.lines[0]).toBe('It wants you dead.');
  });

  it('warns when something will get a second move', () => {
    const r = region();
    r.monsters.push(createMonster(MONSTERS['feralGhoul']!, 5, 3)); // speed 18
    see(r, 5, 3);

    expect(describeTile(state(r), 5, 3).lines.join(' ')).toContain('Faster than you');
  });

  it('says what turns your blows and what it fears', () => {
    const r = region();
    r.monsters.push(createMonster(MONSTERS['crawlingMold']!, 4, 4));
    see(r, 4, 4);

    const text = describeTile(state(r), 4, 4).lines.join('\n');

    expect(text).toContain('Immune to piercing.');
    expect(text).toMatch(/Turns most cutting/);
    expect(text).toContain('Hurt badly by fire.');
    expect(text).toContain('Nothing inside worth puncturing.');
  });

  it('distinguishes something that will leave you alone', () => {
    const r = region();
    r.monsters.push(createMonster(MONSTERS['sandSkink']!, 6, 2));
    see(r, 6, 2);

    expect(describeTile(state(r), 6, 2).lines[0]).toMatch(/no quarrel/);
  });

  it('reports how hurt it is', () => {
    const r = region();
    const ghoul = createMonster(MONSTERS['feralGhoul']!, 5, 3);
    ghoul.hp = 2;
    r.monsters.push(ghoul);
    see(r, 5, 3);

    expect(describeTile(state(r), 5, 3).lines.join(' ')).toContain('Badly hurt.');
  });
});

describe('describing people, things and ground', () => {
  it('gives an NPC their faction and what it stands for', () => {
    const r = region();
    r.npcs.push(createNpc('a', 'Sister Adel', '@', '#fff', 4, 2, 'hello', { faction: 'vigil' }));
    see(r, 4, 2);

    const description = describeTile(state(r), 4, 2);

    expect(description.title).toBe('Sister Adel');
    expect(description.lines.join(' ')).toContain('the Vigil');
    expect(description.lines.join(' ')).toMatch(/water/i); // their creed
  });

  it('names what is lying on the floor', () => {
    const r = region();
    r.groundItems.push({ item: createItem('machete'), x: 7, y: 5 });
    see(r, 7, 5);

    expect(describeTile(state(r), 7, 5).lines.join(' ')).toContain('notched machete');
  });

  it('describes bare terrain, including what blocks sight', () => {
    const r = region();
    setTileId(r.map, 8, 5, 'rock');
    see(r, 8, 5);

    expect(describeTile(state(r), 8, 5).lines.join(' ')).toMatch(/blocks sight/);
  });

  it('refuses to describe somewhere you have never seen', () => {
    const r = region();
    r.monsters.push(createMonster(MONSTERS['feralGhoul']!, 9, 6)); // unseen

    const description = describeTile(state(r), 9, 6);

    expect(description.lines.join(' ')).toMatch(/have not seen/);
    expect(description.title).not.toBe('feral ghoul'); // no free intelligence
  });

  it('does not reveal a creature standing on remembered but unseen ground', () => {
    const r = region();
    markVisible(r.visibility, 9, 6);
    r.visibility.visible.fill(0); // explored, but not currently in view
    r.monsters.push(createMonster(MONSTERS['feralGhoul']!, 9, 6));

    expect(describeTile(state(r), 9, 6).title).not.toBe('feral ghoul');
  });
});
