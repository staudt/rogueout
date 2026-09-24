import { describe, expect, it } from 'vitest';
import { statusFields } from '../src/ui/StatusBar';
import type { GameState, RegionState } from '../src/engine/GameState';
import { createPlayer, recomputePlayerCombatStats } from '../src/entities/Player';
import { createItem } from '../src/items/Item';

function makeState(): GameState {
  return {
    player: createPlayer(1, 1),
    regions: {} as Record<string, RegionState>,
    activeRegionId: 'overworld',
    turnCount: 31,
    messageLog: [],
    gameOver: false,
  };
}

const find = (state: GameState, label: string) => statusFields(state).find((f) => f.label === label);

describe('status bar', () => {
  it('shows the numbers you check constantly', () => {
    const state = makeState();
    const fields = statusFields(state);

    expect(find(state, 'HP')?.value).toBe('25/25');
    expect(find(state, 'AC')?.value).toBe('12');
    expect(find(state, 'Caps')?.value).toBe('15');
    expect(find(state, 'Turn')?.value).toBe('31');
    // The unlabelled field is where you are.
    expect(fields.find((f) => f.label === '')?.value).toBe('the desert');
  });

  it('flags low HP, and only when it is actually low', () => {
    const state = makeState();
    expect(find(state, 'HP')?.className).toBeUndefined();

    state.player.hp = 8; // a third of 25
    expect(find(state, 'HP')?.className).toBe('status-danger');

    state.player.hp = 9;
    expect(find(state, 'HP')?.className).toBeUndefined();
  });

  it('shows equipment with the durability that decides when to go shopping', () => {
    const state = makeState();
    expect(find(state, 'Weapon')?.value).toBe('—');
    expect(find(state, 'Armor')?.value).toBe('—');

    const sword = createItem('machete');
    sword.durability = 7;
    state.player.inventory.push(sword);
    state.player.equipment.weapon = sword;
    recomputePlayerCombatStats(state.player);

    expect(find(state, 'Weapon')?.value).toBe('notched machete 7/22');
  });

  it('tracks AC changing when armor goes on', () => {
    const state = makeState();
    const armor = createItem('paddedVest');
    state.player.inventory.push(armor);
    state.player.equipment.armor = armor;
    recomputePlayerCombatStats(state.player);

    expect(find(state, 'AC')?.value).toBe('14'); // 10 + floor(5/2) + 2
    expect(find(state, 'Armor')?.value).toBe('padded vest 18/18');
  });
});
