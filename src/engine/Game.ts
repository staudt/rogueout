import { createPlayer, recomputePlayerCombatStats } from '../entities/Player';
import { createRNG } from '../utils/RNG';
import { chebyshevDistance, directionBetween, DIRECTION_VECTORS, type Point } from '../utils/geometry';
import { joinWithAnd, withArticle } from '../utils/text';
import { createItem } from '../items/Item';
import { ITEMS } from '../items/ItemData';
import { MONSTERS } from '../entities/MonsterData';
import { addItem, consumeOne, removeItem } from '../items/Inventory';
import { SHOPS } from '../world/ShopData';
import type { Npc } from '../entities/Npc';
import { ensureRegionLoaded, REGIONS } from '../world/regions/RegionRegistry';
import { OVERWORLD_SPAWN } from '../world/maps/overworld';
import { isWalkable } from '../world/GameMap';
import { isExplored, isVisible } from '../fov/VisibilityState';
import { findPath } from '../pathfinding/BFS';
import { walkableLineToward } from '../pathfinding/StraightLine';
import { AutoTravel } from '../pathfinding/AutoTravel';
import type { GameState, RegionState } from './GameState';
import { addMessage, getActiveRegion } from './GameState';
import { EventBus, type GameEvents } from './EventBus';
import { TurnManager } from './TurnManager';
import { InputManager, type ActionKey } from '../input/InputManager';
import { MouseInput } from '../input/MouseInput';
import { AUTO_TRAVEL_STEP_MS } from '../config/constants';
import { Camera } from '../ui/Camera';
import { Renderer } from '../ui/Renderer';
import { MessageLog } from '../ui/MessageLog';
import { StatusBar } from '../ui/StatusBar';
import { Menu, type MenuOption } from '../ui/menus/Menu';
import { createLocalStorageAdapter, type SaveStorage } from '../persistence/LocalStorageAdapter';
import { clearSave, hasSave, loadGame, saveGame } from '../persistence/SaveGame';
import { ScreenManager } from '../ui/screens/ScreenManager';
import { describeCharacter } from '../ui/screens/CharacterSheet';
import { HELP_LINES } from '../ui/screens/HelpText';

type ShopAction =
  | { kind: 'buy'; defId: string; price: number }
  | { kind: 'sell'; itemId: string; price: number };

type CommandAction =
  | 'pickup'
  | 'descend'
  | 'climb'
  | 'inventory'
  | 'wield'
  | 'wear'
  | 'use'
  | 'fire'
  | 'wait'
  | 'character';

type TitleAction = 'continue' | 'new-game' | 'controls';
type GameMenuAction = 'character' | 'controls' | 'save-quit' | 'abandon';

/** Top-level orchestrator: owns state and wires input -> turn resolution -> render. */
export class Game {
  // state/turnManager are rebuilt by startNewGame() — including from the game-over screen — so
  // they can't be readonly or constructor-assigned. Everything that outlives a run (renderer,
  // input, screens) is built once, in the constructor.
  private state!: GameState;
  private turnManager!: TurnManager;
  private readonly events = new EventBus<GameEvents>();
  private readonly renderer: Renderer;
  private readonly messageLog: MessageLog;
  private readonly statusBar: StatusBar;
  private readonly menu: Menu;
  private readonly screens: ScreenManager;
  private readonly input: InputManager;
  private readonly mouseInput: MouseInput;
  private readonly autoTravel = new AutoTravel();
  private autoTravelTimerId: number | null = null;
  /** Set when auto-travel is heading toward a tile *adjacent to* an NPC, to interact on arrival. */
  private pendingInteractTarget: Point | null = null;
  /** Guards against pushing the game-over screen more than once for the same death. */
  private gameOverShown = false;
  private resizeFrameId: number | null = null;
  private readonly storage: SaveStorage;

