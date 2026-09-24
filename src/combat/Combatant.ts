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
  minDamage: number;
  maxDamage: number;
}
