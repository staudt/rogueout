import { linePoints, type Point } from '../utils/geometry';
import type { IsPassableFn } from './BFS';

/**
 * The steps you can actually take heading *straight* at a target, stopping at the first thing in
 * the way.
 *
 * This is what a click on somewhere unreachable does. The obvious alternative — walk to whichever
 * reachable tile ends up closest to the target — sounds better and plays worse: asked to head for
 * a spot across a lake it will happily march you the long way round and leave you somewhere you
 * never meant to go. Going straight is predictable. You end up where you pointed, as far along as
 * the ground allowed, and the wall that stopped you is right there in front of you.
 *
 * The line is Bresenham, so it can run at any angle rather than only along the eight compass
 * directions. Returns an empty array when the very first step is blocked.
 */
export function walkableLineToward(start: Point, target: Point, isPassable: IsPassableFn): Point[] {
  const steps: Point[] = [];

  for (const point of linePoints(start, target)) {
    if (point.x === start.x && point.y === start.y) continue; // the line includes its origin
    if (!isPassable(point.x, point.y)) break;
    steps.push(point);
  }

  return steps;
}
