import { createPlayer, recomputePlayerCombatStats } from '../entities/Player';
import { createRNG, type RNG } from '../utils/RNG';
import {
  chebyshevDistance,
  directionBetween,
  DIRECTION_VECTORS,
  type Direction,
  type Point,
} from '../utils/geometry';
import { joinWithAnd, withArticle } from '../utils/text';
import { createItem } from '../items/Item';
import { ITEMS } from '../items/ItemData';
import { MONSTERS } from '../entities/MonsterData';
import { addItem, consumeOne, removeItem } from '../items/Inventory';
import { SHOPS } from '../world/ShopData';
import type { Npc } from '../entities/Npc';
import { ensureRegionLoaded } from '../world/regions/RegionRegistry';
import { OVERWORLD_SPAWN } from '../world/maps/overworld';
import { isWalkable } from '../world/GameMap';
import { isExplored } from '../fov/VisibilityState';
import { actorAt } from '../ai/Actors';
import { findPath, findPathToAny } from '../pathfinding/BFS';
import { walkableLineToward } from '../pathfinding/StraightLine';
import { flingItem, kickCreature } from '../combat/Kick';
import { AutoTravel } from '../pathfinding/AutoTravel';
import type { GameState, RegionState } from './GameState';
import { addMessage, canSpot, endMessageGroup, getActiveRegion } from './GameState';
import { EventBus, type GameEvents } from './EventBus';
import { TurnManager } from './TurnManager';
import { InputManager, type ActionKey } from '../input/InputManager';
import { MouseInput } from '../input/MouseInput';
import {
  AUTO_TRAVEL_STEP_MS,
  AUTOSAVE_TURN_INTERVAL,
  DEFAULT_THROW_BONUS,
  KICK_ACCURACY_PENALTY,
  KICK_ITEM_RANGE,
  MAX_TRAVEL_DISTANCE,
  THROW_RANGE,
} from '../config/constants';
import { Camera } from '../ui/Camera';
import { Renderer } from '../ui/Renderer';
import { MessageLog } from '../ui/MessageLog';
import { StatusBar } from '../ui/StatusBar';
import { Menu, type MenuOption } from '../ui/menus/Menu';
import { createLocalStorageAdapter, type SaveStorage } from '../persistence/LocalStorageAdapter';
import { clearSave, hasSave, loadGame, saveGame } from '../persistence/SaveGame';
import { ScreenManager } from '../ui/screens/ScreenManager';
import { describeCharacter } from '../ui/screens/CharacterSheet';
import { describeTile } from '../ui/Describe';
import { HELP_LINES } from '../ui/screens/HelpText';

type ShopAction =
  | { kind: 'buy'; defId: string; price: number }
  | { kind: 'sell'; itemId: string; price: number };

/** What you can do with one item, once you've picked it out of your pack. */
type ItemAction = 'use' | 'wield' | 'wear' | 'throw' | 'drop';

