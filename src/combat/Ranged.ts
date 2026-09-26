import { isOpaque, type GameMapData } from '../world/GameMap';
import { linePoints, type Point } from '../utils/geometry';
import type { GameState, RegionState } from '../engine/GameState';
import { addMessage } from '../engine/GameState';
import type { RNG } from '../utils/RNG';
import { randomInt } from '../utils/RNG';
import type { ItemDef } from '../items/ItemData';
import type { DamagePacket } from './DamageTypes';
import { resolveProjectile, type ProjectileResult } from './Projectile';
import { raiseNoise } from '../ai/Actors';

/**
 * Firearms.
 *
 * Filed last in the design direction and built early only because the missile work for throwing
 * turned out to be most of it. The intent, agreed up front, is **unreliable, loud and
 * ammo-starved rather than weak** — a gun that is simply a worse sword is not a decision, whereas
 * one that hits hard, jams, and brings the whole street down on you is.
 *
 * So the three costs are all real and none of them is damage: every shot burns a round you may not
 * be able to replace, every shot can jam and leave you holding a stick for a turn, and every shot
 * is heard far beyond anything else in the game — well past the range you can see, which means
 * firing at something you can see summons things you cannot.
 */
export interface RangedProfile {
  /**
   * What the *shot* does — quite separate from `ItemDef.damage`, which is what the weapon does
   * when you hit somebody with it.
   *
   * They were the same field to begin with, and the result was that firing a rifle dealt the
   * damage of clouting someone with its butt: two or three points, so six shots failed to kill a
   * Restoration trooper. Guns are supposed to hit hard — the whole design puts their cost in
   * ammunition, jams and noise rather than in damage — and the bug quietly inverted that.
   */
  damage: DamagePacket[];
  /** How far it will carry, in tiles. */
  range: number;
  /** `ItemDef.id` of the ammunition it eats, one per shot. */
  ammo: string;
  /** Added to the to-hit roll, on top of the shooter's agility. */
  accuracyBonus: number;
  /** 0..1 chance per shot that it fails instead of firing. */
  jamChance: number;
  /** How far the report carries. Deliberately much further than a shout. */
  noiseRadius: number;
}

export type ShotOutcome =
  | { kind: 'no-line' }
  | { kind: 'out-of-range'; distance: number }
  | { kind: 'jammed' }
  | { kind: 'fired'; result: ProjectileResult };

/**
 * The tiles a shot would cross on its way to `to`, stopping at the first thing it cannot pass
 * through.
 *
 * Bresenham, the same line the road carver and straight-line travel use, so a shot bends exactly
 * the way everything else in the game does. The shooter's own tile is excluded; the target's is
 * included when the line reaches it.
 */
export function lineOfFire(from: Point, to: Point, map: GameMapData, range: number): Point[] {
  const path: Point[] = [];

  for (const point of linePoints(from, to)) {
    if (point.x === from.x && point.y === from.y) continue;
    if (isOpaque(map, point.x, point.y)) break; // it stops in the wall
    path.push(point);
    if (path.length >= range) break;
  }

  return path;
}

/** Whether a shot from here would reach there at all — used to grey out impossible targets. */
export function hasLineOfFire(from: Point, to: Point, map: GameMapData, range: number): boolean {
  const path = lineOfFire(from, to, map, range);
  return path.length > 0 && path[path.length - 1]!.x === to.x && path[path.length - 1]!.y === to.y;
}

export function fireAt(
  weapon: ItemDef,
  profile: RangedProfile,
  target: Point,
  state: GameState,
  region: RegionState,
  rng: RNG,
): ShotOutcome {
  const shooter = state.player;
  const path = lineOfFire(shooter, target, region.map, profile.range);

  if (path.length === 0) return { kind: 'no-line' };

  // A jam costs the turn and the moment, but not the round: the cartridge is still in there,
  // which is the point of clearing it.
  if (randomInt(rng, 1, 100) <= Math.round(profile.jamChance * 100)) {
    addMessage(state, `The ${weapon.name} jams.`);
    return { kind: 'jammed' };
  }

  addMessage(state, `You fire the ${weapon.name}.`);

  const result = resolveProjectile(
    {
      path,
      from: shooter,
      damage: profile.damage,
      toHitBonus: profile.accuracyBonus,
      attackerAgility: shooter.agility,
      attackerFaction: shooter.faction,
      messages: {
        missed: (label) => `The shot goes wide of ${label}.`,
        hit: (label) => `The shot hits ${label}.`,
        shrugged: (label) => `The shot flattens against ${label}.`,
      },
    },
    state,
    region,
    rng,
  );

  // The report, last and loudest. Nobody is blamed for it — they come to look, and what they make
  // of what they find when they get there is their own business.
  raiseNoise(region, shooter, profile.noiseRadius);
  addMessage(state, 'The noise rolls away down the street.');

  return { kind: 'fired', result };
}
