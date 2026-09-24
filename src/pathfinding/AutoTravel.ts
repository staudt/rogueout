import type { Point } from '../utils/geometry';

/**
 * Holds the remaining waypoints of an in-progress click-to-travel walk. Pure state, no timers —
 * Game.ts drives the actual step-by-step pacing and interrupt checks (danger, damage, region
 * change, new input), consuming one waypoint per turn via `shift()`.
 */
export class AutoTravel {
  private path: Point[] = [];

  start(path: Point[]): void {
    this.path = path;
  }

  isActive(): boolean {
    return this.path.length > 0;
  }

  cancel(): void {
    this.path = [];
  }

  /** The next waypoint, without consuming it — used to re-validate before committing to a step. */
  peek(): Point | undefined {
    return this.path[0];
  }

  shift(): Point | undefined {
    return this.path.shift();
  }
}
