import type { GameMapData } from '../world/GameMap';
import type { Player } from '../entities/Player';
import type { Monster } from '../entities/Monster';
import type { Npc } from '../entities/Npc';
import type { VisibilityData } from '../fov/VisibilityState';
import type { GroundItem } from '../items/Item';
import { isVisible } from '../fov/VisibilityState';
import { chebyshevDistance } from '../utils/geometry';
import { computeSpotRadius } from '../combat/CombatFormulas';

/** Everything specific to one region (the overworld, a dungeon level, ...). */
export interface RegionState {
  map: GameMapData;
  /** Lit by the sun: sight is limited by terrain rather than by how far a torch throws. */
  daylight: boolean;
  /**
   * Waypoints along the road, in order. Patrols walk it, which is what makes them meet each other
   * — two groups wandering at random would almost never collide on a map this size.
   */
  patrolRoute?: Array<{ x: number; y: number }>;
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
  /**
   * Transient (not saved): whether messages are still accumulating onto the current line.
   * Everything that happens in response to one player action belongs on one line — your swing
   * and the answering blow read as an exchange, not as two unrelated events.
   */
  messageGroupOpen?: boolean;
}

const MAX_MESSAGE_LOG = 200;

/** Past this, a busy turn starts a fresh line rather than running off the edge of the log. */
const MAX_GROUPED_LINE = 160;

export function addMessage(state: GameState, message: string): void {
  const last = state.messageLog[state.messageLog.length - 1];

  if (state.messageGroupOpen && last !== undefined && last.length + message.length + 1 <= MAX_GROUPED_LINE) {
    state.messageLog[state.messageLog.length - 1] = `${last} ${message}`;
  } else {
    state.messageLog.push(message);
    state.messageGroupOpen = true;
  }

  if (state.messageLog.length > MAX_MESSAGE_LOG) {
    state.messageLog.shift();
  }
}

/**
 * Starts a fresh log line. Called when the player does something new, rather than at the end of a
 * turn — that way anything the world does in reply stays attached to what provoked it, and a
 * failed action that consumed no turn doesn't leave the line hanging open for the next one.
 */
export function endMessageGroup(state: GameState): void {
  state.messageGroupOpen = false;
}

/**
 * Whether the player can make out a *thing* at (x, y) — a creature, an item on the ground — as
 * opposed to merely seeing the ground there. In the dark the two are the same question; in
 * daylight you can see terrain to the horizon and still not tell what that shape is (see
 * computeSpotRadius).
 */
export function canSpot(state: GameState, x: number, y: number): boolean {
  const region = getActiveRegion(state);
  if (!isVisible(region.visibility, x, y)) return false;
  if (!region.daylight) return true;
  return chebyshevDistance(state.player, { x, y }) <= computeSpotRadius(state.player.special.perception);
}

export function getActiveRegion(state: GameState): RegionState {
  const region = state.regions[state.activeRegionId];
  if (!region) throw new Error(`Unknown active region: ${state.activeRegionId}`);
  return region;
}
