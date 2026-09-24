import type { GameState, RegionState } from '../engine/GameState';
import { addMessage, getActiveRegion } from '../engine/GameState';
import { randomInt, type RNG } from '../utils/RNG';
import { addPoints, chebyshevDistance, DIRECTION_VECTORS, type Direction, type Point } from '../utils/geometry';
import { isWalkable } from '../world/GameMap';
import type { Monster } from '../entities/Monster';
import { MONSTERS } from '../entities/MonsterData';
import { resolveMeleeAttack } from '../combat/CombatResolver';
import { dropLoot } from '../combat/Death';
import { recomputePlayerCombatStats } from '../entities/Player';
import { damageEquippedArmor } from '../items/Equipment';
import {
  BADLY_HURT,
  narrateBystanderAttack,
  narrateMonsterAttack,
  PLAYER_BADLY_HURT,
  PLAYER_DEATH,
} from '../narrative/Narration';
import { areHostile } from '../world/Factions';
import { isVisible } from '../fov/VisibilityState';
import { DETOUR_NODE_BUDGET, MAX_ACTIONS_PER_TURN, NORMAL_SPEED } from '../config/constants';
import { findPath } from '../pathfinding/BFS';

const ALL_DIRECTIONS: readonly Direction[] = ['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW'];

/**
 * Runs every living monster's turn (in the active region) after the player's.
 *
 * A monster looks for the nearest thing its *faction* is hostile to — which may be the player or
 * may be another monster — within its awarenessRadius (a plain distance check, not FOV; see
 * MonsterData.ts), closes in, and attacks once adjacent. Otherwise it wanders.
 *
 * How *many* times it does that in one of your turns depends on its speed.
 *
 * That the player is just another candidate target is the whole point: two opposed groups on the
 * same map fight each other with nothing scripting it, whether or not the player is involved or
 * even present.
 */
export function runMonsterTurns(state: GameState, rng: RNG): void {
  const region = getActiveRegion(state);

  for (const monster of region.monsters) {
    if (monster.hp <= 0 || state.gameOver) continue;

    // Bank this turn's movement points and spend them. A creature at twice NORMAL_SPEED acts
    // twice per player turn — closing two tiles while you close one, and landing two blows
    // between yours. Leftover points carry over, so speed 18 alternates one action and two.
    monster.energy += monster.speed;

    let actions = 0;
    while (monster.energy >= NORMAL_SPEED && actions < MAX_ACTIONS_PER_TURN) {
      monster.energy -= NORMAL_SPEED;
      actions += 1;

      if (monster.hp <= 0 || state.gameOver) break;
      takeAction(monster, state, region, rng);
    }
  }

  region.monsters = region.monsters.filter((m) => m.hp > 0);
}

/** One action: close on the nearest hostile, hit it if adjacent, run from danger, or mill about. */
function takeAction(monster: Monster, state: GameState, region: RegionState, rng: RNG): void {
  // Anything that's been hit stops running and stops grazing: a cornered animal fights.
  const behavior = monster.provokedBy.length > 0 ? 'chase' : monster.behavior;

  if (behavior === 'flee') {
    const threat = nearestOther(monster, state, region);
    if (threat) moveAwayFrom(monster, threat, state, region);
    else wander(monster, state, region, rng);
    return;
  }

  const target = behavior === 'chase' ? findTarget(monster, state, region) : null;
  if (!target) {
    wander(monster, state, region, rng);
    return;
  }

  if (chebyshevDistance(monster, target) === 1) {
    if (target === state.player) attackPlayer(monster, state, rng);
    else attackMonster(monster, target as Monster, state, region, rng);
  } else {
    moveToward(monster, target, state, region);
  }
}

/** Whether this creature has a quarrel with that one — by faction, or because it was hit. */
function isEnemy(monster: Monster, faction: string): boolean {
  return areHostile(monster.faction, faction) || monster.provokedBy.includes(faction);
}

