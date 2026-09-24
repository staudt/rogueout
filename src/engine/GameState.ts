import type { GameMapData } from '../world/GameMap';
import type { Player } from '../entities/Player';
import type { Monster } from '../entities/Monster';
import type { Npc } from '../entities/Npc';
import type { VisibilityData } from '../fov/VisibilityState';
import type { GroundItem } from '../items/Item';

/** Everything specific to one region (the overworld, a dungeon level, ...). */
export interface RegionState {
  map: GameMapData;
  monsters: Monster[];
  groundItems: GroundItem[];
  npcs: Npc[];
  visibility: VisibilityData;
}

/**
 * Central mutable game state. Plain POJO — kept serializable for save/load. The overworld (town
 * + wilderness) is one seamless region; only genuinely separate places — dungeon levels — are
 * their own linked region (see CLAUDE.md). `regions` holds the mutable state for every region
 * visited so far, lazily populated via RegionRegistry.ensureRegionLoaded.
 */
export interface GameState {
  player: Player;
  regions: Record<string, RegionState>;
  activeRegionId: string;
  turnCount: number;
  messageLog: string[];
  gameOver: boolean;
}

const MAX_MESSAGE_LOG = 200;

export function addMessage(state: GameState, message: string): void {
  state.messageLog.push(message);
  if (state.messageLog.length > MAX_MESSAGE_LOG) {
    state.messageLog.shift();
  }
}

export function getActiveRegion(state: GameState): RegionState {
  const region = state.regions[state.activeRegionId];
  if (!region) throw new Error(`Unknown active region: ${state.activeRegionId}`);
  return region;
}
