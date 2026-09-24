export interface MenuOption<T> {
  label: string;
  value: T;
  /** Optional keybinding shown right-aligned (e.g. "[w]"), so the direct key is discoverable. */
  hint?: string;
}

export interface MenuExtras {
  /** Static text drawn above the options — character sheet stats, help text, a death summary. */
  lines?: string[];
  /** Overrides the footer hint, for screens where Esc doesn't apply (e.g. the game-over screen). */
  footer?: string;
  /** Centers the overlay in the viewport — for the title and game-over screens, which are the
   * whole screen conceptually rather than a panel over a map you're still playing. */
  centered?: boolean;
}

const DEFAULT_FOOTER = 'Up/Down to select, Enter to confirm, Esc to close';

/**
 * A generic, reusable single-column selection menu — keyboard (Up/Down + Enter, driven by
 * InputManager while menu-mode is active) and mouse (click a row) both work. `open` is generic
 * per call (not the class), so one Menu instance/DOM container can be reused across unrelated
 * value types (inventory item ids, shop buy/sell actions, character sheet, title and game-over
 * screens) without needing a fresh instance each time. Which screen is showing, and what Esc
 * does, is ScreenManager's job — this class only draws what it's handed.
 */
export class Menu {
  private readonly container: HTMLElement;
  private readonly onDismiss: () => void;
  private options: MenuOption<unknown>[] = [];
  private onSelect: ((value: unknown) => void) | null = null;
  private selectedIndex = 0;
  private open_ = false;
  private title = '';
  private lines: string[] = [];
  private footer = DEFAULT_FOOTER;

  // Capture phase, so this runs before the click ever reaches the canvas (or anything else)
  // beneath it — clicking outside the menu dismisses it and does nothing else on that click.
  private readonly handleOutsideClick = (event: MouseEvent): void => {
    if (!this.open_) return;
    if (this.container.contains(event.target as Node)) return; // let the row's own handler run
    event.stopPropagation();
    this.onDismiss();
  };

  constructor(container: HTMLElement, onDismiss: () => void) {
    this.container = container;
    this.onDismiss = onDismiss;
    this.container.style.display = 'none';
    document.addEventListener('click', this.handleOutsideClick, true);
  }

  open<T>(
    title: string,
    options: MenuOption<T>[],
    onSelect: (value: T) => void,
    extras: MenuExtras = {},
  ): void {
    this.title = title;
    this.options = options as MenuOption<unknown>[];
    this.onSelect = onSelect as (value: unknown) => void;
    this.lines = extras.lines ?? [];
    this.footer = extras.footer ?? DEFAULT_FOOTER;
    this.container.classList.toggle('centered', extras.centered === true);
    this.selectedIndex = 0;
    this.open_ = true;
    this.draw();
  }

  close(): void {
    this.open_ = false;
    this.options = [];
    this.onSelect = null;
    this.container.style.display = 'none';
    this.container.innerHTML = '';
  }

  isOpen(): boolean {
    return this.open_;
  }

  /** Which row is highlighted — saved/restored by ScreenManager across a push/pop. */
  getSelectedIndex(): number {
    return this.selectedIndex;
  }

  setSelectedIndex(index: number): void {
    if (index < 0 || index >= this.options.length) return;
    this.selectedIndex = index;
    this.draw();
  }

  moveSelection(delta: number): void {
    if (!this.open_ || this.options.length === 0) return;
    this.selectedIndex = (this.selectedIndex + delta + this.options.length) % this.options.length;
    this.draw();
  }

  confirmSelection(): void {
    if (!this.open_) return;
    const option = this.options[this.selectedIndex];
    if (option) this.onSelect?.(option.value);
  }

  private draw(): void {
    this.container.style.display = 'block';
    this.container.innerHTML = '';

    const heading = document.createElement('div');
    heading.className = 'menu-title';
    heading.textContent = this.title;
    this.container.appendChild(heading);

    for (const line of this.lines) {
      const row = document.createElement('div');
      row.className = 'menu-line';
      // Non-breaking space so runs of padding survive HTML whitespace collapsing — the sheet's
      // column alignment is built with padEnd, not with CSS.
      row.textContent = line.length > 0 ? line : '\u00a0';
      this.container.appendChild(row);
    }

    if (this.options.length === 0 && this.lines.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'menu-empty';
      empty.textContent = '(nothing here)';
      this.container.appendChild(empty);
    }

    this.options.forEach((option, i) => {
      const row = document.createElement('div');
      row.className = i === this.selectedIndex ? 'menu-option selected' : 'menu-option';

      const label = document.createElement('span');
      label.className = 'menu-option-label';
      label.textContent = option.label;
      row.appendChild(label);

      if (option.hint) {
        const hint = document.createElement('span');
        hint.className = 'menu-option-hint';
        hint.textContent = option.hint;
        row.appendChild(hint);
      }

      row.addEventListener('click', () => {
        this.selectedIndex = i;
        this.confirmSelection();
      });
      this.container.appendChild(row);
    });

    const hint = document.createElement('div');
    hint.className = 'menu-hint';
    hint.textContent = this.footer;
    this.container.appendChild(hint);
  }
}
