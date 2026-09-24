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

const ALL_DIRECTIONS: readonly Direction[] = ['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW'];

/**
 * Runs every living monster's turn (in the active region) after the player's. v1 AI is
 * deliberately simple: a monster either wanders randomly, or — if its behavior is 'chase' and
 * the player is within its awarenessRadius (a plain distance check, not FOV; see
 * MonsterData.ts) — closes in and attacks once adjacent.
 */
export function runMonsterTurns(state: GameState, rng: RNG): void {
  const region = getActiveRegion(state);

  for (const monster of region.monsters) {
    if (monster.hp <= 0 || state.gameOver) continue;

    const distance = chebyshevDistance(monster, state.player);
    const isAware = monster.behavior === 'chase' && distance <= monster.awarenessRadius;

    if (isAware && distance === 1) {
      attackPlayer(monster, state, rng);
    } else if (isAware) {
      moveToward(monster, state.player, state, region);
    } else {
      wander(monster, state, region, rng);
    }
  }

  region.monsters = region.monsters.filter((m) => m.hp > 0);
}

function attackPlayer(monster: Monster, state: GameState, rng: RNG): void {
  const result = resolveMeleeAttack(rng, monster, state.player);
  const name = MONSTERS[monster.defId]?.name ?? 'creature';

  addMessage(state, result.hit ? `The ${name} hits you for ${result.damage}.` : `The ${name} misses you.`);

  if (result.hit) {
    const damaged = damageEquippedArmor(state.player.equipment, state.player.inventory);
    if (damaged?.broke) {
      addMessage(state, `Your ${damaged.itemName} breaks!`);
      recomputePlayerCombatStats(state.player);
    }
  }

  if (state.player.hp <= 0) {
    state.gameOver = true;
    addMessage(state, 'You die...');
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
