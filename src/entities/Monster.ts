import type { Entity } from './Entity';
import type { Item } from '../items/Item';
import type { Investigation } from '../ai/Actors';
import type { Combatant } from '../combat/Combatant';
import type { MonsterBehavior, MonsterDef } from './MonsterData';
import type { FactionId } from '../world/Factions';
import { DEFAULT_WEIGHT, NORMAL_SPEED } from '../config/constants';

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
  /**
   * Factions this individual has decided it has a quarrel with, regardless of what the standings
   * table says. Hit a creature that was minding its own business and it stops minding it.
   * Per-creature, not per-faction: spearing one lizard does not turn every lizard against you.
   */
  provokedBy: FactionId[];
  /** Things taken off the ground. Dropped again on death — a raider is a moving pile of loot. */
  carried?: Item[];
  /** Roughly kilograms; read by knockback. */
  weight: number;
  /** Set once its nerve goes, so "it breaks and runs" is said when it happens and not after. */
  broken?: boolean;
  /** A noise it heard, and what it was about. Cleared on arrival (see resolveInvestigation). */
  investigating?: Investigation | null;
  /** Set once it's raised the alarm, so one incident doesn't produce a shout every turn. */
  hasScreamed?: boolean;
  /** Set while shouting about an enemy it can see; cleared when it loses sight of one. */
  calledOut?: boolean;
  /**
   * Which waypoint of the region's patrol route it's heading for — and, by its presence, whether
   * this individual patrols at all. Deliberately an instance property rather than a species one:
   * *this band* walks the road, while a raider set to guard a ruin stays at the ruin.
   */
  patrolIndex?: number;
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
    provokedBy: [],
    weight: def.weight ?? DEFAULT_WEIGHT,
  };
}
