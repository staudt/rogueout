import type { GameState, RegionState } from '../engine/GameState';
import type { Player } from '../entities/Player';
import type { Monster } from '../entities/Monster';
import type { Npc } from '../entities/Npc';
import type { GroundItem } from '../items/Item';
import type { RegionTransition } from '../world/regions/RegionTypes';
import { decodeBits, decodeTiles, encodeBits, encodeTiles, type EncodedTiles } from './MapCodec';

/**
 * v2 encodes the two area-scaled fields (tiles, explored) and drops `visible` — see SavedRegion.
 * v1 saves are rejected rather than converted: they predate the move to a city map, the region
 * ids changed with it, and the game is permadeath single-slot, so the cost of refusing one is a
 * new run rather than lost progress.
 */
export const SAVE_SCHEMA_VERSION = 2;

/** How many trailing log lines a save keeps — enough to remember what you were doing. */
export const SAVED_MESSAGE_LINES = 50;

/**
 * One region as stored. Deliberately *not* `RegionState`: the two now differ in the places that
 * matter most, and keeping them separate is what makes the difference a compile error here
 * rather than a surprise in someone's browser.
 *
 * - `tiles` is run-length encoded over a palette (MapCodec), because a region's grid is the one
 *   field that scales with map area and a city area has 36,864 of them.
 * - `explored` is a base64 bitmap, one bit per tile, for the same reason.
 * - `visible` is **absent**. It's this turn's field of view, recomputed by `recomputeFOV()` on
 *   load before anything can read it, so storing it would be writing down an answer we're about
 *   to recalculate anyway — and it was the single largest field in the file.
 */
export interface SavedRegion {
  name: string;
  arrival?: string;
  /** Including any `create` recipe, which is how an unentered interior survives a reload. */
  transitions: RegionTransition[];
  map: { width: number; height: number; tiles: EncodedTiles };
  daylight: boolean;
  patrolRoute?: Array<{ x: number; y: number }>;
  monsters: Monster[];
  groundItems: GroundItem[];
  npcs: Npc[];
  explored: string;
}

/**
 * The on-disk shape. Deliberately spelled out rather than "just JSON.stringify the GameState":
 * the save format is a contract with past versions of the game, and keeping it a separate type
 * is what makes an incompatible change to `GameState` show up as a type error here instead of as
 * a broken save in someone's browser.
 *
 * Whole tile grids are stored, not the seed that made them (an explicit v1 decision, still held):
 * a later change to the generator must not silently reshape a world someone is standing in. The
 * encoding above is what makes that affordable at city scale — it costs single-digit kilobytes
 * per region, against the ~20 bytes a seed would take and the fragility that would come with it.
 */
export interface SaveData {
  schemaVersion: number;
  savedAt: number;
  turnCount: number;
  player: Player;
  regions: Record<string, SavedRegion>;
  activeRegionId: string;
  messageLogTail: string[];
}

export function toSaveData(state: GameState): SaveData {
  const regions: Record<string, SavedRegion> = {};

  for (const [id, region] of Object.entries(state.regions)) {
    regions[id] = {
      name: region.name,
      ...(region.arrival ? { arrival: region.arrival } : {}),
      transitions: region.transitions,
      map: {
        width: region.map.width,
        height: region.map.height,
        tiles: encodeTiles(region.map.tiles),
      },
      daylight: region.daylight,
      ...(region.patrolRoute ? { patrolRoute: region.patrolRoute } : {}),
      monsters: region.monsters,
      groundItems: region.groundItems,
      npcs: region.npcs,
      explored: encodeBits(region.visibility.explored),
    };
  }

  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    savedAt: Date.now(),
    turnCount: state.turnCount,
    player: state.player,
    regions,
    activeRegionId: state.activeRegionId,
    messageLogTail: state.messageLog.slice(-SAVED_MESSAGE_LINES),
  };
}

/**
 * Rebuilds live state, or null if any region's encoded grid doesn't decode cleanly.
 *
 * Decoding is the one part of loading that can fail on input that already passed the structural
 * checks in `migrate`, so it gets the same answer they do: null, meaning a clean New Game.
 */
