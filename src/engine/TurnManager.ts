import type { GameState } from './GameState';
import { addMessage, getActiveRegion } from './GameState';
import { EventBus, type GameEvents } from './EventBus';
import { addPoints, DIRECTION_VECTORS, type Direction } from '../utils/geometry';
import { getTileId, isOpaque, isWalkable } from '../world/GameMap';
import { isDeliberateTransition, transitionKind, type StairwayDirection, type TransitionKind } from '../world/Tile';
import { computeFOV } from '../fov/Shadowcasting';
import { markVisible, resetVisible } from '../fov/VisibilityState';
import { computeFovRadius } from '../combat/CombatFormulas';
import { DAYLIGHT_SIGHT_RADIUS } from '../config/constants';
import { resolveMeleeAttack } from '../combat/CombatResolver';
import { dropLoot } from '../combat/Death';
import { hasTag } from '../combat/DamageTypes';
import type { Monster } from '../entities/Monster';
import { recomputePlayerCombatStats } from '../entities/Player';
import { damageEquippedWeapon } from '../items/Equipment';
import { ITEMS } from '../items/ItemData';
import { runMonsterTurns, runNpcTurns } from '../ai/AIScheduler';
import { ensureRegionLoaded } from '../world/regions/RegionRegistry';
import type { RegionTransition } from '../world/regions/RegionTypes';
import { areHostile } from '../world/Factions';
import { actorLabel, reactToAttack, removeActor, type Provokable } from '../ai/Actors';
import type { RNG } from '../utils/RNG';
import { withArticle } from '../utils/text';
import {
  narrateCondition,
  narratePlayerAttack,
  narrateResisted,
  narrateWaiting,
  UNARMED_VERB,
} from '../narrative/Narration';

const TILE_ANNOUNCEMENTS: Partial<Record<string, string>> = {
  stairsDown: 'Stairs down. Press > to descend.',
  stairsUp: 'Stairs up. Press < to climb.',
  door: 'A door. Press > to go through.',
};

export class TurnManager {
  private readonly state: GameState;
  private readonly events: EventBus<GameEvents>;
  private readonly rng: RNG;

  constructor(state: GameState, events: EventBus<GameEvents>, rng: RNG) {
    this.state = state;
    this.events = events;
    this.rng = rng;
  }

  /**
   * Attempts to move the player one step: attacks a live monster on the target tile, interacts
   * with an NPC there, crosses a region transition, or just moves. Returns false (no turn
   * consumed) if none of those could happen (e.g. bumping a wall, or talking to an NPC).
   */
  tryMovePlayer(direction: Direction): boolean {
    if (this.state.gameOver) return false;

    const region = getActiveRegion(this.state);
    const vector = DIRECTION_VECTORS[direction];
    const target = addPoints(this.state.player, vector);

    const targetNpc = region.npcs.find((n) => n.hp > 0 && n.x === target.x && n.y === target.y);
    if (targetNpc) {
      // Someone you've already fallen out with doesn't want to chat.
      if (targetNpc.provokedBy.includes(this.state.player.faction) || areHostile(this.state.player.faction, targetNpc.faction)) {
        this.attackActor(targetNpc);
        this.advanceTurn();
        return true;
      }
      this.events.emit('npc-interacted', { npc: targetNpc });
      return false; // talking doesn't consume a turn, same as bumping a wall
    }

    const targetMonster = region.monsters.find((m) => m.hp > 0 && m.x === target.x && m.y === target.y);
    if (targetMonster) {
      this.attackMonster(targetMonster);
      this.advanceTurn();
      return true;
    }

    if (!isWalkable(region.map, target.x, target.y)) {
      return false;
    }

    this.state.player.x = target.x;
    this.state.player.y = target.y;

    // Stairways are deliberate: you stand on them and press >/< (see useStairs). Every other
    // kind of transition — walking out of a dungeon's mouth, crossing a region edge — still fires
    // on the step itself, since there's nothing to decide. This is also what keeps auto-travel
    // from dropping you into a dungeon just because the path crossed the entrance.
    const transition = this.transitionAt(target.x, target.y);
    if (transition && !isDeliberateTransition(getTileId(region.map, target.x, target.y))) {
      this.crossTransition(transition);
      this.state.turnCount += 1;
      this.events.emit('turn-ended', { turnCount: this.state.turnCount });
      return true;
    }

    this.announceTileContents();
    this.advanceTurn();
    return true;
  }

  /**
   * `>` / `<`: takes the staircase or door under the player. Returns false (no turn consumed) if
   * there isn't one leading that way, so a mistyped key costs nothing.
   *
   * A doorway answers to *both* keys. There is only ever one transition on a tile, so there's
   * nothing to disambiguate, and making the player remember which side of a door they're on would
   * be friction with no decision behind it.
   */
  useTransition(direction: StairwayDirection): boolean {
    if (this.state.gameOver) return false;

    const region = getActiveRegion(this.state);
    const { x, y } = this.state.player;
    const here = transitionKind(getTileId(region.map, x, y));

    if (here === null || (here !== 'door' && here !== direction)) {
      addMessage(this.state, `There is no staircase leading ${direction} here.`);
      return false;
    }

    const transition = this.transitionAt(x, y);
    if (!transition) {
      addMessage(this.state, here === 'door' ? 'The door will not open.' : 'The staircase is blocked.');
      return false;
    }

    this.crossTransition(transition);
    this.state.turnCount += 1;
    this.events.emit('turn-ended', { turnCount: this.state.turnCount });
    return true;
  }

  /** `.`: stand still, letting the world take its turn. */
  wait(): void {
    if (this.state.gameOver) return;
    addMessage(this.state, narrateWaiting(this.state.turnCount));
    this.advanceTurn();
  }

