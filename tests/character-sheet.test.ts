import { ensureRegionLoaded } from '../src/world/regions/RegionRegistry';
import { describe, expect, it } from 'vitest';
import { describeCharacter } from '../src/ui/screens/CharacterSheet';
import type { GameState, RegionState } from '../src/engine/GameState';
import { createPlayer, recomputePlayerCombatStats } from '../src/entities/Player';
import { createItem } from '../src/items/Item';

function makeState(): GameState {
  return {
    player: createPlayer(1, 1),
    // A real region, because the name now comes off the region's own state rather than a lookup
    // in a static table — which is what lets a generated interior have a name at all.
    regions: { overworld: ensureRegionLoaded({}, 'overworld') } as Record<string, RegionState>,
    activeRegionId: 'overworld',
    turnCount: 12,
    messageLog: [],
    gameOver: false,
  };
}

describe('character sheet', () => {
  it('reports where you are, how you are doing, and every SPECIAL stat', () => {
    const state = makeState();
    const text = describeCharacter(state).join('\n');

    expect(text).toContain('the desert — turn 12');
    expect(text).toContain('HP 25/25');
    expect(text).toContain('Caps 15');
    for (const stat of ['STRENGTH', 'PERCEPTION', 'ENDURANCE', 'CHARISMA', 'INTELLIGENCE', 'AGILITY', 'LUCK']) {
      expect(text).toContain(stat);
    }
  });

  it('shows the derived numbers each stat feeds, not just the raw stats', () => {
    const state = makeState();
    const text = describeCharacter(state).join('\n');

    expect(text).toContain('Damage      1-2 bludgeon +1 STR'); // fists, plus the Strength bonus
    expect(text).toContain('Sight       7'); // 6 + floor(5/3)
    expect(text).toContain('Carry       100'); // 50 + 5*10
    expect(text).toMatch(/Hit vs AC10\s+\d+%/);
  });

  it('aligns both columns, since the sheet is drawn as preformatted monospace text', () => {
    const lines = describeCharacter(makeState());
    const derivedRows = lines.filter((line) => /^(STRENGTH|PERCEPTION|ENDURANCE|CHARISMA)/.test(line));
    expect(derivedRows).toHaveLength(4);

    // Same start column for the stat value and for the derived label on every row.
    const labelColumns = new Set(derivedRows.map((line) => line.search(/\S/)));
    const derivedColumns = new Set(derivedRows.map((line) => line.indexOf(line.trimEnd().split(/\s{2,}/)[2]!)));
    expect(labelColumns.size).toBe(1);
    expect(derivedColumns.size).toBe(1);
  });

  it('tracks equipment, including durability, and updates when it changes', () => {
    const state = makeState();
    expect(describeCharacter(state).join('\n')).toContain('Weapon: (none)');

    const sword = createItem('machete');
    state.player.inventory.push(sword);
    state.player.equipment.weapon = sword;
    recomputePlayerCombatStats(state.player);

    const text = describeCharacter(state).join('\n');
    expect(text).toContain('Weapon: notched machete (22/22)');
    expect(text).toContain('Armor:  (none)');
    expect(text).toContain('Damage      2-4 cut +1 STR'); // the sword's range and type, not fists
  });
});
