/**
 * The controls reference, shown from the game menu (Esc). Kept here as data rather than inline in
 * Game so there's one place to update when a keybinding changes — and so it stays in step with
 * InputManager's ActionKey list, which is the actual source of truth for what the keys do.
 */
export const HELP_LINES: readonly string[] = [
  'MOVEMENT',
  '  Arrow keys        step N/S/E/W',
  '  Two arrows        diagonal (hold both briefly)',
  '  Click a tile      step/attack adjacent, or travel there',
  '  .                 wait one turn',
  '',
  'ACTIONS',
  '  Enter             command menu (shows every key)',
  '  ,                 pick up',
  '  i                 inventory',
  '  w / W             wield weapon / wear armor',
  '  q                 quaff or use an item',
  '  f                 fire (no ranged weapons yet)',
  '  > / <             descend / climb a staircase',
  '',
  'SCREENS',
  '  C                 character sheet',
  '  Esc               game menu, or close the current screen',
  '',
  'Walk into a monster to attack it, into a townsfolk to talk.',
  '',
  'Your run saves itself every turn. Esc > Save and quit to stop,',
  'then Continue on the title screen to pick it up again.',
  'Death is permanent, and erases the save.',
];
