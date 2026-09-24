import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InputManager } from '../src/input/InputManager';
import type { Direction } from '../src/utils/geometry';

function dispatchKey(type: 'keydown' | 'keyup', key: string, repeat = false): void {
  window.dispatchEvent(new KeyboardEvent(type, { key, repeat }));
}

describe('InputManager: menu-open key-up desync (regression)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not strand a key as "held" when a menu opens before it is physically released', () => {
    // Reproduces: walk toward an NPC, the chord window elapses and fires the move (which opens
    // a shop) *before* the physical key is released, then the key is released while the menu is
    // still open. The opposite direction must still work afterward, not be silently cancelled.
    const directions: Direction[] = [];
    let input!: InputManager;

    input = new InputManager({
      onDirection: (direction) => {
        directions.push(direction);
        if (direction === 'E') input.setMenuActive(true); // simulates bumping an NPC and opening a shop
      },
      onAction: () => {},
      onOpenMenu: () => {},
      onOpenGameMenu: () => {},
      onLookMove: () => {},
      onLookConfirm: () => {},
      onLookCancel: () => {},
      onMenuUp: () => {},
      onMenuDown: () => {},
      onMenuConfirm: () => {},
      onMenuClose: () => input.setMenuActive(false),
    });
    input.attach(window);

    dispatchKey('keydown', 'ArrowRight');
    vi.advanceTimersByTime(50); // chord window elapses -> emits 'E' -> opens the "menu"
    expect(directions).toEqual(['E']);

    dispatchKey('keyup', 'ArrowRight'); // physical release, but only now, while the menu is open

    dispatchKey('keydown', 'Escape'); // closes the menu

    dispatchKey('keydown', 'ArrowLeft');
    vi.advanceTimersByTime(50);
    dispatchKey('keyup', 'ArrowLeft');

    expect(directions).toEqual(['E', 'W']);

    input.detach(window);
  });

  it('ignores directions while a menu is active, without corrupting chord state for later', () => {
    const directions: Direction[] = [];
    const input = new InputManager({
      onDirection: (direction) => directions.push(direction),
      onAction: () => {},
      onOpenMenu: () => {},
      onOpenGameMenu: () => {},
      onLookMove: () => {},
      onLookConfirm: () => {},
      onLookCancel: () => {},
      onMenuUp: () => {},
      onMenuDown: () => {},
      onMenuConfirm: () => {},
      onMenuClose: () => {},
    });
    input.attach(window);
    input.setMenuActive(true);

    dispatchKey('keydown', 'ArrowUp');
    vi.advanceTimersByTime(50);
    dispatchKey('keyup', 'ArrowUp');
    expect(directions).toEqual([]); // suppressed while menu active

    input.setMenuActive(false);
    dispatchKey('keydown', 'ArrowUp');
    vi.advanceTimersByTime(50);
    dispatchKey('keyup', 'ArrowUp');
    expect(directions).toEqual(['N']); // works normally once the menu closes

    input.detach(window);
  });
});