type CommandAction =
  | 'pickup'
  | 'kick'
  | 'fight'
  | 'go'
  | 'throw'
  | 'drop'
  | 'descend'
  | 'climb'
  | 'inventory'
  | 'wield'
  | 'wear'
  | 'use'
  | 'fire'
  | 'wait'
  | 'look'
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
  /** Where the `;` cursor is, or null when not looking. */
  private lookCursor: Point | null = null;
  /** For effects Game resolves itself (kicks, throws) rather than routing through TurnManager. */
  private rng: RNG = createRNG(Date.now());
  private readonly storage: SaveStorage;
  /** Turns since the last write, for the autosave throttle. See flushSave/onTurnEnded. */
  private turnsSinceSave = 0;
  /** Which region the last write covered, so crossing into a new one always forces a flush. */
  private savedRegionId: string | null = null;
  /** A failed save is told to the player once, not once per turn. Reset by resetState(). */
  private saveFailureReported = false;

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
        endMessageGroup(this.state);
        this.cancelAutoTravel();
        this.turnManager.tryMovePlayer(direction);
        this.render();
      },
      onAction: (key) => {
        endMessageGroup(this.state);
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
      onLookMove: (direction) => this.moveLookCursor(direction),
      onLookConfirm: () => this.confirmLook(),
      onLookCancel: () => this.endLook('Never mind.'),
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
    this.turnsSinceSave = 0;
    this.savedRegionId = null;
    this.saveFailureReported = false;

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

    addMessage(this.state, 'You set out. The road runs east.');
  }

  /** Points the game at a state — freshly made or freshly loaded — and rebuilds what hangs off it. */
  private adoptState(state: GameState): void {
    this.state = state;
    this.gameOverShown = false;
    this.rng = createRNG(Date.now());
    this.turnManager = new TurnManager(this.state, this.events, this.rng);
    this.turnManager.recomputeFOV();
  }

  start(): void {
    this.input.attach(window);
    this.mouseInput.attach();
    this.observeViewportSize();
    this.saveBeforeLeaving();
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

  /**
   * The throttle's safety net: whatever the turn counter says, the run is written out before the
   * tab can go away. Both events are needed — `pagehide` covers a close or a navigation, and
   * `visibilitychange` covers a mobile browser backgrounding the tab and never firing anything
   * else before killing it, which is the case that would otherwise silently eat ten turns.
   */
  private saveBeforeLeaving(): void {
    const flush = () => {
      if (this.state && !this.state.gameOver && this.turnsSinceSave > 0) this.flushSave();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });
  }

  private handleMapClick(target: Point): void {
    if (this.state.gameOver || this.screens.isOpen()) return;

    // Looking takes priority: while the cursor is up, a click is pointing at something.
    if (this.input.isLookActive()) {
      this.endLook();
      this.showDescription(target);
      return;
    }

    endMessageGroup(this.state);
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
    const path = findPath(player, target, { ...region.map, isPassable });
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

    // One search over all eight tiles around them, not eight searches. BFS expands in order of
    // path length, so the first one it reaches is the closest — which is what the eight separate
    // searches were computing the expensive way.
    const adjacent = Object.values(DIRECTION_VECTORS).map((v) => ({
      x: targetPos.x + v.x,
      y: targetPos.y + v.y,
    }));
    const bestPath = findPathToAny(this.state.player, adjacent, { ...region.map, isPassable });

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
    // Via actorAt so "is someone standing here" has one definition. The hand-rolled version this
    // replaced also forgot to check `hp > 0` on NPCs, so a corpse's tile stayed unroutable.
    return (x, y) => isWalkable(region.map, x, y) && actorAt(this.state, region, x, y) === null;
  }

  private stepAutoTravel(): void {
    this.autoTravelTimerId = null;
    endMessageGroup(this.state); // each step of a walk is its own line
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
      if (m.hp > 0 && canSpot(this.state, m.x, m.y)) {
        entities.set(`m:${m.id}`, withArticle(MONSTERS[m.defId]?.name ?? 'creature'));
      }
    }
    for (const n of region.npcs) {
      // NPCs have proper names, so no article: "You see Old Maren.", not "a Old Maren".
      if (canSpot(this.state, n.x, n.y)) entities.set(`n:${n.id}`, n.name);
    }
    return entities;
  }

  private cancelAutoTravel(): void {
    const wasTravelling = this.autoTravel.isActive();

    if (this.autoTravelTimerId !== null) {
      window.clearTimeout(this.autoTravelTimerId);
      this.autoTravelTimerId = null;
    }
    this.autoTravel.cancel();
    this.pendingInteractTarget = null;

    // onTurnEnded skips saving while travelling, so this is where those turns get written —
    // whether the walk finished, was interrupted, or the player pressed a key mid-stride.
    if (wasTravelling && this.turnsSinceSave > 0) this.flushSave();
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
        this.turnManager.useTransition('down');
        this.render();
        break;
      case '<':
        this.turnManager.useTransition('up');
        this.render();
        break;
      case 'C':
        this.openCharacterSheet();
        break;
      case 'k':
        this.promptDirection('Kick in which direction?', (direction) => this.kick(direction));
        break;
      case 'g':
        this.promptDirection('Go in which direction?', (direction) => this.travelInDirection(direction));
        break;
      case 't':
        this.openThrowMenu();
        break;
      case 'd':
        this.openDropMenu();
        break;
      case ';':
        this.startLook();
        break;
      case 'F':
        this.promptDirection('Attack in which direction?', (direction) => this.fight(direction));
        break;
    }
  }

  /**
   * `;` — "what is that?". A cursor you drive with the movement keys (or click straight at
   * something), rather than a menu, so you can point at anything on screen including terrain.
   */
  private startLook(): void {
    if (this.state.gameOver) return;
    this.lookCursor = { x: this.state.player.x, y: this.state.player.y };
    this.input.setLookActive(true);
    this.renderer.setCursor(this.lookCursor);
    addMessage(this.state, 'Look at what? Move the cursor and press Enter, or click. Esc to stop.');
    endMessageGroup(this.state);
    this.render();
  }

  private moveLookCursor(direction: Direction): void {
    if (!this.lookCursor) return;
    const region = getActiveRegion(this.state);
    const vector = DIRECTION_VECTORS[direction];

    this.lookCursor = {
      x: Math.max(0, Math.min(region.map.width - 1, this.lookCursor.x + vector.x)),
      y: Math.max(0, Math.min(region.map.height - 1, this.lookCursor.y + vector.y)),
    };
    this.renderer.setCursor(this.lookCursor);
    this.render();
  }

  private confirmLook(): void {
    const cursor = this.lookCursor;
    this.endLook();
    if (cursor) this.showDescription(cursor);
  }

  private endLook(note?: string): void {
    this.lookCursor = null;
    this.input.setLookActive(false);
    this.renderer.setCursor(null);
    if (note) addMessage(this.state, note);
    this.render();
  }

  private showDescription(at: Point): void {
    const description = describeTile(this.state, at.x, at.y);
    this.screens.push<never>({
      title: description.title,
      lines: description.lines,
      options: [],
      footer: 'Esc to close',
    });
  }

  /**
   * Asks which way, then does the thing. The prompt goes in the log rather than a menu so the map
   * stays visible — you need to see what you're aiming at.
   */
  private promptDirection(prompt: string, action: (direction: Direction) => void): void {
    if (this.state.gameOver) return;
    addMessage(this.state, prompt);
    // The answer starts a fresh line: the question is history the moment it's answered.
    endMessageGroup(this.state);
    this.render();

    this.input.promptDirection((direction) => {
      if (!direction) {
        addMessage(this.state, 'Never mind.');
        this.render();
        return;
      }
      action(direction);
    });
  }

  /**
   * `F`: attack whatever is there on purpose, including someone peaceful.
   *
   * Walking into a peaceful person talks to them or opens their shop, which is right almost
   * always — and leaves no way at all to start something. This is that way, and it being a
   * separate deliberate key is the point: you do not rob a shopkeeper by mistyping a direction.
   */
  private fight(direction: Direction): void {
    const region = getActiveRegion(this.state);
    const vector = DIRECTION_VECTORS[direction];
    const target = { x: this.state.player.x + vector.x, y: this.state.player.y + vector.y };

    const victim = [...region.monsters, ...region.npcs].find(
      (a) => a.hp > 0 && a.x === target.x && a.y === target.y,
    );
    if (!victim) {
      addMessage(this.state, 'There is nothing there to attack.');
      this.render();
      return;
    }

    this.turnManager.attackActor(victim);
    this.turnManager.advanceTurn();
    this.render();
  }

  /** `k`: boot whatever is in that direction — a creature, a loose object, or a wall. */
  private kick(direction: Direction): void {
    const region = getActiveRegion(this.state);
    const vector = DIRECTION_VECTORS[direction];
    const target = { x: this.state.player.x + vector.x, y: this.state.player.y + vector.y };

    const victim = [...region.monsters, ...region.npcs].find(
      (a) => a.hp > 0 && a.x === target.x && a.y === target.y,
    );
    if (victim) {
      const outcome = kickCreature(victim, direction, this.state, region, this.rng);
      if (outcome.tookTurn) this.turnManager.advanceTurn();
      this.render();
      return;
    }

    const groundIndex = region.groundItems.findIndex((g) => g.x === target.x && g.y === target.y);
    if (groundIndex !== -1) {
      const [ground] = region.groundItems.splice(groundIndex, 1);
      if (ground) {
        const def = ITEMS[ground.item.defId];
        addMessage(this.state, `You kick the ${def?.name ?? 'item'}.`);
        // A boot is a worse arm than a hand: shorter range than a throw.
        const result = flingItem(
          ground.item.defId,
          target,
          direction,
          KICK_ITEM_RANGE,
          def?.damage,
          this.state,
          region,
          this.rng,
          // A boot is worse than an arm even with something meant for throwing.
          (def?.throwBonus ?? DEFAULT_THROW_BONUS) - KICK_ACCURACY_PENALTY,
        );
        region.groundItems.push({ item: ground.item, x: result.landedAt.x, y: result.landedAt.y });
      }
      this.turnManager.advanceTurn();
      this.render();
      return;
    }

    if (!isWalkable(region.map, target.x, target.y)) {
      addMessage(this.state, 'You kick the wall. That was a mistake.');
      this.turnManager.advanceTurn();
    } else {
      addMessage(this.state, 'You kick at nothing.'); // costs no turn: an obvious misfire
    }
    this.render();
  }

  /**
   * `g`: walk that way until something stops you. Reuses the click-to-travel machinery, so every
   * interrupt (a creature coming into view, taking damage, the ground running out) applies.
   */
  private travelInDirection(direction: Direction): void {
    const region = getActiveRegion(this.state);
    const vector = DIRECTION_VECTORS[direction];
    const far = {
      x: this.state.player.x + vector.x * MAX_TRAVEL_DISTANCE,
      y: this.state.player.y + vector.y * MAX_TRAVEL_DISTANCE,
    };

    const path = walkableLineToward(this.state.player, far, this.isPassableIn(region));
    if (path.length === 0) {
      addMessage(this.state, 'You can\'t go that way.');
      this.render();
      return;
    }

    this.autoTravel.start(path);
    this.stepAutoTravel();
  }

  private throwItem(itemId: string, direction: Direction): void {
    const player = this.state.player;
    const item = player.inventory.find((i) => i.id === itemId);
    const def = item ? ITEMS[item.defId] : undefined;
    if (!item || !def) return;

    const region = getActiveRegion(this.state);
    if (player.equipment.weapon?.id === item.id) player.equipment.weapon = null;
    if (player.equipment.armor?.id === item.id) player.equipment.armor = null;

    const thrown = consumeOne(player.inventory, item.id) ? { ...item, quantity: 1 } : item;
    recomputePlayerCombatStats(player);

    addMessage(this.state, `You throw the ${def.name}.`);
    const result = flingItem(
      item.defId,
      player,
      direction,
      THROW_RANGE,
      def.damage,
      this.state,
      region,
      this.rng,
      def.throwBonus,
    );
    region.groundItems.push({ item: thrown, x: result.landedAt.x, y: result.landedAt.y });

    this.turnManager.advanceTurn();
    this.render();
  }

  private dropItem(itemId: string): void {
    const player = this.state.player;
    const item = player.inventory.find((i) => i.id === itemId);
    const def = item ? ITEMS[item.defId] : undefined;
    if (!item || !def) return;

    if (player.equipment.weapon?.id === item.id) player.equipment.weapon = null;
    if (player.equipment.armor?.id === item.id) player.equipment.armor = null;
    removeItem(player.inventory, item.id);
    recomputePlayerCombatStats(player);

    getActiveRegion(this.state).groundItems.push({ item, x: player.x, y: player.y });
    addMessage(this.state, `You drop the ${def.name}.`);

    this.turnManager.advanceTurn();
    this.render();
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
    const crossing = this.turnManager.transitionUnderPlayer();
    if (crossing === 'down') options.push({ label: 'Descend the staircase', value: 'descend', hint: '[>]' });
    if (crossing === 'up') options.push({ label: 'Climb the staircase', value: 'climb', hint: '[<]' });
    // A door takes either key, so offer the one entry rather than making the player pick a verb.
    if (crossing === 'door') options.push({ label: 'Go through the door', value: 'descend', hint: '[>]' });

    options.push(
      { label: 'Inventory', value: 'inventory', hint: '[i]' },
      { label: 'Wield weapon', value: 'wield', hint: '[w]' },
      { label: 'Wear armor', value: 'wear', hint: '[W]' },
      { label: 'Use/Quaff', value: 'use', hint: '[q]' },
      { label: 'Throw', value: 'throw', hint: '[t]' },
      { label: 'Drop', value: 'drop', hint: '[d]' },
      { label: 'Kick', value: 'kick', hint: '[k]' },
      { label: 'Attack deliberately', value: 'fight', hint: '[F]' },
      { label: 'Go until something happens', value: 'go', hint: '[g]' },
      { label: 'Fire', value: 'fire', hint: '[f]' },
      { label: 'Wait a turn', value: 'wait', hint: '[.]' },
      { label: 'Look at something', value: 'look', hint: '[;]' },
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
        this.turnManager.useTransition('down');
        this.render();
        break;
      case 'climb':
        this.screens.closeAll();
        this.turnManager.useTransition('up');
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
      case 'throw':
        this.openThrowMenu();
        break;
      case 'drop':
        this.openDropMenu();
        break;
      case 'kick':
        this.screens.closeAll();
        this.promptDirection('Kick in which direction?', (direction) => this.kick(direction));
        break;
      case 'go':
        this.screens.closeAll();
        this.promptDirection('Go in which direction?', (direction) => this.travelInDirection(direction));
        break;
      case 'fight':
        this.screens.closeAll();
        this.promptDirection('Attack in which direction?', (direction) => this.fight(direction));
        break;
      case 'look':
        this.screens.closeAll();
        this.startLook();
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

    const def = ITEMS[ground.item.defId];
    if (def?.category === 'currency') {
      // Money goes in the purse, not the pack — carrying caps as an inventory line would be
      // pure clutter, and the status bar already shows the total.
      this.state.player.caps += ground.item.quantity;
      addMessage(this.state, `You pick up ${ground.item.quantity} caps.`);
    } else if (def?.category === 'corpse') {
      addItem(this.state.player.inventory, ground.item);
      addMessage(this.state, `You pick up ${ground.item.corpse?.name ?? 'a corpse'}.`);
    } else {
      addItem(this.state.player.inventory, ground.item);
      addMessage(this.state, `You pick up the ${def?.name ?? 'item'}.`);
    }

    this.turnManager.advanceTurn();
    this.render();
  }

  private openInventoryView(): void {
    const options = this.state.player.inventory.map((item) => ({
      label: describeItem(item, this.state.player.equipment),
      value: item.id,
    }));
    this.screens.push<string>({
      title: 'Inventory',
      options,
      onSelect: (itemId) => this.openItemActions(itemId),
    });
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

  /** `t`: pick something, then a direction. */
  private openThrowMenu(): void {
    const options = this.state.player.inventory.map((item) => ({
      label: describeItem(item, this.state.player.equipment),
      value: item.id,
    }));
    this.screens.push<string>({
      title: 'Throw what?',
      options,
      onSelect: (itemId) => {
        this.screens.closeAll();
        this.promptDirection('Throw in which direction?', (direction) => this.throwItem(itemId, direction));
      },
    });
  }

  private openDropMenu(): void {
    const options = this.state.player.inventory.map((item) => ({
      label: describeItem(item, this.state.player.equipment),
      value: item.id,
    }));
    this.screens.push<string>({
      title: 'Drop what?',
      options,
      onSelect: (itemId) => {
        this.screens.closeAll();
        this.dropItem(itemId);
      },
    });
  }

  /**
   * What you can do with one item, offered only where it makes sense — there's no point asking
   * whether you'd like to wear a med pack. Reached by choosing an item in the inventory.
   */
  private openItemActions(itemId: string): void {
    const item = this.state.player.inventory.find((i) => i.id === itemId);
    const def = item ? ITEMS[item.defId] : undefined;
    if (!item || !def) return;

    const equipped =
      this.state.player.equipment.weapon?.id === item.id || this.state.player.equipment.armor?.id === item.id;

    const options: MenuOption<ItemAction>[] = [];
    if (def.healAmount !== undefined) options.push({ label: 'Use', value: 'use', hint: '[q]' });
    if (def.category === 'weapon') {
      options.push({ label: equipped ? 'Put away' : 'Wield', value: 'wield', hint: '[w]' });
    }
    if (def.category === 'armor') {
      options.push({ label: equipped ? 'Take off' : 'Wear', value: 'wear', hint: '[W]' });
    }
    options.push({ label: 'Throw', value: 'throw', hint: '[t]' }, { label: 'Drop', value: 'drop', hint: '[d]' });

    this.screens.push<ItemAction>({
      title: def.name,
      options,
      onSelect: (action) => {
        if (action === 'throw') {
          this.screens.closeAll();
          this.promptDirection('Throw in which direction?', (direction) => this.throwItem(itemId, direction));
          return;
        }
        this.screens.closeAll();
        if (action === 'use') this.useItem(itemId);
        else if (action === 'drop') this.dropItem(itemId);
        else this.toggleEquip(itemId);
      },
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
    addMessage(this.state, 'You resume where you left off.');
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
    // Opening this menu is the clearest signal there is that the player is about to stop, so
    // whatever the throttle thinks, write the run out before showing them the option to quit.
    this.flushSave();
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
    this.turnsSinceSave = 0;
    this.savedRegionId = this.state.activeRegionId;
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

    this.turnsSinceSave += 1;

    // Auto-travel is the case that matters: it steps ~11 times a second, and a full stringify
    // plus a synchronous setItem on each one is the single most expensive thing in the frame.
    // Skipping while travelling and flushing when it ends costs nothing — an interrupted walk
    // ends the same way a completed one does, through cancelAutoTravel.
    if (this.autoTravel.isActive()) return;

    // Crossing into a region always writes, whatever the count says: a transition is both the
    // largest change a single turn can make (a whole new grid) and the most likely moment for
    // someone to close the tab.
    if (this.state.activeRegionId !== this.savedRegionId) {
      this.flushSave();
      return;
    }

    if (this.turnsSinceSave >= AUTOSAVE_TURN_INTERVAL) this.flushSave();
  }

  /**
   * Writes the run out now, and tells the player once per run if it didn't work.
   *
   * "Once per run" is the whole point of the flag: storage that refuses one write will refuse
   * every subsequent one, and a message on each of them would bury the game under the same
   * sentence. Saying nothing at all is the option this replaced, and it was worse — the player
   * would find out by losing the run.
   */
  private flushSave(): void {
    if (this.state.gameOver) return;

    this.turnsSinceSave = 0;
    this.savedRegionId = this.state.activeRegionId;

    if (saveGame(this.storage, this.state)) {
      this.saveFailureReported = false;
      return;
    }

    if (!this.saveFailureReported) {
      this.saveFailureReported = true;
      addMessage(this.state, "Your browser refused to store the run. Keep playing, but it won't survive a reload.");
      this.render();
    }
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
        `Caps carried: ${player.caps}`,
        `Fell in: ${getActiveRegion(this.state).name}`,
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
      title: `${shop.name} (Caps: ${this.state.player.caps})`,
      options,
      onSelect: (action) => this.handleShopAction(action),
    });
  }

  private handleShopAction(action: ShopAction): void {
    const player = this.state.player;

    if (action.kind === 'buy') {
      if (player.caps < action.price) {
        addMessage(this.state, "You can't afford that.");
      } else {
        player.caps -= action.price;
        addItem(player.inventory, createItem(action.defId));
        addMessage(this.state, `You buy the ${ITEMS[action.defId]?.name ?? 'item'} for ${action.price} caps.`);
      }
    } else {
      const item = player.inventory.find((i) => i.id === action.itemId);
      const def = item ? ITEMS[item.defId] : undefined;
      if (item && def) {
        if (player.equipment.weapon?.id === item.id) player.equipment.weapon = null;
        if (player.equipment.armor?.id === item.id) player.equipment.armor = null;
        removeItem(player.inventory, item.id);
        player.caps += action.price;
        addMessage(this.state, `You sell the ${def.name} for ${action.price} caps.`);
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
      addMessage(this.state, `You use the ${def.name}. You recover ${def.healAmount} HP.`);
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
