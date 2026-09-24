import type { GameState } from '../engine/GameState';
import { ITEMS } from '../items/ItemData';
import type { Item } from '../items/Item';
import { REGIONS } from '../world/regions/RegionRegistry';

/** Below which fraction of max HP the readout turns red. */
const LOW_HP_FRACTION = 1 / 3;

interface Field {
  label: string;
  value: string;
  className?: string;
}

/**
 * The NetHack-style bottom status line: the handful of numbers you check constantly, always in
 * the same place so they can be read at a glance rather than found.
 *
 * DOM, not canvas — same split as MessageLog: the canvas is reserved for the glyph-grid map, and
 * chrome around it is ordinary markup (see CLAUDE.md).
 */
export class StatusBar {
  private readonly container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  render(state: GameState): void {
    this.container.innerHTML = '';
    for (const field of statusFields(state)) {
      const el = document.createElement('span');
      el.className = field.className ? `status-field ${field.className}` : 'status-field';

      const label = document.createElement('span');
      label.className = 'status-label';
      label.textContent = field.label;
      el.appendChild(label);

      const value = document.createElement('span');
      value.className = 'status-value';
      value.textContent = field.value;
      el.appendChild(value);

      this.container.appendChild(el);
    }
  }
}

/** Pure: the fields to show, in order. Split out so the content is testable without a DOM. */
export function statusFields(state: GameState): Field[] {
  const { player } = state;
  const hurt = player.hp <= player.maxHp * LOW_HP_FRACTION;

  return [
    { label: 'HP', value: `${player.hp}/${player.maxHp}`, className: hurt ? 'status-danger' : undefined },
    { label: 'AC', value: String(player.ac) },
    { label: 'Caps', value: String(player.caps) },
    { label: 'Weapon', value: describeEquipped(player.equipment.weapon) },
    { label: 'Armor', value: describeEquipped(player.equipment.armor) },
    { label: '', value: REGIONS[state.activeRegionId]?.name ?? state.activeRegionId },
    { label: 'Turn', value: String(state.turnCount) },
  ];
}

/** Equipment shows its durability, since that's the number that decides when to go shopping. */
function describeEquipped(item: Item | null): string {
  if (!item) return '—';
  const def = ITEMS[item.defId];
  const name = def?.name ?? item.defId;
  return item.durability !== undefined ? `${name} ${item.durability}/${def?.maxDurability}` : name;
}
