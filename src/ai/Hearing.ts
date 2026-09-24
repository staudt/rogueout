import type { Point } from '../utils/geometry';
import { FIGHT_NOISE_RADIUS, SHOUT_RADIUS } from '../config/constants';

/**
 * Who can hear what, and how far.
 *
 * Two things are settled here that were previously implicit and wrong.
 *
 * **Sound is radial, not square.** Everything else in the game measures distance in Chebyshev
 * steps, because that's how movement works — a diagonal step costs the same as a straight one.
 * Applying that to sound made the audible area a square, so a fight was audible about 40% further
 * away on the diagonal than straight ahead. Noise doesn't care which way the grid runs.
 *
 * **A shout carries further than a scuffle.** Someone deliberately making themselves heard is a
 * different event from two people grunting at each other, and in open desert that difference is
 * most of what you have to go on.
 */

/** Euclidean, because sound spreads in circles. */
export function soundDistance(from: Point, to: Point): number {
  return Math.hypot(to.x - from.x, to.y - from.y);
}

export function withinEarshot(from: Point, to: Point, radius: number): boolean {
  return soundDistance(from, to) <= radius;
}

/** A deliberate shout: the loudest thing a person does, and the furthest-reaching. */
export function hearsShout(listener: Point, source: Point): boolean {
  return withinEarshot(listener, source, SHOUT_RADIUS);
}

/** The noise of a fight: closer, because nobody is trying to be heard. */
export function hearsFighting(listener: Point, source: Point): boolean {
  return withinEarshot(listener, source, FIGHT_NOISE_RADIUS);
}