  constructor(
    canvas: HTMLCanvasElement,
    messageLogEl: HTMLElement,
    menuEl: HTMLElement,
    statusBarEl: HTMLElement,
    storage: SaveStorage = createLocalStorageAdapter(),
  ) {
    this.storage = storage;
    const camera = new Camera();
    this.renderer = new Renderer(canvas, camera);
    this.messageLog = new MessageLog(messageLogEl);
    this.statusBar = new StatusBar(statusBarEl);
    this.menu = new Menu(menuEl, () => this.screens.dismiss());
    this.screens = new ScreenManager(
      this.menu,
      (active) => this.input.setMenuActive(active),
      () => this.render(),
    );

    this.events.on('npc-interacted', ({ npc }) => this.handleNpcInteraction(npc));
    // Death is set deep inside monster AI, so both the game-over screen and the save are driven
    // off the turn ending rather than from every call site that might have been the fatal one.
    this.events.on('turn-ended', () => this.onTurnEnded());

    this.input = new InputManager({
      onDirection: (direction) => {
        this.cancelAutoTravel();
        this.turnManager.tryMovePlayer(direction);
        this.render();
      },
      onAction: (key) => {
        this.cancelAutoTravel();
        this.handleAction(key);
      },
      onOpenMenu: () => {
        this.cancelAutoTravel();
        this.openCommandMenu();
      },
      onOpenGameMenu: () => {
        this.cancelAutoTravel();
        this.openGameMenu();
      },
      onMenuUp: () => this.screens.moveSelection(-1),
      onMenuDown: () => this.screens.moveSelection(1),
      onMenuConfirm: () => this.screens.confirmSelection(),
      onMenuClose: () => this.screens.dismiss(),
    });

    this.mouseInput = new MouseInput(canvas, camera, (target) => this.handleMapClick(target));

    this.resetState();
  }

  /** Builds a fresh run: new world state, new turn manager, clean log. */
  private resetState(): void {
    this.cancelAutoTravel();

    const regions: Record<string, RegionState> = {};
    ensureRegionLoaded(regions, 'overworld');

    this.adoptState({
      player: createPlayer(OVERWORLD_SPAWN.x, OVERWORLD_SPAWN.y),
      regions,
      activeRegionId: 'overworld',
      turnCount: 0,
      messageLog: [],
      gameOver: false,
    });

    addMessage(this.state, 'A new day begins.');
  }

  /** Points the game at a state — freshly made or freshly loaded — and rebuilds what hangs off it. */
  private adoptState(state: GameState): void {
    this.state = state;
    this.gameOverShown = false;
    this.turnManager = new TurnManager(this.state, this.events, createRNG(Date.now()));
    this.turnManager.recomputeFOV();
  }

  start(): void {
    this.input.attach(window);
    this.mouseInput.attach();
    this.observeViewportSize();
    this.render();
    this.showTitleScreen();

    // Dev-only inspection hook for manual/E2E testing — stripped from production builds by Vite
    // since import.meta.env.DEV is statically false there (dead-code-eliminated, not just hidden).
    if (import.meta.env.DEV) {
      (window as unknown as { __gameDebug: unknown }).__gameDebug = {
        getState: () => this.state,
        getActiveRegion: () => getActiveRegion(this.state),
      };
    }
  }

