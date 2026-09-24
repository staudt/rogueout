import type { Entity } from './Entity';
import type { Combatant } from '../combat/Combatant';
import { DEFAULT_SPECIAL, type SpecialStats } from '../stats/SpecialStats';
import { computeAC, computeMaxHP } from '../combat/CombatFormulas';
import type { Inventory } from '../items/Inventory';
import { createEmptyEquipment, type Equipment } from '../items/Equipment';
import { ITEMS } from '../items/ItemData';

export const UNARMED_MIN_DAMAGE = 1;
export const UNARMED_MAX_DAMAGE = 2;

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
    minDamage: UNARMED_MIN_DAMAGE,
    maxDamage: UNARMED_MAX_DAMAGE,
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
  player.minDamage = weaponDef?.minDamage ?? UNARMED_MIN_DAMAGE;
  player.maxDamage = weaponDef?.maxDamage ?? UNARMED_MAX_DAMAGE;
}