export function fromSaveData(save: SaveData): GameState | null {
  const regions: Record<string, RegionState> = {};

  for (const [id, saved] of Object.entries(save.regions)) {
    const { width, height } = saved.map;
    const area = width * height;

    const tiles = decodeTiles(saved.map.tiles, area);
    if (!tiles) return null;

    const explored = decodeBits(saved.explored, area);
    if (!explored) return null;

    regions[id] = {
      name: saved.name,
      ...(saved.arrival ? { arrival: saved.arrival } : {}),
      transitions: saved.transitions ?? [],
      map: { width, height, tiles },
      daylight: saved.daylight,
      ...(saved.patrolRoute ? { patrolRoute: saved.patrolRoute } : {}),
      monsters: saved.monsters,
      groundItems: saved.groundItems,
      npcs: saved.npcs,
      // `visible` starts empty and is filled by the recomputeFOV() that loadGame's caller runs
      // before the first frame. Anything reading it before then would see an unlit world, which
      // is the correct thing to see for a field of view that hasn't been computed yet.
      visibility: { width, height, visible: new Uint8Array(area), explored },
    };
  }

  return {
    player: save.player,
    regions,
    activeRegionId: save.activeRegionId,
    turnCount: save.turnCount,
    messageLog: [...save.messageLogTail],
    // A save is never written for a dead character (permadeath — see SaveGame.ts), so a restored
    // run is always a live one.
    gameOver: false,
  };
}

/**
 * Parses and validates raw stored text into a usable save, or returns null.
 *
 * Null is the *expected* outcome for anything unfamiliar — no save, truncated JSON, a save from
 * a newer or older schema, a half-written record. Every one of those falls back to a clean New
 * Game rather than loading a half-valid world and crashing three turns later. When a real
 * migration is eventually needed, this is where it goes: bump SAVE_SCHEMA_VERSION and convert
 * older versions here instead of rejecting them.
 */
export function migrate(raw: string | null): SaveData | null {
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isRecord(parsed)) return null;
  if (parsed['schemaVersion'] !== SAVE_SCHEMA_VERSION) return null;
  if (typeof parsed['turnCount'] !== 'number') return null;
  if (typeof parsed['activeRegionId'] !== 'string') return null;
  if (!Array.isArray(parsed['messageLogTail'])) return null;

  const player = parsed['player'];
  if (!isRecord(player) || typeof player['x'] !== 'number' || typeof player['y'] !== 'number') return null;
  if (typeof player['hp'] !== 'number' || player['hp'] <= 0) return null;
  if (!Array.isArray(player['inventory'])) return null;

  const regions = parsed['regions'];
  if (!isRecord(regions)) return null;

  const active = regions[parsed['activeRegionId']];
  if (!isRecord(active) || !isRegionShaped(active)) return null;
  for (const region of Object.values(regions)) {
    if (!isRecord(region) || !isRegionShaped(region)) return null;
  }

  return parsed as unknown as SaveData;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Structural checks only. Whether the encoded grid actually *decodes* to width x height tiles is
 * left to `fromSaveData`, which has to decode it anyway — checking it twice would mean writing
 * the run-length arithmetic in two places and keeping them agreeing.
 */
function isRegionShaped(region: Record<string, unknown>): boolean {
  const map = region['map'];
  if (!isRecord(map)) return false;
  if (typeof map['width'] !== 'number' || typeof map['height'] !== 'number') return false;

  const tiles = map['tiles'];
  if (!isRecord(tiles) || !Array.isArray(tiles['palette']) || !Array.isArray(tiles['runs'])) return false;

  if (typeof region['explored'] !== 'string') return false;
  if (typeof region['daylight'] !== 'boolean') return false;
  if (typeof region['name'] !== 'string' || !Array.isArray(region['transitions'])) return false;

  return Array.isArray(region['monsters']) && Array.isArray(region['groundItems']) && Array.isArray(region['npcs']);
}