  private handleMapClick(target: Point): void {
    if (this.state.gameOver || this.screens.isOpen()) return;
    this.cancelAutoTravel();

    const player = this.state.player;
    const distance = chebyshevDistance(player, target);
    if (distance === 0) return;

    if (distance === 1) {
      const direction = directionBetween(player, target);
      if (direction) {
        this.turnManager.tryMovePlayer(direction);
        this.render();
      }
      return;
    }

    const region = getActiveRegion(this.state);
    const npcAtTarget = region.npcs.find((n) => n.x === target.x && n.y === target.y);
    if (npcAtTarget) {
      this.travelToInteract(target);
      return;
    }

    const isPassable = this.isPassableIn(region);
    const path = findPath(player, target, isPassable);
    if (path && path.length > 0) {
      this.autoTravel.start(path);
      this.stepAutoTravel();
      return;
    }

    // A wall they can already see is a deliberate click on a wall: do nothing, say nothing.
    if (isExplored(region.visibility, target.x, target.y) && !isWalkable(region.map, target.x, target.y)) {
      return;
    }

    // No route. Head straight at it and stop at whatever is in the way — predictable, unlike
    // routing to the nearest reachable tile, which can march you the long way round a lake and
    // leave you somewhere you never pointed at. No message either: where you stop shows why.
    const direct = walkableLineToward(player, target, isPassable);
    if (direct.length === 0) return;

    this.autoTravel.start(direct);
    this.stepAutoTravel();
  }

  /** Clicking an NPC from a distance walks to whichever adjacent tile is closest, then interacts. */
  private travelToInteract(targetPos: Point): void {
    const region = getActiveRegion(this.state);
    const isPassable = this.isPassableIn(region);

    let bestPath: Point[] | null = null;
    for (const vector of Object.values(DIRECTION_VECTORS)) {
      const candidate = { x: targetPos.x + vector.x, y: targetPos.y + vector.y };
      if (!isPassable(candidate.x, candidate.y)) continue;
      const path = findPath(this.state.player, candidate, isPassable);
      if (path && (!bestPath || path.length < bestPath.length)) bestPath = path;
    }

    if (!bestPath) {
      addMessage(this.state, "You can't find a path there.");
      this.render();
      return;
    }

    this.pendingInteractTarget = targetPos;
    this.autoTravel.start(bestPath);
    this.stepAutoTravel();
  }

  /**
   * Whether a tile is a valid travel waypoint. Deliberately NOT gated on exploration — the full
   * map already exists in memory (fog-of-war is a rendering/discovery concept, not a data
   * limitation, see CLAUDE.md), so travel routes around known walls intelligently even when
   * heading toward unexplored ground. The "stop the moment something appears" interrupts in
   * stepAutoTravel are what keep this from feeling omniscient, not withholding wall data.
   */
  private isPassableIn(region: RegionState): (x: number, y: number) => boolean {
    return (x, y) =>
      isWalkable(region.map, x, y) &&
      !region.monsters.some((m) => m.hp > 0 && m.x === x && m.y === y) &&
      !region.npcs.some((n) => n.x === x && n.y === y);
  }

