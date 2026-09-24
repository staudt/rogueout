import type { Direction } from '../utils/geometry';
import { DIAGONAL_CHORD_WINDOW_MS } from '../config/constants';
import { KeyChordDetector, type ArrowKey } from './KeyChordDetector';

const ARROW_KEYS: ReadonlySet<string> = new Set<ArrowKey>([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
]);

function isArrowKey(key: string): key is ArrowKey {
  return ARROW_KEYS.has(key);
}

/**
 * NetHack-standard single-key commands: , pick up, w wield, W wear, q quaff, i inventory,
 * f fire, . wait, > descend, < climb. `C` (character sheet) is not a NetHack key — NetHack uses
 * ^X — but a plain letter is friendlier and ^X is awkward to type in a browser.
 */
export type ActionKey =
  | ','
  | 'w'
  | 'W'
  | 'q'
  | 'i'
  | 'f'
  | '.'
  | '>'
  | '<'
  | 'C'
  | 'k'
  | 'g'
  | 'd'
  | 't'
  | ';';
const ACTION_KEYS: ReadonlySet<string> = new Set<ActionKey>([
  ',',
  'w',
  'W',
  'q',
  'i',
  'f',
  '.',
  '>',
  '<',
  'C',
  'k', // kick
  'g', // go: travel in a direction until something happens
  'd', // drop
  't', // throw
  ';', // look: what is that?
]);

function isActionKey(key: string): key is ActionKey {
  return ACTION_KEYS.has(key);
}

export interface InputCallbacks {
  /** Movement/attack — only dispatched while no menu is active. */
  onDirection: (direction: Direction) => void;
  /** Quick-action keybindings (,/w/W/q/i/f) — only dispatched while no menu is active. */
  onAction: (key: ActionKey) => void;
  /** Enter, while no menu is active — opens the discoverable command menu. */
  onOpenMenu: () => void;
  /** Escape, while no menu is active — opens the game menu (character sheet, help, title). */
  onOpenGameMenu: () => void;
  /** Look mode: the cursor moves instead of the player. */
  onLookMove: (direction: Direction) => void;
  onLookConfirm: () => void;
  onLookCancel: () => void;
  onMenuUp: () => void;
  onMenuDown: () => void;
  onMenuConfirm: () => void;
  onMenuClose: () => void;
}

/**
 * Wires DOM keyboard events into either movement (KeyChordDetector) or menu navigation,
 * depending on setMenuActive. Mouse input joins here in M7.
 */
export class InputManager {
  private readonly detector: KeyChordDetector;
  private readonly callbacks: InputCallbacks;
  private menuActive = false;
  private directionPrompt: ((direction: Direction | null) => void) | null = null;
  private lookActive = false;

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    // Look mode owns Enter and Escape; arrows reach it through the chord detector, so the cursor
    // moves diagonally exactly the way the player does.
    if (this.lookActive && !isArrowKey(event.key)) {
      if (event.key === 'Enter' || event.key === ';') {
        event.preventDefault();
        this.callbacks.onLookConfirm();
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        this.callbacks.onLookCancel();
        return;
      }
    }

    if (this.menuActive) {
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        this.callbacks.onMenuUp();
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        this.callbacks.onMenuDown();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        this.callbacks.onMenuConfirm();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        this.callbacks.onMenuClose();
      }
      return;
    }

    if (isArrowKey(event.key)) {
      event.preventDefault();
      this.detector.onKeyDown(event.key, event.repeat);
      return;
    }

    if (event.repeat) return;

    // While a direction is pending, every other key cancels it rather than doing its own thing.
    if (this.directionPrompt) {
      event.preventDefault();
      const prompt = this.directionPrompt;
      this.directionPrompt = null;
      prompt(null);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      this.callbacks.onOpenMenu();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      this.callbacks.onOpenGameMenu();
      return;
    }

    if (isActionKey(event.key)) {
      event.preventDefault();
      this.callbacks.onAction(event.key);
    }
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    // Always forward key-ups to the detector, even while a menu is active — its internal
    // held-key bookkeeping must track real physical key state regardless of game mode, or a
    // key released while a menu happens to be open (e.g. the chord window elapsed and fired a
    // move that opened a shop, all before the key was physically released) gets "stuck" held
    // forever, silently cancelling its opposite direction on every future press. Whether the
    // resulting direction actually does anything is gated separately, in the detector's callback.
    if (isArrowKey(event.key)) {
      this.detector.onKeyUp(event.key);
    }
  };

  constructor(callbacks: InputCallbacks) {
    this.callbacks = callbacks;
    this.detector = new KeyChordDetector((direction) => {
      // A pending "which way?" swallows the next direction instead of moving. Routed through the
      // chord detector rather than raw key-downs so kicking or throwing diagonally works exactly
      // like walking diagonally does.
      const prompt = this.directionPrompt;
      if (prompt) {
        this.directionPrompt = null;
        prompt(direction);
        return;
      }
      if (this.lookActive) {
        callbacks.onLookMove(direction);
        return;
      }
      if (!this.menuActive) callbacks.onDirection(direction);
    }, DIAGONAL_CHORD_WINDOW_MS);
  }

  /**
   * Asks for a direction: the next movement input is delivered to `resolve` instead of moving the
   * player, and Escape delivers null. Shared by kick, throw and travel-in-a-direction.
   */
  promptDirection(resolve: (direction: Direction | null) => void): void {
    this.directionPrompt = resolve;
  }

  isAwaitingDirection(): boolean {
    return this.directionPrompt !== null;
  }

  setLookActive(active: boolean): void {
    this.lookActive = active;
  }

  isLookActive(): boolean {
    return this.lookActive;
  }

  /** Switches between movement/action-key dispatch and menu-navigation dispatch. */
  setMenuActive(active: boolean): void {
    this.menuActive = active;
  }

  isMenuActive(): boolean {
    return this.menuActive;
  }

  attach(target: Window): void {
    target.addEventListener('keydown', this.handleKeyDown);
    target.addEventListener('keyup', this.handleKeyUp);
  }

  detach(target: Window): void {
    target.removeEventListener('keydown', this.handleKeyDown);
    target.removeEventListener('keyup', this.handleKeyUp);
  }
}
