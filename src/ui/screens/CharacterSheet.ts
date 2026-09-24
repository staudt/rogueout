import type { GameState } from '../../engine/GameState';
import { ITEMS } from '../../items/ItemData';
import type { Item } from '../../items/Item';
import { computeCarryCapacity, computeFovRadius, computeToHitChance } from '../../combat/CombatFormulas';
import { REGIONS } from '../../world/regions/RegionRegistry';

/** AC the displayed hit chance is quoted against — an unarmored, average-agility target. */
const REFERENCE_AC = 10;

const SPECIAL_ROWS: Array<[label: string, key: keyof GameState['player']['special']]> = [
  ['STRENGTH', 'strength'],
  ['PERCEPTION', 'perception'],
  ['ENDURANCE', 'endurance'],
  ['CHARISMA', 'charisma'],
  ['INTELLIGENCE', 'intelligence'],
  ['AGILITY', 'agility'],
  ['LUCK', 'luck'],
];

/**
 * The character sheet as plain lines of monospace text. Pure (state in, strings out) so it's
 * unit-testable without a DOM — ScreenManager/Menu just draw whatever comes back.
 *
 * Right-hand column shows the *derived* numbers each SPECIAL stat actually feeds, so the sheet
 * doubles as an explanation of the formulas rather than a bare stat dump.
 */
export function describeCharacter(state: GameState): string[] {
  const { player } = state;
  const special = player.special;

  const derived = [
    ['Damage', `${player.minDamage}-${player.maxDamage} +${Math.floor(special.strength / 3)} STR`],
    ['Hit vs AC' + REFERENCE_AC, `${computeToHitChance(special.agility, player.accuracyBonus, REFERENCE_AC)}%`],
    ['Sight', String(computeFovRadius(special.perception))],
    ['Carry', String(computeCarryCapacity(special.strength))],
  ].map(([label, value]) => `${label!.padEnd(12)}${value}`);

  const lines = [
    `${REGIONS[state.activeRegionId]?.name ?? state.activeRegionId} — turn ${state.turnCount}`,
    '',
    `HP ${player.hp}/${player.maxHp}    AC ${player.ac}    Gold ${player.gold}`,
    '',
  ];

  SPECIAL_ROWS.forEach(([label, key], i) => {
    const left = `${label.padEnd(13)}${String(special[key]).padStart(2)}`;
    lines.push(derived[i] ? `${left}    ${derived[i]}` : left);
  });

  lines.push('', `Weapon: ${describeEquipped(player.equipment.weapon)}`);
  lines.push(`Armor:  ${describeEquipped(player.equipment.armor)}`);

  return lines;
}

function describeEquipped(item: Item | null): string {
  if (!item) return '(none)';
  const def = ITEMS[item.defId];
  const name = def?.name ?? item.defId;
  return item.durability !== undefined ? `${name} (${item.durability}/${def?.maxDurability})` : name;
}
