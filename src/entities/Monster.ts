import type { Entity } from './Entity';
import type { Combatant } from '../combat/Combatant';
import type { MonsterBehavior, MonsterDef } from './MonsterData';
import type { FactionId } from '../world/Factions';
import { NORMAL_SPEED } from '../config/constants';

export interface Monster extends Entity, Combatant {
  readonly kind: 'monster';
  defId: string;
  behavior: MonsterBehavior;
  awarenessRadius: number;
  faction: FactionId;
  /** Movement points banked per player turn. See constants.NORMAL_SPEED. */
  speed: number;
  /** Unspent movement points, carried between turns — this is what makes speed 18 work. */
  energy: number;
}

let nextInstanceId = 0;

/**
 * Same reasoning as reserveItemInstanceIds: monster ids are `<defId>-<n>` off a module counter
 * that resets on reload, and a region you hadn't visited yet is created *after* a load — so
 * without this, its fresh monsters could take ids already held by restored ones.
 */
export function reserveMonsterInstanceIds(ids: Iterable<string>): void {
  for (const id of ids) {
    const n = Number.parseInt(id.slice(id.lastIndexOf('-') + 1), 10);
    if (Number.isFinite(n) && n > nextInstanceId) nextInstanceId = n;
  }
}

export function createMonster(def: MonsterDef, x: number, y: number): Monster {
  nextInstanceId += 1;
  return {
    id: `${def.id}-${nextInstanceId}`,
    kind: 'monster',
    defId: def.id,
    glyph: def.glyph,
    fg: def.fg,
    x,
    y,
    hp: def.maxHp,
    maxHp: def.maxHp,
    ac: def.ac,
    strength: def.strength,
    agility: def.agility,
    accuracyBonus: def.accuracyBonus,
    damage: def.damage.map((packet) => ({ ...packet })), // copied: instances must not share the def's array
    resistances: { ...(def.resist ?? {}) },
    tags: [...def.tags],
    behavior: def.behavior,
    awarenessRadius: def.awarenessRadius,
    faction: def.faction,
    speed: def.speed ?? NORMAL_SPEED,
    energy: 0,
  };
}