  /** The crossing under the player, if any — used to keep the command menu contextual. */
  transitionUnderPlayer(): TransitionKind | null {
    const region = getActiveRegion(this.state);
    return transitionKind(getTileId(region.map, this.state.player.x, this.state.player.y));
  }

  /**
   * Read off the *region's state*, not a static table: a generated interior's doorways aren't
   * known until it's built, and they have to survive a reload.
   */
  private transitionAt(x: number, y: number): RegionTransition | undefined {
    return getActiveRegion(this.state).transitions.find((t) => t.x === x && t.y === y);
  }

  /** Recomputes the visible set from the player's current position/region. Call once at startup too. */
  recomputeFOV(): void {
    const region = getActiveRegion(this.state);
    const { player } = this.state;
    resetVisible(region.visibility);
    // Under open sky the limit is the land, not the light; underground it's what you carry.
    const radius = region.daylight ? DAYLIGHT_SIGHT_RADIUS : computeFovRadius(player.special.perception);
    computeFOV(
      player.x,
      player.y,
      radius,
      (x, y) => isOpaque(region.map, x, y),
      (x, y) => markVisible(region.visibility, x, y),
    );
  }

  /** Advances the turn clock and runs monster AI, for player actions that aren't movement/attack. */
  advanceTurn(): void {
    this.state.turnCount += 1;
    this.recomputeFOV();
    if (!this.state.gameOver) {
      runMonsterTurns(this.state, this.rng);
      runNpcTurns(this.state, this.rng);
    }
    this.events.emit('turn-ended', { turnCount: this.state.turnCount });
  }

  private crossTransition(transition: RegionTransition): void {
    // The recipe rides on the transition, which is what lets somewhere with no entry in REGIONS —
    // a building's interior, a stretch of tunnel — be built the first time you open the door to it.
    const region = ensureRegionLoaded(this.state.regions, transition.toRegion, transition.create);
    this.state.activeRegionId = transition.toRegion;
    this.state.player.x = transition.spawnX;
    this.state.player.y = transition.spawnY;

    // Crossings that stand in for distance cost time. Charging turns for the blocks a city elides
    // is honest, and cheaper than modelling a quarter mile of identical rubble.
    if (transition.turnCost) this.state.turnCount += transition.turnCost;

    addMessage(this.state, transition.announce ?? region.arrival ?? `You enter ${region.name}.`);
    this.recomputeFOV();
    this.announceTileContents();
  }

  /** Reports what's on the player's current tile — a ground item, stairs, etc. */
  private announceTileContents(): void {
    const region = getActiveRegion(this.state);
    const { x, y } = this.state.player;

    const ground = region.groundItems.find((g) => g.x === x && g.y === y);
    if (ground) {
      addMessage(this.state, `You see ${describeGroundItem(ground.item)} here.`);
    }

    const announcement = TILE_ANNOUNCEMENTS[getTileId(region.map, x, y)];
    if (announcement) {
      addMessage(this.state, announcement);
    }
  }

  private attackMonster(monster: Monster): void {
    this.attackActor(monster);
  }

  /**
   * The player swinging at anything — a creature or a person. Public because `F` (fight) needs it
   * for targets that bumping would otherwise talk to. Whoever it is takes it personally,
   * and so do their nearby faction-mates: hitting one trooper in the street shouldn't leave the
   * rest waiting politely for their turn to notice.
   */
  attackActor(defender: Provokable): void {
    const region = getActiveRegion(this.state);
    const result = resolveMeleeAttack(this.rng, this.state.player, defender);
    const weapon = this.state.player.equipment.weapon;
    const weaponDef = weapon ? ITEMS[weapon.defId] : undefined;
    const label = actorLabel(defender);

    reactToAttack(this.state, region, defender, this.state.player.faction);

    // Nothing here knows what a head is: the weapon claims it can take one, the creature says
    // whether it has one, and the rule is just the two tags meeting.
    const decapitated =
      result.type === 'cut' && hasTag(weaponDef?.traits, 'decapitates') && hasTag(defender.tags, 'head');

    addMessage(
      this.state,
      narratePlayerAttack({
        target: label,
        verb: weaponDef?.attackVerb ?? UNARMED_VERB,
        hit: result.hit,
        damage: result.damage,
        targetMaxHp: defender.maxHp,
        killed: defender.hp <= 0,
        shrugged: result.shrugged,
        decapitated,
        seed: this.state.turnCount,
      }),
    );

    if (result.resisted) {
      addMessage(this.state, narrateResisted(label, weaponDef?.attackVerb ?? UNARMED_VERB, this.state.turnCount));
    }

    if (result.hit && !result.shrugged) {
      const condition = narrateCondition(defender.hp, defender.maxHp);
      if (condition) addMessage(this.state, condition);

      const damaged = damageEquippedWeapon(this.state.player.equipment, this.state.player.inventory);
      if (damaged?.broke) {
        addMessage(this.state, `Your ${damaged.itemName} breaks.`);
        recomputePlayerCombatStats(this.state.player);
      }
    }

    if (defender.hp <= 0) {
      dropLoot(defender, region, this.rng, this.state.player.faction);
      removeActor(region, defender);
    }
  }
}

/** "a rusty machete", "12 caps", "the corpse of Corporal Vance". */
function describeGroundItem(item: { defId: string; quantity: number; corpse?: { name: string } }): string {
  if (item.corpse) return `the corpse of ${item.corpse.name.replace(/^the /, '')}`;
  const name = ITEMS[item.defId]?.name ?? 'an item';
  if (item.quantity > 1) return `${item.quantity} ${name}`;
  return withArticle(name);
}