  private stepAutoTravel(): void {
    this.autoTravelTimerId = null;
    if (!this.autoTravel.isActive() || this.state.gameOver) {
      this.autoTravel.cancel();
      return;
    }

    const region = getActiveRegion(this.state);
    const player = this.state.player;
    const next = this.autoTravel.peek();
    if (!next) {
      this.autoTravel.cancel();
      return;
    }

    const blocked =
      !isWalkable(region.map, next.x, next.y) ||
      region.monsters.some((m) => m.hp > 0 && m.x === next.x && m.y === next.y) ||
      region.npcs.some((n) => n.x === next.x && n.y === next.y);
    if (blocked) {
      addMessage(this.state, 'Something blocks the way. You stop.');
      this.render();
      this.autoTravel.cancel();
      return;
    }

    const direction = directionBetween(player, next);
    if (!direction) {
      this.autoTravel.cancel();
      return;
    }

    const regionIdBefore = this.state.activeRegionId;
    const visibleBefore = this.visibleEntities(region);
    const hpBefore = player.hp;

    const moved = this.turnManager.tryMovePlayer(direction);
    this.autoTravel.shift();
    this.render();

    if (!moved || this.state.gameOver) {
      this.autoTravel.cancel();
      return;
    }

    if (this.state.activeRegionId !== regionIdBefore) {
      // Walked through a region transition — any remaining waypoints were computed for the old
      // map and are meaningless here. The "You enter X" message already gives feedback.
      this.autoTravel.cancel();
      return;
    }

    const regionAfter = getActiveRegion(this.state);
    const visibleAfter = this.visibleEntities(regionAfter);
    const appeared = [...visibleAfter].filter(([id]) => !visibleBefore.has(id)).map(([, name]) => name);
    const tookDamage = player.hp < hpBefore;

    if (appeared.length > 0 || tookDamage) {
      if (this.autoTravel.isActive()) {
        // Name what stopped you. A bare "You stop." leaves the player hunting the screen for the
        // reason; when damage is what stopped you, the attack message above already said so.
        addMessage(
          this.state,
          appeared.length > 0 ? `You see ${joinWithAnd(appeared)}. You stop.` : 'You stop.',
        );
      }
      this.render();
      this.autoTravel.cancel();
      return;
    }

    if (this.autoTravel.isActive()) {
      this.autoTravelTimerId = window.setTimeout(() => this.stepAutoTravel(), AUTO_TRAVEL_STEP_MS);
      return;
    }

    // Arrived. If this walk was heading toward an NPC to interact with, do it now.
    if (this.pendingInteractTarget) {
      const interactTarget = this.pendingInteractTarget;
      this.pendingInteractTarget = null;
      const interactDirection = directionBetween(this.state.player, interactTarget);
      if (interactDirection && chebyshevDistance(this.state.player, interactTarget) === 1) {
        this.turnManager.tryMovePlayer(interactDirection);
        this.render();
      }
    }
  }

  /**
   * Every monster/NPC currently visible, as id -> how to name it in a message. Diffed before and
   * after each travel step so a newly-sighted entity of *either* kind interrupts travel, and so
   * the interruption can say what it saw. Ids are prefixed `m:`/`n:` to keep the two id spaces
   * from colliding.
   */
  private visibleEntities(region: RegionState): Map<string, string> {
    const entities = new Map<string, string>();
    for (const m of region.monsters) {
      if (m.hp > 0 && isVisible(region.visibility, m.x, m.y)) {
        entities.set(`m:${m.id}`, withArticle(MONSTERS[m.defId]?.name ?? 'creature'));
      }
    }
    for (const n of region.npcs) {
      // NPCs have proper names, so no article: "You see Old Maren.", not "a Old Maren".
      if (isVisible(region.visibility, n.x, n.y)) entities.set(`n:${n.id}`, n.name);
    }
    return entities;
  }

  private cancelAutoTravel(): void {
    if (this.autoTravelTimerId !== null) {
      window.clearTimeout(this.autoTravelTimerId);
      this.autoTravelTimerId = null;
    }
    this.autoTravel.cancel();
    this.pendingInteractTarget = null;
  }

  private handleAction(key: ActionKey): void {
    if (this.state.gameOver) return;

    switch (key) {
      case 'i':
        this.openInventoryView();
        break;
      case ',':
        this.pickUpItem();
        break;
      case 'w':
        this.openWieldMenu();
        break;
      case 'W':
        this.openWearMenu();
        break;
      case 'q':
        this.openUseMenu();
        break;
      case 'f':
        this.fireWeapon();
        break;
      case '.':
        this.turnManager.wait();
        this.render();
        break;
      case '>':
        this.turnManager.useStairs('down');
        this.render();
        break;
      case '<':
        this.turnManager.useStairs('up');
        this.render();
        break;
      case 'C':
        this.openCharacterSheet();
        break;
    }
  }

