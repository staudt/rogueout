import type { DamagePacket, Resistances } from './DamageTypes';

/**
 * The subset of stats CombatFormulas needs from anything that can fight — player or monster.
 * Player derives these from its full SpecialStats; monsters set them directly in MonsterData.
 */
export interface Combatant {
  hp: number;
  maxHp: number;
  ac: number;
  strength: number;
  agility: number;
  accuracyBonus: number;
  /** What this thing's attack is made of. Several components is normal — a blade cuts and thrusts. */
  damage: DamagePacket[];
  /** Innate hide plus whatever is worn, already combined (see combineResistances). */
  resistances: Resistances;
  /**
   * Open-ended descriptors: 'living', 'undead', 'head', 'arms', 'legs', 'mindless', 'amorphous'...
   * Rules ask about tags rather than about fields, so new anatomy is data, not a schema change.
   */
  tags: string[];
}