/** The nearest hostile thing this monster can be bothered to notice, or null. */
function findTarget(monster: Monster, state: GameState, region: RegionState): Point | null {
  let best: Point | null = null;
  let bestDistance = monster.awarenessRadius;

  const candidates: Array<Point & { faction: string; hp: number }> = [state.player, ...region.monsters];
  for (const candidate of candidates) {
    if (candidate === monster || candidate.hp <= 0) continue;
    if (!isEnemy(monster, candidate.faction)) continue;

    const distance = chebyshevDistance(monster, candidate);
    if (distance <= bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }

  return best;
}

/**
 * The nearest thing that isn't one of its own — what a skittish animal runs from. Deliberately
 * *not* the hostility check: a skink has no enemies, it just doesn't want to be near you.
 */
function nearestOther(monster: Monster, state: GameState, region: RegionState): Point | null {
  let best: Point | null = null;
  let bestDistance = monster.awarenessRadius;

  const candidates: Array<Point & { faction: string; hp: number }> = [state.player, ...region.monsters];
  for (const candidate of candidates) {
    if (candidate === monster || candidate.hp <= 0) continue;
    if (candidate.faction === monster.faction) continue;

    const distance = chebyshevDistance(monster, candidate);
    if (distance <= bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }

  return best;
}

function moveAwayFrom(monster: Monster, threat: Point, state: GameState, region: RegionState): void {
  const dx = Math.sign(monster.x - threat.x);
  const dy = Math.sign(monster.y - threat.y);
  tryMoveMonster(monster, { x: monster.x + dx, y: monster.y + dy }, state, region);
}

/**
 * One monster hitting another. Reported only when the player can actually see it happen —
 * otherwise a distant battle would fill the log with events nobody witnessed.
 */
function attackMonster(
  attacker: Monster,
  defender: Monster,
  state: GameState,
  region: RegionState,
  rng: RNG,
): void {
  const result = resolveMeleeAttack(rng, attacker, defender);
  if (defender.hp <= 0) dropLoot(defender, region, rng);
  const seen =
    isVisible(region.visibility, attacker.x, attacker.y) || isVisible(region.visibility, defender.x, defender.y);

  if (seen) {
    addMessage(
      state,
      narrateBystanderAttack({
        attacker: MONSTERS[attacker.defId]?.name ?? 'creature',
        target: MONSTERS[defender.defId]?.name ?? 'creature',
        hit: result.hit,
        killed: defender.hp <= 0,
        shrugged: result.shrugged,
        seed: state.turnCount,
      }),
    );
  }
}

function attackPlayer(monster: Monster, state: GameState, rng: RNG): void {
  const { player } = state;
  const healthyBefore = player.hp > player.maxHp * BADLY_HURT;
  const result = resolveMeleeAttack(rng, monster, player);

  addMessage(
    state,
    narrateMonsterAttack({
      attacker: MONSTERS[monster.defId]?.name ?? 'creature',
      hit: result.hit,
      damage: result.damage,
      targetMaxHp: player.maxHp,
      shrugged: result.shrugged,
      seed: state.turnCount,
    }),
  );

  if (result.hit && !result.shrugged) {
    const damaged = damageEquippedArmor(player.equipment, player.inventory);
    if (damaged?.broke) {
      addMessage(state, `Your ${damaged.itemName} breaks.`);
      recomputePlayerCombatStats(player);
    }
  }

  if (player.hp <= 0) {
    state.gameOver = true;
    addMessage(state, PLAYER_DEATH);
    return;
  }

  // Said once, as you cross into trouble — repeating it every turn after would be noise.
  if (healthyBefore && player.hp <= player.maxHp * BADLY_HURT) {
    addMessage(state, PLAYER_BADLY_HURT);
  }
}

/**
 * Closes on a target, going *around* whatever is in the way.
 *
 * The straight step is tried first because it's free and almost always right. Only when it's
 * blocked — by a wall, or by a packmate standing in the doorway — does this fall back to a real
 * search. Without that fallback anything hunting you simply stops the moment another creature is
 * between you, which is fine for a mold and absurd for a feral ghoul.
 *
 * The search is deliberately cheap. It needs a way *round the obstruction*, not a grand tour of
 * the map, so the node budget is small; if no short detour exists the creature holds position
 * rather than spending the turn wandering off.
 */
function moveToward(monster: Monster, target: Point, state: GameState, region: RegionState): void {
  const dx = Math.sign(target.x - monster.x);
  const dy = Math.sign(target.y - monster.y);
  if (tryMoveMonster(monster, { x: monster.x + dx, y: monster.y + dy }, state, region)) return;

  const path = findPath(monster, target, passableForMonster(monster, state, region), DETOUR_NODE_BUDGET);
  const next = path?.[0];
  if (next) tryMoveMonster(monster, next, state, region);
}

/**
 * Where this creature could stand. The target's own tile counts as passable — otherwise `findPath`
 * refuses a goal that is, by definition, occupied by the thing being hunted — and stepping onto
 * it is prevented by tryMoveMonster anyway, so arriving adjacent is what actually happens.
 */
function passableForMonster(monster: Monster, state: GameState, region: RegionState) {
  return (x: number, y: number): boolean => {
    if (!isWalkable(region.map, x, y)) return false;
    if (x === state.player.x && y === state.player.y) return true;
    return !region.monsters.some((m) => m !== monster && m.hp > 0 && m.x === x && m.y === y);
  };
}

function wander(monster: Monster, state: GameState, region: RegionState, rng: RNG): void {
  const direction = ALL_DIRECTIONS[randomInt(rng, 0, ALL_DIRECTIONS.length - 1)] ?? 'N';
  tryMoveMonster(monster, addPoints(monster, DIRECTION_VECTORS[direction]), state, region);
}

/** Moves if the tile is free. Returns whether it actually went anywhere. */
function tryMoveMonster(monster: Monster, target: Point, state: GameState, region: RegionState): boolean {
  if (!isWalkable(region.map, target.x, target.y)) return false;
  if (target.x === state.player.x && target.y === state.player.y) return false;
  if (region.monsters.some((m) => m !== monster && m.hp > 0 && m.x === target.x && m.y === target.y)) return false;

  monster.x = target.x;
  monster.y = target.y;
  return true;
}

/**
 * Townsfolk going about their day. They aren't combatants — they drift around wherever they
 * belong and get out of the way. Without this a settlement reads as a diorama: the difference
 * between a town and a set is whether anyone in it moves.
 */
export function runNpcTurns(state: GameState, rng: RNG): void {
  const region = getActiveRegion(state);

  for (const npc of region.npcs) {
    const radius = npc.wanderRadius ?? 0;
    if (radius <= 0) continue;

    const direction = ALL_DIRECTIONS[randomInt(rng, 0, ALL_DIRECTIONS.length - 1)] ?? 'N';
    const target = addPoints(npc, DIRECTION_VECTORS[direction]);

    const home = npc.home ?? npc;
    if (chebyshevDistance(target, home) > radius) continue;
    if (!isWalkable(region.map, target.x, target.y)) continue;
    if (target.x === state.player.x && target.y === state.player.y) continue;
    if (region.monsters.some((m) => m.hp > 0 && m.x === target.x && m.y === target.y)) continue;
    if (region.npcs.some((other) => other !== npc && other.x === target.x && other.y === target.y)) continue;

    npc.x = target.x;
    npc.y = target.y;
  }
}