  private openCommandMenu(): void {
    if (this.state.gameOver) return;

    const region = getActiveRegion(this.state);
    const groundItem = region.groundItems.find(
      (g) => g.x === this.state.player.x && g.y === this.state.player.y,
    );

    const options: MenuOption<CommandAction>[] = [];
    // Contextual entries first: only offered when the tile you're on actually affords them.
    if (groundItem) {
      const name = ITEMS[groundItem.item.defId]?.name ?? 'item';
      options.push({ label: `Pick up ${name}`, value: 'pickup', hint: '[,]' });
    }
    const stairway = this.turnManager.stairwayUnderPlayer();
    if (stairway === 'down') options.push({ label: 'Descend the staircase', value: 'descend', hint: '[>]' });
    if (stairway === 'up') options.push({ label: 'Climb the staircase', value: 'climb', hint: '[<]' });

    options.push(
      { label: 'Inventory', value: 'inventory', hint: '[i]' },
      { label: 'Wield weapon', value: 'wield', hint: '[w]' },
      { label: 'Wear armor', value: 'wear', hint: '[W]' },
      { label: 'Use/Quaff', value: 'use', hint: '[q]' },
      { label: 'Fire', value: 'fire', hint: '[f]' },
      { label: 'Wait a turn', value: 'wait', hint: '[.]' },
      { label: 'Character sheet', value: 'character', hint: '[C]' },
    );

    this.screens.push<CommandAction>({
      title: 'What do you want to do?',
      options,
      onSelect: (action) => this.runCommandAction(action),
    });
  }

  /**
   * Runs a command-menu entry through the exact same code path as its direct keybinding — the
   * menu is a discoverability layer, never a second implementation. Entries that open another
   * screen push onto the stack (so Esc walks back to this menu); entries that act on the world
   * close the stack, because afterwards you want the map, not a menu you're done with.
   */
  private runCommandAction(action: CommandAction): void {
    switch (action) {
      case 'pickup':
        this.screens.closeAll();
        this.pickUpItem();
        break;
      case 'descend':
        this.screens.closeAll();
        this.turnManager.useStairs('down');
        this.render();
        break;
      case 'climb':
        this.screens.closeAll();
        this.turnManager.useStairs('up');
        this.render();
        break;
      case 'wait':
        this.screens.closeAll();
        this.turnManager.wait();
        this.render();
        break;
      case 'fire':
        this.screens.closeAll();
        this.fireWeapon();
        break;
      case 'inventory':
        this.openInventoryView();
        break;
      case 'wield':
        this.openWieldMenu();
        break;
      case 'wear':
        this.openWearMenu();
        break;
      case 'use':
        this.openUseMenu();
        break;
      case 'character':
        this.openCharacterSheet();
        break;
    }
  }

  private fireWeapon(): void {
    addMessage(this.state, 'You have nothing to fire.');
    this.render();
  }

  private handleNpcInteraction(npc: Npc): void {
    if (npc.shopId) {
      this.openShop(npc.shopId);
      return;
    }
    addMessage(this.state, `${npc.name}: "${npc.dialogue}"`);
    this.render();
  }

  private pickUpItem(): void {
    const region = getActiveRegion(this.state);
    const idx = region.groundItems.findIndex((g) => g.x === this.state.player.x && g.y === this.state.player.y);
    if (idx === -1) {
      addMessage(this.state, 'There is nothing here to pick up.');
      this.render();
      return;
    }

    const [ground] = region.groundItems.splice(idx, 1);
    if (!ground) return;
    addItem(this.state.player.inventory, ground.item);
    const def = ITEMS[ground.item.defId];
    addMessage(this.state, `You pick up ${def?.name ?? 'an item'}.`);

    this.turnManager.advanceTurn();
    this.render();
  }

  private openInventoryView(): void {
    const options = this.state.player.inventory.map((item) => ({
      label: describeItem(item, this.state.player.equipment),
      value: item.id,
    }));
    // No onSelect: the inventory is a read-only list, so Enter falls through to ScreenManager's
    // default (pop), same as Esc.
    this.screens.push<string>({ title: 'Inventory', options });
  }

