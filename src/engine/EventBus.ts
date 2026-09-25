import type { Npc } from '../entities/Npc';
import type { Provokable } from '../ai/Actors';

/**
 * Decouples systems from each other (e.g. UI reacting to state changes without TurnManager
 * knowing the UI exists). `Events` maps event names to their payload type.
 */
export interface GameEvents {
  'turn-ended': { turnCount: number };
  'entity-died': { entityId: string };
  'item-broke': { itemId: string };
  'region-changed': { regionId: string };
  'npc-interacted': { npc: Npc };
  /** Walked into something that has no quarrel with you: ask before starting one. */
  'attack-prompted': { target: Provokable };
  [event: string]: unknown;
}

type Listener<T> = (payload: T) => void;

export class EventBus<Events extends Record<string, unknown>> {
  private listeners: { [K in keyof Events]?: Listener<Events[K]>[] } = {};

  on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    const list = (this.listeners[event] ??= []);
    list.push(listener);
    return () => {
      this.listeners[event] = list.filter((l) => l !== listener);
    };
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const list = this.listeners[event];
    if (!list) return;
    for (const listener of list) listener(payload);
  }
}
