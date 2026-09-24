import { beforeEach, describe, expect, it } from 'vitest';
import { Menu } from '../src/ui/menus/Menu';
import { ScreenManager } from '../src/ui/screens/ScreenManager';

function setup() {
  const container = document.createElement('div');
  document.body.appendChild(container);

  const menuActive: boolean[] = [];
  let renders = 0;
  const menu = new Menu(container, () => screens.dismiss());
  const screens = new ScreenManager(
    menu,
    (active) => menuActive.push(active),
    () => {
      renders++;
    },
  );

  return { container, menu, screens, menuActive, renderCount: () => renders };
}

function titles(container: HTMLElement): string | null {
  return container.querySelector('.menu-title')?.textContent ?? null;
}

describe('ScreenManager', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('stacks screens so Esc walks back one level at a time', () => {
    const { container, screens } = setup();

    screens.push({ title: 'Command', options: [{ label: 'Inventory', value: 'inv' }] });
    expect(titles(container)).toBe('Command');

    screens.push({ title: 'Inventory', options: [] });
    expect(titles(container)).toBe('Inventory');

    screens.dismiss();
    expect(titles(container)).toBe('Command'); // back to the menu we came from, not the map

    screens.dismiss();
    expect(screens.isOpen()).toBe(false);
  });

  it('keeps input menu-mode in sync with the stack being non-empty', () => {
    const { screens, menuActive } = setup();

    screens.push({ title: 'A', options: [] });
    screens.push({ title: 'B', options: [] });
    expect(menuActive).toEqual([true, true]);

    screens.dismiss();
    expect(menuActive).toEqual([true, true, true]); // still one screen open

    screens.dismiss();
    expect(menuActive[menuActive.length - 1]).toBe(false);
  });

  it('closeAll drops the whole stack in one go', () => {
    const { screens, menuActive } = setup();
    screens.push({ title: 'A', options: [] });
    screens.push({ title: 'B', options: [] });

    screens.closeAll();

    expect(screens.isOpen()).toBe(false);
    expect(menuActive[menuActive.length - 1]).toBe(false);
  });

  it('refuses to dismiss a non-dismissable screen', () => {
    // The title and game-over screens: dismissing would leave the player staring at a world
    // they cannot act in.
    const { container, screens } = setup();
    screens.push({ title: 'You have died.', options: [], dismissable: false });

    screens.dismiss();

    expect(screens.isOpen()).toBe(true);
    expect(titles(container)).toBe('You have died.');
  });

  it('replace swaps the entire stack rather than layering on top of it', () => {
    const { container, screens } = setup();
    screens.push({ title: 'Command', options: [] });
    screens.push({ title: 'Inventory', options: [] });

    screens.replace({ title: 'You have died.', options: [], dismissable: false });

    expect(titles(container)).toBe('You have died.');
    screens.pop();
    expect(screens.isOpen()).toBe(false); // nothing left underneath
  });

  it('confirming a screen without an onSelect just pops it (read-only screens)', () => {
    const { container, screens } = setup();
    screens.push({ title: 'Command', options: [] });
    screens.push({ title: 'Inventory', options: [{ label: 'a rock', value: 'rock' }] });

    screens.confirmSelection();

    expect(titles(container)).toBe('Command');
  });

  it('renders static lines above the options', () => {
    const { container, screens } = setup();
    screens.push({ title: 'Controls', lines: ['MOVEMENT', '', '  Arrows   step'], options: [] });

    const lines = [...container.querySelectorAll('.menu-line')].map((el) => el.textContent);
    expect(lines).toEqual(['MOVEMENT', ' ', '  Arrows   step']);
  });

  it('clicking outside the overlay dismisses the top screen', () => {
    const { screens } = setup();
    screens.push({ title: 'Command', options: [] });

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(screens.isOpen()).toBe(false);
  });
});

describe('ScreenManager selection memory', () => {
  it('returns the cursor to the row you left from when a screen is popped', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const menu = new Menu(container, () => screens.dismiss());
    const screens = new ScreenManager(
      menu,
      () => {},
      () => {},
    );

    screens.push({
      title: 'Command',
      options: [
        { label: 'Inventory', value: 'inv' },
        { label: 'Wield', value: 'wield' },
        { label: 'Wear', value: 'wear' },
      ],
    });
    screens.moveSelection(2); // sit on "Wear"
    screens.push({ title: 'Wear what?', options: [] });

    screens.dismiss();

    expect(menu.getSelectedIndex()).toBe(2);
    expect(container.querySelector('.menu-option.selected')?.textContent).toContain('Wear');
  });
});
