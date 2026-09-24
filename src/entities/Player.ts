import type { Entity } from './Entity';
import type { Combatant } from '../combat/Combatant';
import { DEFAULT_SPECIAL, type SpecialStats } from '../stats/SpecialStats';
import { computeAC, computeMaxHP } from '../combat/CombatFormulas';
import { combineResistances, type DamagePacket } from '../combat/DamageTypes';
import type { Inventory } from '../items/Inventory';
import { createEmptyEquipment, type Equipment } from '../items/Equipment';
import { ITEMS } from '../items/ItemData';

/** Fists: a bludgeon, and a poor one. */
export const UNARMED_DAMAGE: DamagePacket[] = [{ type: 'bludgeon', min: 1, max: 2 }];

/** What the player is made of, in the same vocabulary as any other creature. */
export const PLAYER_TAGS = ['living', 'humanoid', 'head', 'arms', 'legs', 'sentient'];

export interface Player extends Entity, Combatant {
  readonly kind: 'player';
  special: SpecialStats;
  inventory: Inventory;
  equipment: Equipment;
  gold: number;
}

export function createPlayer(x: number, y: number, special: SpecialStats = DEFAULT_SPECIAL): Player {
  const maxHp = computeMaxHP(special.endurance);
  return {
    id: 'player',
    kind: 'player',
    glyph: '@',
    fg: '#ffffff',
    x,
    y,
    special,
    hp: maxHp,
    maxHp,
    ac: computeAC(special.agility),
    strength: special.strength,
    agility: special.agility,
    accuracyBonus: 0, // unarmed until something is wielded
    damage: UNARMED_DAMAGE.map((packet) => ({ ...packet })),
    resistances: {},
    tags: [...PLAYER_TAGS],
    inventory: [],
    equipment: createEmptyEquipment(),
    gold: 15,
  };
}

/** Recomputes AC/accuracy/damage from currently equipped weapon+armor. Call after any equip change. */
export function recomputePlayerCombatStats(player: Player): void {
  const weaponDef = player.equipment.weapon ? ITEMS[player.equipment.weapon.defId] : undefined;
  const armorDef = player.equipment.armor ? ITEMS[player.equipment.armor.defId] : undefined;

  player.ac = computeAC(player.special.agility, armorDef?.armorValue ?? 0);
  player.accuracyBonus = weaponDef?.accuracyBonus ?? 0;
  player.damage = (weaponDef?.damage ?? UNARMED_DAMAGE).map((packet) => ({ ...packet }));
  // Worn armour is the player's only source of resistance for now; innate ones would combine here.
  player.resistances = combineResistances(armorDef?.resist);
}
