import type { GameState, RegionState } from '../engine/GameState';
import { addMessage, getActiveRegion } from '../engine/GameState';
import { randomInt, type RNG } from '../utils/RNG';
import { addPoints, chebyshevDistance, DIRECTION_VECTORS, type Direction, type Point } from '../utils/geometry';
import { isWalkable } from '../world/GameMap';
import type { Monster } from '../entities/Monster';
import { MONSTERS } from '../entities/MonsterData';
import { resolveMeleeAttack } from '../combat/CombatResolver';
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

const ALL_DIRECTIONS: readonly Direction[] = ['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW'];

/**
 * Runs every living monster's turn (in the active region) after the player's.
 *
 * A monster looks for the nearest thing its *faction* is hostile to — which may be the player or
 * may be another monster — within its awarenessRadius (a plain distance check, not FOV; see
 * MonsterData.ts), closes in, and attacks once adjacent. Otherwise it wanders.
 *
 * That the player is just another candidate target is the whole point: two opposed groups on the
 * same map fight each other with nothing scripting it, whether or not the player is involved or
 * even present.
 */
export function runMonsterTurns(state: GameState, rng: RNG): void {
  const region = getActiveRegion(state);

  for (const monster of region.monsters) {
    if (monster.hp <= 0 || state.gameOver) continue;

    const target = findTarget(monster, state, region);
    if (!target) {
      wander(monster, state, region, rng);
      continue;
    }

    if (chebyshevDistance(monster, target) === 1) {
      if (target === state.player) attackPlayer(monster, state, rng);
      else attackMonster(monster, target as Monster, state, region, rng);
    } else {
      moveToward(monster, target, state, region);
    }
  }

  region.monsters = region.monsters.filter((m) => m.hp > 0);
}

/** The nearest hostile thing this monster can be bothered to notice, or null. */
function findTarget(monster: Monster, state: GameState, region: RegionState): Point | null {
  if (monster.behavior !== 'chase') return null;

  let best: Point | null = null;
  let bestDistance = monster.awarenessRadius;

  const candidates: Array<Point & { faction: string; hp: number }> = [state.player, ...region.monsters];
  for (const candidate of candidates) {
    if (candidate === monster || candidate.hp <= 0) continue;
    if (!areHostile(monster.faction, candidate.faction)) continue;

    const distance = chebyshevDistance(monster, candidate);
    if (distance <= bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }

  return best;
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

function moveToward(monster: Monster, target: Point, state: GameState, region: RegionState): void {
  const dx = Math.sign(target.x - monster.x);
  const dy = Math.sign(target.y - monster.y);
  tryMoveMonster(monster, { x: monster.x + dx, y: monster.y + dy }, state, region);
}

function wander(monster: Monster, state: GameState, region: RegionState, rng: RNG): void {
  const direction = ALL_DIRECTIONS[randomInt(rng, 0, ALL_DIRECTIONS.length - 1)] ?? 'N';
  tryMoveMonster(monster, addPoints(monster, DIRECTION_VECTORS[direction]), state, region);
}

function tryMoveMonster(monster: Monster, target: Point, state: GameState, region: RegionState): void {
  if (!isWalkable(region.map, target.x, target.y)) return;
  if (target.x === state.player.x && target.y === state.player.y) return;
  if (region.monsters.some((m) => m !== monster && m.hp > 0 && m.x === target.x && m.y === target.y)) return;

  monster.x = target.x;
  monster.y = target.y;
}