  private openWieldMenu(): void {
    const options = this.state.player.inventory
      .filter((item) => ITEMS[item.defId]?.category === 'weapon')
      .map((item) => ({ label: describeItem(item, this.state.player.equipment), value: item.id }));

    this.screens.push<string>({
      title: 'Wield what?',
      options,
      onSelect: (itemId) => this.toggleEquip(itemId),
    });
  }

  private openWearMenu(): void {
    const options = this.state.player.inventory
      .filter((item) => ITEMS[item.defId]?.category === 'armor')
      .map((item) => ({ label: describeItem(item, this.state.player.equipment), value: item.id }));

    this.screens.push<string>({
      title: 'Wear what?',
      options,
      onSelect: (itemId) => this.toggleEquip(itemId),
    });
  }

  private openUseMenu(): void {
    const options = this.state.player.inventory
      .filter((item) => ITEMS[item.defId]?.category === 'consumable')
      .map((item) => ({ label: describeItem(item, this.state.player.equipment), value: item.id }));

    this.screens.push<string>({
      title: 'Use/Quaff — pick an item',
      options,
      onSelect: (itemId) => this.useItem(itemId),
    });
  }

  private openCharacterSheet(): void {
    this.screens.push<never>({
      title: `${this.state.player.glyph} You`,
      lines: describeCharacter(this.state),
      options: [],
      footer: 'Esc to close',
    });
  }

  private openHelp(): void {
    this.screens.push<never>({
      title: 'Controls',
      lines: [...HELP_LINES],
      options: [],
      footer: 'Esc to close',
    });
  }

  /** The title screen. Not dismissable — there's nothing behind it to go back to. */
  private showTitleScreen(note?: string): void {
    const saved = hasSave(this.storage);

    const options: MenuOption<TitleAction>[] = [];
    if (saved) options.push({ label: 'Continue', value: 'continue' });
    options.push({ label: 'New game', value: 'new-game' }, { label: 'Controls', value: 'controls' });

    this.screens.replace<TitleAction>({
      title: 'ROGUEOUT',
      lines: [note ?? 'A small expedition into the wilds.', ''],
      options,
      dismissable: false,
      centered: true,
      footer: 'Up/Down to select, Enter to confirm',
      onSelect: (action) => {
        if (action === 'controls') this.openHelp();
        else if (action === 'continue') this.continueSavedRun();
        // Starting fresh throws away a stored run, and permadeath makes that irreversible — so
        // it asks first, but only when there's actually something to lose.
        else if (saved) this.confirmNewGame();
        else this.startNewGame();
      },
    });
  }

  private continueSavedRun(): void {
    const loaded = loadGame(this.storage);
    if (!loaded) {
      // The save went bad between listing it and loading it. Nothing to resume, so say so
      // plainly and start fresh rather than dropping the player into a broken world.
      this.startNewGame();
      addMessage(this.state, 'Your saved run could not be read. Starting a new one.');
      this.render();
      return;
    }

    this.adoptState(loaded);
    this.screens.closeAll();
    addMessage(this.state, 'You take up where you left off.');
    this.render();
  }

  private confirmNewGame(): void {
    this.screens.push<boolean>({
      title: 'Start a new run?',
      lines: ['This erases your saved run for good.', ''],
      options: [
        { label: 'Keep the saved run', value: false },
        { label: 'Start a new run', value: true },
      ],
      onSelect: (confirmed) => (confirmed ? this.startNewGame() : this.screens.pop()),
    });
  }

  /** Esc with nothing open: the out-of-world menu, as opposed to Enter's in-world command menu. */
  private openGameMenu(): void {
    if (this.state.gameOver) return;
    this.screens.push<GameMenuAction>({
      title: 'Game',
      options: [
        { label: 'Character sheet', value: 'character', hint: '[C]' },
        { label: 'Controls', value: 'controls' },
        { label: 'Save and quit to title', value: 'save-quit' },
        { label: 'Abandon run', value: 'abandon' },
      ],
      onSelect: (action) => {
        if (action === 'character') this.openCharacterSheet();
        else if (action === 'controls') this.openHelp();
        else if (action === 'save-quit') this.saveAndQuit();
        else this.confirmAbandonRun();
      },
    });
  }

