import { addMessage, type GameState, type RegionState } from '../engine/GameState';
import { KNOCKBACK_BY_WEIGHT } from '../config/constants';
import { DIRECTION_VECTORS, type Direction, type Point } from '../utils/geometry';
import { isWalkable } from '../world/GameMap';
import { actorLabel, alertAllies, provoke, removeActor, type Actor, type Provokable } from '../ai/Actors';
import { rollTypedDamage, type DamagePacket } from './DamageTypes';
import { computeToHitChance } from './CombatFormulas';
import { randomInt } from '../utils/RNG';
import { DEFAULT_THROW_BONUS } from '../config/constants';
import { dropLoot } from './Death';
import type { RNG } from '../utils/RNG';

/**
 * Kicking, and the shoving that throwing reuses.
 *
 * A kick is deliberately feeble as an attack — its value is the *knockback*. Bludgeon damage that
 * ignores which weapon you're holding gets you out of "my machete does nothing to this" without
 * a trip through the inventory, and a step of distance gets you out of a fight you're losing.
 */

/** A boot to the ribs: not much, but it's blunt, which is sometimes the whole point. */
export const KICK_DAMAGE: DamagePacket[] = [{ type: 'bludgeon', min: 1, max: 3 }];

export function knockbackTiles(weight: number): number {
  for (const [maxWeight, tiles] of KNOCKBACK_BY_WEIGHT) {
    if (weight <= maxWeight) return tiles;
  }
  return 0;
}

export interface KnockbackResult {
  /** How far it actually travelled, which may be less than intended. */
  moved: number;
  /** What it slammed into, if anything. */
  collidedWith: Provokable | null;
  /** It hit a wall rather than a creature. */
  hitWall: boolean;
}

/**
 * Shoves a creature away along `direction`, stopping at the first wall or occupied tile. Anything
 * it slams into stops it — and takes the impact, which is how a kicked body becomes a weapon.
 */
export function applyKnockback(
  monster: Provokable,
  direction: Direction,
  tiles: number,
  state: GameState,
  region: RegionState,
): KnockbackResult {
  const vector = DIRECTION_VECTORS[direction];
  let moved = 0;

  for (let step = 0; step < tiles; step++) {
    const next: Point = { x: monster.x + vector.x, y: monster.y + vector.y };

    if (!isWalkable(region.map, next.x, next.y)) return { moved, collidedWith: null, hitWall: true };
    if (next.x === state.player.x && next.y === state.player.y) return { moved, collidedWith: null, hitWall: true };

    const occupant = occupantAt(region, next, monster);
    if (occupant) return { moved, collidedWith: occupant, hitWall: false };

    monster.x = next.x;
    monster.y = next.y;
    moved += 1;
  }

  return { moved, collidedWith: null, hitWall: false };
}

export interface KickOutcome {
  /** Whether the kick consumed a turn. Kicking empty air doesn't. */
  tookTurn: boolean;
}

/** Kicks a creature: a little blunt damage, then send it flying if it's light enough. */
export function kickCreature(
  monster: Provokable,
  direction: Direction,
  state: GameState,
  region: RegionState,
  rng: RNG,
): KickOutcome {
  const label = actorLabel(monster);
  const damage = rollTypedDamage(rng, KICK_DAMAGE, state.player.strength, monster.resistances);
  monster.hp = Math.max(0, monster.hp - damage.total);

  // Being kicked counts as a quarrel, exactly like being hit does — and the victim's friends
  // notice, which is the difference between kicking someone and kicking someone in public.
  if (provoke(monster, state.player.faction)) alertAllies(region, monster, state.player.faction);

  addMessage(state, damage.shrugged ? `You kick ${label}, to no effect.` : `You kick ${label}.`);

  if (monster.hp <= 0) {
    addMessage(state, capitalized(`${label} goes down.`));
    if (monster.kind === 'monster') dropLoot(monster, region, rng);
    removeActor(region, monster);
    return { tookTurn: true };
  }

  const tiles = knockbackTiles(monster.weight);
  if (tiles === 0) {
    addMessage(state, capitalized(`${label} does not budge.`));
    return { tookTurn: true };
  }

  const knock = applyKnockback(monster, direction, tiles, state, region);

  if (knock.collidedWith) {
    const otherLabel = actorLabel(knock.collidedWith);
    const impact = rollTypedDamage(rng, KICK_DAMAGE, 0, knock.collidedWith.resistances);
    knock.collidedWith.hp = Math.max(0, knock.collidedWith.hp - impact.total);
    addMessage(state, capitalized(`${label} slams into ${otherLabel}.`));
    if (knock.collidedWith.hp <= 0) {
      addMessage(state, capitalized(`${otherLabel} goes down.`));
      if (knock.collidedWith.kind === 'monster') dropLoot(knock.collidedWith, region, rng);
      removeActor(region, knock.collidedWith);
    }
  } else if (knock.hitWall && knock.moved === 0) {
    addMessage(state, capitalized(`${label} is pinned against the wall.`));
  } else if (knock.moved > 0) {
    addMessage(state, capitalized(`${label} is knocked back.`));
  }

  return { tookTurn: true };
}

