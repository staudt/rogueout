import type { GameState } from '../../engine/GameState';
import { ITEMS } from '../../items/ItemData';
import type { Item } from '../../items/Item';
import { computeCarryCapacity, computeFovRadius, computeToHitChance } from '../../combat/CombatFormulas';
import type { DamagePacket, Resistances } from '../../combat/DamageTypes';
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
    ['Damage', describeDamage(player.damage, special.strength)],
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

  const resisted = describeResistances(player.resistances);
  if (resisted) lines.push(`Resists: ${resisted}`);

  return lines;
}

/** "2-4 cut +1 STR" — what the weapon does and what your arm adds to it. */
function describeDamage(packets: readonly DamagePacket[], strength: number): string {
  if (packets.length === 0) return 'none';
  const parts = packets.map((packet) => `${packet.min}-${packet.max} ${packet.type}`);
  const bonus = Math.floor(strength / 3);
  return bonus > 0 ? `${parts.join(', ')} +${bonus} STR` : parts.join(', ');
}

/** Only the types you have an opinion about, as percentages; negatives read as vulnerabilities. */
function describeResistances(resistances: Resistances): string | null {
  const parts = (Object.entries(resistances) as Array<[string, number]>)
    .filter(([, value]) => value !== 0)
    .map(([type, value]) => `${type} ${value > 0 ? '' : '-'}${Math.round(Math.abs(value) * 100)}%`);
  return parts.length > 0 ? parts.join('  ') : null;
}

function describeEquipped(item: Item | null): string {
  if (!item) return '(none)';
  const def = ITEMS[item.defId];
  const name = def?.name ?? item.defId;
  return item.durability !== undefined ? `${name} (${item.durability}/${def?.maxDurability})` : name;
}
