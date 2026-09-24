import type { GameState } from '../engine/GameState';
import { getActiveRegion } from '../engine/GameState';
import { isExplored, isVisible } from '../fov/VisibilityState';
import { getTileId } from '../world/GameMap';
import { TILES } from '../world/Tile';
import { MONSTERS } from '../entities/MonsterData';
import { ITEMS } from '../items/ItemData';
import { FACTIONS, standingBetween } from '../world/Factions';
import { NORMAL_SPEED } from '../config/constants';
import type { DamageType, Resistances } from '../combat/DamageTypes';
import type { Monster } from '../entities/Monster';

/**
 * "What is that?" — the `;` command.
 *
 * Deliberately explains creatures in terms of the systems that actually govern them: what it's
 * made of, what turns your blows, what it's afraid of, whether it's faster than you. A bestiary
 * entry that only gave flavour would be worse than nothing, because the player's real question is
 * always "can I take it, and with what?".
 */

export interface Description {
  title: string;
  lines: string[];
}

/** Plain-language readings of the tags that change how a fight goes. */
const TAG_NOTES: Record<string, string> = {
  undead: 'Undead. It does not tire and it does not bleed.',
  mindless: 'Mindless — nothing there to reason with or read.',
  amorphous: 'No fixed shape. Nothing inside worth puncturing.',
  carapace: 'Shelled. Blades and points slide off it.',
  humanoid: 'Built like a person.',
  beast: 'An animal.',
  sentient: 'It can think, and talk, and hold a grudge.',
};

const TYPE_NAMES: Record<DamageType, string> = {
  cut: 'cutting',
  pierce: 'piercing',
  bludgeon: 'blunt force',
  fire: 'fire',
  cold: 'cold',
  shock: 'shock',
  acid: 'acid',
  rad: 'radiation',
};

export function describeTile(state: GameState, x: number, y: number): Description {
  const region = getActiveRegion(state);

  if (!isVisible(region.visibility, x, y) && !isExplored(region.visibility, x, y)) {
    return { title: 'Out there somewhere', lines: ['You have not seen this place.'] };
  }

  if (state.player.x === x && state.player.y === y) {
    return { title: 'You', lines: ['Still standing.', '', groundLine(state, x, y) ?? 'Nothing underfoot.'] };
  }

  const monster = region.monsters.find((m) => m.hp > 0 && m.x === x && m.y === y);
  if (monster && isVisible(region.visibility, x, y)) return describeMonster(state, monster);

  const npc = region.npcs.find((n) => n.x === x && n.y === y);
  if (npc && isVisible(region.visibility, x, y)) {
    const faction = FACTIONS[npc.faction];
    return {
      title: npc.name,
      lines: [
        faction ? `Of ${faction.name}.` : '',
        faction?.creed ?? '',
        '',
        standingLine(state.player.faction, npc.faction, npc.provokedBy),
      ].filter((line) => line !== ''),
    };
  }

  const ground = groundLine(state, x, y);
  const tile = TILES[getTileId(region.map, x, y)];
  const terrain = tile ? terrainLine(tile.id) : 'Nothing you can make out.';

  return {
    title: ground ? 'On the ground' : 'Terrain',
    lines: ground ? [ground, '', terrain] : [terrain],
  };
}

function describeMonster(state: GameState, monster: Monster): Description {
  const def = MONSTERS[monster.defId];
  const name = def?.name ?? 'something';
  const lines: string[] = [];

  lines.push(standingLine(state.player.faction, monster.faction, monster.provokedBy));

  const faction = FACTIONS[monster.faction];
  if (faction && monster.faction !== 'wildlife' && monster.faction !== 'predators') {
    lines.push(`Of ${faction.name}.`);
  }

  if (monster.speed > NORMAL_SPEED) lines.push('Faster than you — it will get a second move.');
  else if (monster.speed < NORMAL_SPEED) lines.push('Slower than you.');

  const notes = monster.tags.map((tag) => TAG_NOTES[tag]).filter((note): note is string => note !== undefined);
  if (notes.length > 0) lines.push('', ...notes);

  const defences = describeResistances(monster.resistances);
  if (defences.length > 0) lines.push('', ...defences);

  lines.push('', woundLine(monster));

  return { title: name, lines };
}

function standingLine(playerFaction: string, faction: string, provokedBy: readonly string[] = []): string {
  // A grudge outranks the table: someone you just kicked is an enemy whatever their faction says.
  if (provokedBy.includes(playerFaction)) return 'It wants you dead — you started it.';

  switch (standingBetween(playerFaction, faction)) {
    case 'hostile':
      return 'It wants you dead.';
    case 'friendly':
      return 'On your side.';
    default:
      return 'It has no quarrel with you — yet.';
  }
}

function describeResistances(resistances: Resistances): string[] {
  const immune: string[] = [];
  const resists: string[] = [];
  const weak: string[] = [];

  for (const [type, value] of Object.entries(resistances) as Array<[DamageType, number]>) {
    const label = TYPE_NAMES[type];
    if (value >= 1) immune.push(label);
    else if (value >= 0.25) resists.push(label);
    else if (value < 0) weak.push(label);
  }

  const lines: string[] = [];
  if (immune.length > 0) lines.push(`Immune to ${list(immune)}.`);
  if (resists.length > 0) lines.push(`Turns most ${list(resists)}.`);
  if (weak.length > 0) lines.push(`Hurt badly by ${list(weak)}.`);
  return lines;
}

function woundLine(monster: Monster): string {
  const fraction = monster.hp / monster.maxHp;
  if (fraction >= 1) return 'Unhurt.';
  if (fraction <= 1 / 3) return 'Badly hurt.';
  return 'Wounded.';
}

function groundLine(state: GameState, x: number, y: number): string | null {
  const region = getActiveRegion(state);
  const ground = region.groundItems.filter((g) => g.x === x && g.y === y);
  if (ground.length === 0) return null;

  const names = ground.map((g) => ITEMS[g.item.defId]?.name ?? 'something');
  return `Lying here: ${list(names)}.`;
}

function terrainLine(tileId: string): string {
  return TERRAIN_NOTES[tileId] ?? 'Open ground.';
}

const TERRAIN_NOTES: Record<string, string> = {
  sand: 'Sand, and more sand.',
  grass: 'Dry scrub clinging on.',
  path: 'The old road. Something laid this once.',
  water: 'Water. You cannot cross it.',
  rock: 'Rock. It blocks sight as well as passage.',
  tree: 'A dead tree, still standing. It blocks the view.',
  wall: 'A wall.',
  floor: 'Swept ground.',
  stairsDown: 'Stairs leading down.',
  stairsUp: 'Stairs leading up.',
};

function list(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
