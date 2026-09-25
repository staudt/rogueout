export interface TileDef {
  id: string;
  glyph: string;
  fg: string;
  bg: string;
  walkable: boolean;
  /** Blocks line of sight — used by FOV shadowcasting (from M2 on). */
  opaque: boolean;
}

export const TILES: Record<string, TileDef> = {
  floor: { id: 'floor', glyph: '.', fg: '#888888', bg: '#000000', walkable: true, opaque: false },
  wall: { id: 'wall', glyph: '#', fg: '#a85a32', bg: '#000000', walkable: false, opaque: true },
  stairsDown: { id: 'stairsDown', glyph: '>', fg: '#ffff00', bg: '#000000', walkable: true, opaque: false },
  stairsUp: { id: 'stairsUp', glyph: '<', fg: '#ffff00', bg: '#000000', walkable: true, opaque: false },
  /**
   * A way into a building. Walkable *and opaque*: you should not be able to read a shop's interior
   * off the street through its doorway. FOV always marks the viewer's own tile visible, so standing
   * in the doorway still works — you just have to be in it.
   */
  door: { id: 'door', glyph: '+', fg: '#c98b3a', bg: '#1a1208', walkable: true, opaque: true },

  // The city (world/generation/city/*). Backgrounds are solid, like the outdoor terrain below:
  // a city drawn as bare glyphs on black reads as a wireframe maze rather than as streets between
  // buildings, which is the same lesson the sand background taught.
  /** Asphalt. The city's open ground, and the thing blocks are the complement of. */
  street: { id: 'street', glyph: '.', fg: '#75757c', bg: '#14141a', walkable: true, opaque: false },
  /** An intact building exterior. */
  brick: { id: 'brick', glyph: '#', fg: '#95503d', bg: '#231310', walkable: false, opaque: true },
  /**
   * Debris you can pick your way over. The one tile that makes ruin interesting rather than just
   * subtractive: a collapsed building becomes a shortcut through a block instead of a longer wall.
   */
  rubble: { id: 'rubble', glyph: ':', fg: '#9c9288', bg: '#1d1b17', walkable: true, opaque: false },
  /**
   * Collapse too total to cross. This is what district boundaries are made of, and what the outer
   * edge of an area is filled with, so the world ends in rubble rather than an arbitrary wall.
   *
   * Shares `*` with `rock`, deliberately: both mean "impassable heap", and they never appear in
   * the same kind of place — rock is open terrain, ruin is a city block. The colours differ.
   */
  ruin: { id: 'ruin', glyph: '*', fg: '#5d574f', bg: '#151311', walkable: false, opaque: true },

  // Wilderness terrain (M6, produced by world/generation/*). Glyphs are picked to not collide with
  // any item glyph (`)`, `[`, `!`) or monster glyph (lowercase letters), so a tile is never
  // mistakable for something standing on it.
  sand: { id: 'sand', glyph: ',', fg: '#c2a76a', bg: '#171208', walkable: true, opaque: false },
  grass: { id: 'grass', glyph: '"', fg: '#4c9a4c', bg: '#0c1408', walkable: true, opaque: false },
  /**
   * The stitched town->dungeon road: always walkable, whatever terrain the noise put there.
   * Deliberately the only `.` out in the wilds (sand is `,`) so the road reads as a road.
   */
  path: { id: 'path', glyph: '.', fg: '#cdbb92', bg: '#1f1810', walkable: true, opaque: false },
  water: { id: 'water', glyph: '~', fg: '#3f7fbf', bg: '#06101a', walkable: false, opaque: false },
  rock: { id: 'rock', glyph: '*', fg: '#7a7a7a', bg: '#121212', walkable: false, opaque: true },
  tree: { id: 'tree', glyph: 'T', fg: '#2f7d32', bg: '#0c1408', walkable: false, opaque: true },
};

export const DEFAULT_TILE_ID = 'wall';

export type StairwayDirection = 'down' | 'up';

/** What kind of deliberate crossing a tile offers. A door answers to both `>` and `<`. */
export type TransitionKind = StairwayDirection | 'door';

/**
 * Which kind of crossing a tile offers, or null if it isn't one.
 *
 * These are the tiles whose region transition needs a deliberate `>`/`<` rather than firing the
 * moment you step on them (see TurnManager.useTransition). Doors are on this list for the same
 * reason stairs are, and it matters more in a city than it ever did in a desert: auto-travel must
 * never route you *through* a building because cutting the corner was two steps shorter.
 *
 * Asked from several places, so it lives here next to the tile table it reads.
 */
export function transitionKind(tileId: string): TransitionKind | null {
  if (tileId === 'stairsDown') return 'down';
  if (tileId === 'stairsUp') return 'up';
  if (tileId === 'door') return 'door';
  return null;
}

/** Whether stepping on this tile should *not* cross by itself. See transitionKind. */
export function isDeliberateTransition(tileId: string): boolean {
  return transitionKind(tileId) !== null;
}