  /**
   * The intended way to stop playing: the run is written out and you're returned to the title,
   * where Continue picks it up again. (Every turn autosaves anyway, so this mostly exists to
   * make that promise visible — "I can stop here and come back" shouldn't be something the
   * player has to infer.)
   */
  private saveAndQuit(): void {
    this.cancelAutoTravel();
    const saved = saveGame(this.storage, this.state);
    this.showTitleScreen(
      saved ? 'Run saved. Continue when you like.' : "Couldn't save — your browser refused storage.",
    );
  }

  private confirmAbandonRun(): void {
    this.screens.push<boolean>({
      title: 'Abandon this run?',
      lines: ['This character and their saved run are gone for good.', ''],
      options: [
        { label: 'Keep playing', value: false },
        { label: 'Abandon', value: true },
      ],
      onSelect: (abandon) => {
        if (!abandon) {
          this.screens.pop();
          return;
        }
        clearSave(this.storage);
        this.showTitleScreen();
      },
    });
  }

  private startNewGame(): void {
    // Clear before the run starts, not just on its first turn: quitting the tab between "New
    // game" and the first move must not resurrect the run this one replaced.
    clearSave(this.storage);
    this.resetState();
    this.screens.closeAll();
  }

  /**
   * Autosave, or — if that turn was the last one — erase the save. Permadeath means the stored
   * run must not outlive the character; wiping it here, at the single point where death becomes
   * true, is what makes that unconditional rather than something every death path remembers.
   */
  private onTurnEnded(): void {
    if (this.state.gameOver) {
      clearSave(this.storage);
      this.showGameOver();
      return;
    }
    saveGame(this.storage, this.state);
  }

  private showGameOver(): void {
    if (this.gameOverShown) return;
    this.gameOverShown = true;
    this.cancelAutoTravel();

    const { player } = this.state;
    this.screens.replace<'new-game'>({
      title: 'You have died.',
      lines: [
        '',
        `You survived ${this.state.turnCount} turns.`,
        `Gold carried: ${player.gold}`,
        `Fell in: ${REGIONS[this.state.activeRegionId]?.name ?? this.state.activeRegionId}`,
        '',
      ],
      options: [{ label: 'New game', value: 'new-game' }],
      dismissable: false,
      centered: true,
      footer: 'Enter to start again',
      onSelect: () => this.startNewGame(),
    });
  }

  private openShop(shopId: string): void {
    const shop = SHOPS[shopId];
    if (!shop) return;

    const options: MenuOption<ShopAction>[] = [];
    for (const entry of shop.stock) {
      const def = ITEMS[entry.defId];
      if (!def) continue;
      options.push({
        label: `Buy ${def.name} — ${entry.price}g`,
        value: { kind: 'buy', defId: entry.defId, price: entry.price },
      });
    }
    for (const item of this.state.player.inventory) {
      const def = ITEMS[item.defId];
      if (!def) continue;
      const sellPrice = Math.max(1, Math.floor(def.value / 2));
      options.push({
        label: `Sell ${def.name} — ${sellPrice}g`,
        value: { kind: 'sell', itemId: item.id, price: sellPrice },
      });
    }

    this.screens.push<ShopAction>({
      title: `${shop.name} (Gold: ${this.state.player.gold})`,
      options,
      onSelect: (action) => this.handleShopAction(action),
    });
  }

