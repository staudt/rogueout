import type { GameState } from './GameState';
import { addMessage, getActiveRegion } from './GameState';
import { EventBus, type GameEvents } from './EventBus';
import { addPoints, DIRECTION_VECTORS, type Direction } from '../utils/geometry';
import { getTileId, isOpaque, isWalkable } from '../world/GameMap';
import { stairwayDirection, type StairwayDirection } from '../world/Tile';
import { computeFOV } from '../fov/Shadowcasting';
import { markVisible, resetVisible } from '../fov/VisibilityState';
import { computeFovRadius } from '../combat/CombatFormulas';
import { DAYLIGHT_SIGHT_RADIUS } from '../config/constants';
import { resolveMeleeAttack } from '../combat/CombatResolver';
import { dropLoot } from '../combat/Death';
import { hasTag } from '../combat/DamageTypes';
import type { Monster } from '../entities/Monster';
import { MONSTERS } from '../entities/MonsterData';
import { recomputePlayerCombatStats } from '../entities/Player';
import { damageEquippedWeapon } from '../items/Equipment';
import { ITEMS } from '../items/ItemData';
import { runMonsterTurns, runNpcTurns } from '../ai/AIScheduler';
import { ensureRegionLoaded, REGIONS } from '../world/regions/RegionRegistry';
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

    const targetNpc = region.npcs.find((n) => n.x === target.x && n.y === target.y);
    if (targetNpc) {
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
    if (transition && !stairwayDirection(getTileId(region.map, target.x, target.y))) {
      this.crossTransition(transition.toRegion, transition.spawnX, transition.spawnY);
      this.state.turnCount += 1;
      this.events.emit('turn-ended', { turnCount: this.state.turnCount });
      return true;
    }

    this.announceTileContents();
    this.advanceTurn();
    return true;
  }

  /**
   * `>` / `<`: takes the staircase under the player. Returns false (no turn consumed) if there
   * isn't one leading that way, so a mistyped key costs nothing.
   */
  useStairs(direction: StairwayDirection): boolean {
    if (this.state.gameOver) return false;

    const region = getActiveRegion(this.state);
    const { x, y } = this.state.player;
    const here = stairwayDirection(getTileId(region.map, x, y));

    if (here !== direction) {
      addMessage(this.state, `There is no staircase leading ${direction} here.`);
      return false;
    }

    const transition = this.transitionAt(x, y);
    if (!transition) {
      addMessage(this.state, 'The staircase is blocked.');
      return false;
    }

    this.crossTransition(transition.toRegion, transition.spawnX, transition.spawnY);
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

  /** The staircase under the player, if any — used to keep the command menu contextual. */
  stairwayUnderPlayer(): StairwayDirection | null {
    const region = getActiveRegion(this.state);
    return stairwayDirection(getTileId(region.map, this.state.player.x, this.state.player.y));
  }

  private transitionAt(x: number, y: number) {
    return REGIONS[this.state.activeRegionId]?.transitions.find((t) => t.x === x && t.y === y);
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

  private crossTransition(toRegion: string, spawnX: number, spawnY: number): void {
    ensureRegionLoaded(this.state.regions, toRegion);
    this.state.activeRegionId = toRegion;
    this.state.player.x = spawnX;
    this.state.player.y = spawnY;
    const def = REGIONS[toRegion];
    addMessage(this.state, def?.arrival ?? `You enter ${def?.name ?? toRegion}.`);
    this.recomputeFOV();
    this.announceTileContents();
  }

  /** Reports what's on the player's current tile — a ground item, stairs, etc. */
  private announceTileContents(): void {
    const region = getActiveRegion(this.state);
    const { x, y } = this.state.player;

    const ground = region.groundItems.find((g) => g.x === x && g.y === y);
    if (ground) {
      const name = ITEMS[ground.item.defId]?.name ?? 'an item';
      const qty = ground.item.quantity > 1 ? `${ground.item.quantity} ${name}s` : withArticle(name);
      addMessage(this.state, `You see ${qty} here.`);
    }

    const announcement = TILE_ANNOUNCEMENTS[getTileId(region.map, x, y)];
    if (announcement) {
      addMessage(this.state, announcement);
    }
  }

  private attackMonster(monster: Monster): void {
    const region = getActiveRegion(this.state);
    const result = resolveMeleeAttack(this.rng, this.state.player, monster);

    // Whatever it was doing before, it has a quarrel with you now.
    if (!monster.provokedBy.includes(this.state.player.faction)) {
      monster.provokedBy.push(this.state.player.faction);
    }
    const def = MONSTERS[monster.defId];
    const weapon = this.state.player.equipment.weapon;

    // The kill is folded into the blow that caused it, rather than following as a second line —
    // one action should read as one sentence.
    const weaponDef = weapon ? ITEMS[weapon.defId] : undefined;
    // Nothing here knows what a head is: the weapon claims it can take one, the creature says
    // whether it has one, and the rule is just the two tags meeting.
    const decapitated =
      result.type === 'cut' &&
      hasTag(weaponDef?.traits, 'decapitates') &&
      hasTag(monster.tags, 'head');

    addMessage(
      this.state,
      narratePlayerAttack({
        target: def?.name ?? 'creature',
        verb: weaponDef?.attackVerb ?? UNARMED_VERB,
        hit: result.hit,
        damage: result.damage,
        targetMaxHp: monster.maxHp,
        killed: monster.hp <= 0,
        shrugged: result.shrugged,
        decapitated,
        seed: this.state.turnCount,
      }),
    );

    if (result.resisted) {
      addMessage(
        this.state,
        narrateResisted(def?.name ?? 'creature', weaponDef?.attackVerb ?? UNARMED_VERB, this.state.turnCount),
      );
    }

    if (result.hit && !result.shrugged) {
      const condition = narrateCondition(monster.hp, monster.maxHp);
      if (condition) addMessage(this.state, condition);

      const damaged = damageEquippedWeapon(this.state.player.equipment, this.state.player.inventory);
      if (damaged?.broke) {
        addMessage(this.state, `Your ${damaged.itemName} breaks.`);
        recomputePlayerCombatStats(this.state.player);
      }
    }

    if (monster.hp <= 0) {
      dropLoot(monster, region, this.rng);
      region.monsters = region.monsters.filter((m) => m !== monster);
    }
  }
}
