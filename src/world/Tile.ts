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

  // Wilderness terrain (M6, produced by world/generation/*). Glyphs are picked to not collide with
  // any item glyph (`)`, `[`, `!`) or monster glyph (lowercase letters), so a tile is never
  // mistakable for something standing on it.
  sand: { id: 'sand', glyph: ',', fg: '#c2a76a', bg: '#000000', walkable: true, opaque: false },
  grass: { id: 'grass', glyph: '"', fg: '#4c9a4c', bg: '#000000', walkable: true, opaque: false },
  /**
   * The stitched town->dungeon road: always walkable, whatever terrain the noise put there.
   * Deliberately the only `.` out in the wilds (sand is `,`) so the road reads as a road.
   */
  path: { id: 'path', glyph: '.', fg: '#cdbb92', bg: '#000000', walkable: true, opaque: false },
  water: { id: 'water', glyph: '~', fg: '#3f7fbf', bg: '#000000', walkable: false, opaque: false },
  rock: { id: 'rock', glyph: '*', fg: '#7a7a7a', bg: '#000000', walkable: false, opaque: true },
  tree: { id: 'tree', glyph: 'T', fg: '#2f7d32', bg: '#000000', walkable: false, opaque: true },
};

export const DEFAULT_TILE_ID = 'wall';

export type StairwayDirection = 'down' | 'up';

/**
 * Which way a tile's staircase leads, or null if it isn't one. Stairways are the tiles whose
 * region transition needs a deliberate `>`/`<` rather than firing the moment you step on them
 * (see TurnManager.useStairs) — so "is this a stairway" is asked from several places and lives
 * here, next to the tile table it reads.
 */
export function stairwayDirection(tileId: string): StairwayDirection | null {
  if (tileId === 'stairsDown') return 'down';
  if (tileId === 'stairsUp') return 'up';
  return null;
}