  private handleShopAction(action: ShopAction): void {
    const player = this.state.player;

    if (action.kind === 'buy') {
      if (player.gold < action.price) {
        addMessage(this.state, "You can't afford that.");
      } else {
        player.gold -= action.price;
        addItem(player.inventory, createItem(action.defId));
        addMessage(this.state, `You buy ${ITEMS[action.defId]?.name ?? 'an item'}.`);
      }
    } else {
      const item = player.inventory.find((i) => i.id === action.itemId);
      const def = item ? ITEMS[item.defId] : undefined;
      if (item && def) {
        if (player.equipment.weapon?.id === item.id) player.equipment.weapon = null;
        if (player.equipment.armor?.id === item.id) player.equipment.armor = null;
        removeItem(player.inventory, item.id);
        player.gold += action.price;
        addMessage(this.state, `You sell ${def.name}.`);
        recomputePlayerCombatStats(player);
      }
    }

    this.screens.closeAll();
    this.turnManager.advanceTurn();
    this.render();
  }

  private toggleEquip(itemId: string): void {
    const player = this.state.player;
    const item = player.inventory.find((i) => i.id === itemId);
    const def = item ? ITEMS[item.defId] : undefined;
    if (!item || !def?.slot) {
      this.screens.closeAll();
      return;
    }

    if (player.equipment[def.slot]?.id === item.id) {
      player.equipment[def.slot] = null;
      addMessage(this.state, `You unequip the ${def.name}.`);
    } else {
      player.equipment[def.slot] = item;
      addMessage(this.state, `You equip the ${def.name}.`);
    }
    recomputePlayerCombatStats(player);

    this.screens.closeAll();
    this.turnManager.advanceTurn();
    this.render();
  }

  private useItem(itemId: string): void {
    const player = this.state.player;
    const item = player.inventory.find((i) => i.id === itemId);
    const def = item ? ITEMS[item.defId] : undefined;
    if (!item || !def) {
      this.screens.closeAll();
      return;
    }

    if (def.healAmount) {
      player.hp = Math.min(player.maxHp, player.hp + def.healAmount);
      addMessage(this.state, `You use the ${def.name} and recover ${def.healAmount} HP.`);
    }
    consumeOne(player.inventory, item.id);

    this.screens.closeAll();
    this.turnManager.advanceTurn();
    this.render();
  }

  /**
   * Watches the band the map lives in, rather than the window.
   *
   * Window resizes are only *one* reason that band changes size: it also shrinks the moment the
   * status bar first gets content, which happens after the initial measurement. Observing the
   * container catches every cause, so the canvas can't end up sized to a layout that no longer
   * exists. (Sizing the canvas doesn't resize the container back — it's flex-sized with
   * `overflow: hidden` — so there's no feedback loop.)
   */
  private observeViewportSize(): void {
    const host = this.canvasHost();
    if (host && typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(this.handleResize).observe(host);
      return;
    }
    window.addEventListener('resize', this.handleResize);
  }

  /**
   * Re-measures the canvas and redraws. Coalesced onto an animation frame because a window drag
   * emits size changes far faster than there's any point redrawing.
   */
  private readonly handleResize = (): void => {
    if (this.resizeFrameId !== null) return;
    this.resizeFrameId = window.requestAnimationFrame(() => {
      this.resizeFrameId = null;
      if (this.renderer.resize()) this.render();
    });
  };

  private canvasHost(): HTMLElement | null {
    return this.renderer.hostElement();
  }

  private render(): void {
    this.renderer.render(this.state);
    this.messageLog.render(this.state.messageLog);
    this.statusBar.render(this.state);
  }
}

function describeItem(
  item: { id: string; defId: string; quantity: number; durability?: number },
  equipment: { weapon: { id: string } | null; armor: { id: string } | null },
): string {
  const def = ITEMS[item.defId];
  const name = def?.name ?? item.defId;
  const equipped = equipment.weapon?.id === item.id || equipment.armor?.id === item.id;
  const qty = item.quantity > 1 ? ` x${item.quantity}` : '';
  const durability = item.durability !== undefined ? ` (${item.durability}/${def?.maxDurability})` : '';
  return `${name}${qty}${durability}${equipped ? ' [equipped]' : ''}`;
}
