import type { GameState, RegionState } from '../engine/GameState';
import type { Player } from '../entities/Player';

export const SAVE_SCHEMA_VERSION = 1;

/** How many trailing log lines a save keeps — enough to remember what you were doing. */
export const SAVED_MESSAGE_LINES = 50;

/**
 * The on-disk shape. Deliberately spelled out rather than "just JSON.stringify the GameState":
 * the save format is a contract with past versions of the game, and keeping it a separate type
 * is what makes an incompatible change to `GameState` show up as a type error here instead of as
 * a broken save in someone's browser.
 *
 * Whole tile grids are stored, not the seed that made them (an explicit v1 decision): a later
 * change to the generator must not silently reshape a world someone is standing in.
 */
export interface SaveData {
  schemaVersion: number;
  savedAt: number;
  turnCount: number;
  player: Player;
  regions: Record<string, RegionState>;
  activeRegionId: string;
  messageLogTail: string[];
}

export function toSaveData(state: GameState): SaveData {
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    savedAt: Date.now(),
    turnCount: state.turnCount,
    player: state.player,
    regions: state.regions,
    activeRegionId: state.activeRegionId,
    messageLogTail: state.messageLog.slice(-SAVED_MESSAGE_LINES),
  };
}

export function fromSaveData(save: SaveData): GameState {
  return {
    player: save.player,
    regions: save.regions,
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

function isRegionShaped(region: Record<string, unknown>): boolean {
  const map = region['map'];
  if (!isRecord(map)) return false;
  if (typeof map['width'] !== 'number' || typeof map['height'] !== 'number') return false;
  if (!Array.isArray(map['tiles']) || map['tiles'].length !== map['width'] * map['height']) return false;

  const visibility = region['visibility'];
  if (!isRecord(visibility) || !Array.isArray(visibility['explored'])) return false;

  return Array.isArray(region['monsters']) && Array.isArray(region['groundItems']) && Array.isArray(region['npcs']);
}
