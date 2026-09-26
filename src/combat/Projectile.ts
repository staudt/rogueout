import type { Point } from '../utils/geometry';
import type { GameState, RegionState } from '../engine/GameState';
import { addMessage } from '../engine/GameState';
import type { RNG } from '../utils/RNG';
import { randomInt } from '../utils/RNG';
import type { DamagePacket } from './DamageTypes';
import { rollTypedDamage } from './DamageTypes';
import { computeToHitChance } from './CombatFormulas';
import { actorLabel, reactToAttack, removeActor, type Provokable } from '../ai/Actors';
import { dropLoot } from './Death';
import type { FactionId } from '../world/Factions';
import { capitalize } from '../utils/text';

/**
 * Anything that crosses tiles and may hit what is standing on them — a thrown knife, a kicked
 * bottle, a bullet.
 *
 * Shared because the rule that matters is the same for all of them and is easy to get subtly
 * wrong in one place only: **a miss keeps going.** A shot that sails past a rat has to be rolled
 * again against whatever is behind the rat, or a crowd becomes a wall of immunity. Throwing had
 * this right and firing would have had to reimplement it.
 */
export interface ProjectileMessages {
  /** "It sails past the rat." / "The shot goes wide of the rat." */
  missed: (label: string) => string;
  /** "It hits the rat." */
  hit: (label: string) => string;
  /** Got through, but the target's resistances ate all of it. */
  shrugged: (label: string) => string;
}

export interface ProjectileResult {
  /** Every tile crossed, in order. Used to draw the flight; see Game.animateMissile. */
  path: Point[];
  /** Where it came to rest. */
  landedAt: Point;
  struck: Provokable | null;
}

export interface ProjectileOptions {
  /** Tiles to cross, in order, already checked for terrain. */
  path: readonly Point[];
  from: Point;
  damage: DamagePacket[];
  toHitBonus: number;
  attackerAgility: number;
  attackerFaction: FactionId;
  messages: ProjectileMessages;
  /** Strength added to the largest physical component — thrown things get none. */
  strength?: number;
}

export function resolveProjectile(
  options: ProjectileOptions,
  state: GameState,
  region: RegionState,
  rng: RNG,
): ProjectileResult {
  const { path, from, damage, toHitBonus, attackerAgility, attackerFaction, messages } = options;

  const crossed: Point[] = [];
  let landedAt: Point = { x: from.x, y: from.y };

  for (const next of path) {
    crossed.push(next);
    landedAt = next;

    const occupant = occupantAt(region, next);
    if (!occupant) continue;

    const chance = computeToHitChance(attackerAgility, toHitBonus, occupant.ac);
    if (randomInt(rng, 1, 100) > chance) {
      addMessage(state, messages.missed(actorLabel(occupant)));
      continue; // and on it goes — whoever is behind them is next
    }

    const rolled = rollTypedDamage(rng, damage, options.strength ?? 0, occupant.resistances);
    occupant.hp = Math.max(0, occupant.hp - rolled.total);

    const label = actorLabel(occupant);
    addMessage(state, rolled.shrugged ? messages.shrugged(label) : messages.hit(label));

    reactToAttack(state, region, occupant, attackerFaction);

    if (occupant.hp <= 0) {
      addMessage(state, capitalize(`${label} goes down.`));
      dropLoot(occupant, region, rng, attackerFaction);
      removeActor(region, occupant);
    }

    return { path: crossed, landedAt: next, struck: occupant };
  }

  return { path: crossed, landedAt, struck: null };
}

function occupantAt(region: RegionState, at: Point): Provokable | null {
  const here = [...region.monsters, ...region.npcs].find(
    (a) => a.hp > 0 && a.x === at.x && a.y === at.y,
  );
  return here ?? null;
}
