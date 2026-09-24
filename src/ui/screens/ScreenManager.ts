import type { Menu, MenuOption } from '../menus/Menu';

export interface Screen<T> {
  title: string;
  /** Static text drawn above the options (character sheet, help, death summary). */
  lines?: string[];
  options: MenuOption<T>[];
  onSelect?: (value: T) => void;
  /**
   * Whether Esc / clicking outside pops this screen. False for screens the player must answer —
   * the title screen and the game-over screen, where dismissing would leave them staring at a
   * world they can't act in.
   */
  dismissable?: boolean;
  /** Overrides the footer hint line. */
  footer?: string;
  /** Draws this screen centered in the viewport instead of as a corner panel. */
  centered?: boolean;
}

interface StoredScreen {
  title: string;
  lines?: string[];
  options: MenuOption<unknown>[];
  onSelect: (value: unknown) => void;
  dismissable: boolean;
  footer?: string;
  centered?: boolean;
  /** Where the cursor was when this screen was covered, so popping back lands on the same row. */
  selectedIndex: number;
}

/**
 * A stack of overlay screens on top of the map.
 *
 * Every screen is drawn by the single shared `Menu` instance; the stack lives here. Stacking (as
 * opposed to just replacing what's on screen) is what lets Esc walk *back* — open the command
 * menu, step into Inventory, press Esc, and you're on the command menu again rather than dumped
 * back onto the map. Actions that actually do something in the world call `closeAll()` instead,
 * since after equipping a sword you want the map back, not a menu you've finished with.
 *
 * It also owns the one invariant that used to be duplicated at every menu call site in Game:
 * input is in menu mode exactly when the stack is non-empty.
 */
export class ScreenManager {
  private readonly menu: Menu;
  private readonly setMenuActive: (active: boolean) => void;
  private readonly onChange: () => void;
  private readonly stack: StoredScreen[] = [];

  constructor(menu: Menu, setMenuActive: (active: boolean) => void, onChange: () => void) {
    this.menu = menu;
    this.setMenuActive = setMenuActive;
    this.onChange = onChange;
  }

  push<T>(screen: Screen<T>): void {
    // Remember where the cursor was on the screen we're about to cover, so Esc comes back to the
    // row the player was on rather than jumping to the top of the list.
    const covered = this.top();
    if (covered) covered.selectedIndex = this.menu.getSelectedIndex();

    this.stack.push({
      title: screen.title,
      lines: screen.lines,
      options: screen.options as MenuOption<unknown>[],
      onSelect: (screen.onSelect ?? (() => this.pop())) as (value: unknown) => void,
      dismissable: screen.dismissable ?? true,
      footer: screen.footer,
      centered: screen.centered,
      selectedIndex: 0,
    });
    this.sync();
  }

  /** Replaces the whole stack with one screen — for switching between title/game-over/play. */
  replace<T>(screen: Screen<T>): void {
    this.stack.length = 0;
    this.push(screen);
  }

  pop(): void {
    this.stack.pop();
    this.sync();
  }

  closeAll(): void {
    this.stack.length = 0;
    this.sync();
  }

  /** Esc, or a click outside the overlay. Honors the top screen's `dismissable` flag. */
  dismiss(): void {
    const top = this.top();
    if (!top) return;
    if (!top.dismissable) {
      this.onChange();
      return;
    }
    this.pop();
  }

  isOpen(): boolean {
    return this.stack.length > 0;
  }

  moveSelection(delta: number): void {
    this.menu.moveSelection(delta);
  }

  confirmSelection(): void {
    this.menu.confirmSelection();
  }

  private top(): StoredScreen | undefined {
    return this.stack[this.stack.length - 1];
  }

  private sync(): void {
    const top = this.top();
    if (!top) {
      this.menu.close();
      this.setMenuActive(false);
    } else {
      this.menu.open(top.title, top.options, top.onSelect, {
        lines: top.lines,
        footer: top.footer,
        centered: top.centered,
      });
      this.menu.setSelectedIndex(top.selectedIndex);
      this.setMenuActive(true);
    }
    this.onChange();
  }
}