/** What a thrown object does when it has no business hurting anyone: a thump. */
const IMPROVISED_DAMAGE: DamagePacket[] = [{ type: 'bludgeon', min: 1, max: 2 }];

export interface FlingResult {
  /** Where the object came to rest. */
  landedAt: Point;
  /** Who it hit on the way, if anyone. */
  struck: Provokable | null;
}

/**
 * Sends a loose object along a direction until it hits something or runs out of range — the
 * shared path for throwing an item from your pack and for booting one that's lying on the floor.
 * Kicking is just throwing with less range and a worse arm, so there's one implementation.
 *
 * A weapon does its own damage when thrown; anything else does an improvised thump. The object
 * always lands on the map rather than vanishing, so a thrown machete is retrievable.
 */
export function flingItem(
  defId: string,
  from: Point,
  direction: Direction,
  range: number,
  damage: DamagePacket[] | undefined,
  state: GameState,
  region: RegionState,
  rng: RNG,
  throwBonus: number = DEFAULT_THROW_BONUS,
): FlingResult {
  const vector = DIRECTION_VECTORS[direction];
  let landedAt: Point = { x: from.x, y: from.y };

  for (let step = 0; step < range; step++) {
    const next: Point = { x: landedAt.x + vector.x, y: landedAt.y + vector.y };
    if (!isWalkable(region.map, next.x, next.y)) break;

    const occupant = occupantAt(region, next, null);
    if (occupant) {
      // Whether it lands depends on what you threw. A knife flies; a machete tumbles past.
      const chance = computeToHitChance(state.player.agility, throwBonus, occupant.ac);
      if (randomInt(rng, 1, 100) > chance) {
        addMessage(state, `It sails past ${actorLabel(occupant)}.`);
        landedAt = next;
        continue;
      }

      const rolled = rollTypedDamage(rng, damage ?? IMPROVISED_DAMAGE, 0, occupant.resistances);
      occupant.hp = Math.max(0, occupant.hp - rolled.total);

      const label = actorLabel(occupant);
      addMessage(
        state,
        rolled.shrugged ? `It bounces off ${label}.` : `It hits ${label}.`,
      );

      if (provoke(occupant, state.player.faction)) alertAllies(region, occupant, state.player.faction);

      if (occupant.hp <= 0) {
        addMessage(state, capitalized(`${label} goes down.`));
        if (occupant.kind === 'monster') dropLoot(occupant, region, rng);
        removeActor(region, occupant);
      }

      return { landedAt: next, struck: occupant };
    }

    landedAt = next;
  }

  void defId;
  return { landedAt, struck: null };
}

/** Anyone standing on that tile — creature or person — other than the one being shoved. */
function occupantAt(region: RegionState, at: Point, exclude: Actor | null): Provokable | null {
  const here = [...region.monsters, ...region.npcs].find(
    (a) => a.hp > 0 && a !== exclude && a.x === at.x && a.y === at.y,
  );
  return here ?? null;
}

/** A label may start with a proper name or with "the"; either way the sentence starts capitalised. */
function capitalized(line: string): string {
  return line.charAt(0).toUpperCase() + line.slice(1);
}
