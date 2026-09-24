/**
 * The vocabulary for "somewhere you can go, and how the game builds it when you get there".
 *
 * Its own module so that `GameState` and `RegionRegistry` can both speak it without importing each
 * other: regions now carry their transitions on their *state* rather than looking them up in a
 * static table, which is what lets a generated city's doors exist at all (see RegionRecipe).
 */

/** A tile that leads somewhere else, and where you come out. */
export interface RegionTransition {
  x: number;
  y: number;
  toRegion: string;
  spawnX: number;
  spawnY: number;
  /**
   * How to build `toRegion` if it has never been visited and isn't in the static `REGIONS` table.
   * Absent for handcrafted destinations, which the table already knows how to make.
   */
  create?: RegionRecipe;
  /** Said on arrival instead of the destination's own line — for a one-off passage. */
  announce?: string;
  /**
   * Extra turns the crossing costs. The city elides roughly ten blocks between landmarks; charging
   * time for them is honest, whereas modelling 440 tiles of identical rubble would be tedious for
   * the player and the generator alike.
   */
  turnCost?: number;
}

/**
 * Everything needed to rebuild a region that nothing authored by hand — a building's interior, a
 * stretch of tunnel — from data alone.
 *
 * **Why a recipe rather than registering interiors into `REGIONS` as they're generated:**
 * module-level mutation doesn't survive a page reload and leaks across New Game, which is exactly
 * the bug already recorded for the morale `Map`. A recipe instead rides along on the *saved*
 * transition that points at it, so an interior you have never opened the door to is still
 * creatable after a reload — from the same seed, producing the same room.
 */
export interface RegionRecipe {
  /** Which builder in `REGION_BUILDERS` makes it. */
  builderId: string;
  /** Stable and authored, e.g. 'store-interior'. This is the key it caches under. */
  regionId: string;
  name: string;
  seed: number;
  params?: Record<string, string | number>;
}
