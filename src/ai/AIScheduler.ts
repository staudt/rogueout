import type { GameState, RegionState } from '../engine/GameState';
import { addMessage, canSpot, getActiveRegion } from '../engine/GameState';
import { randomInt, type RNG } from '../utils/RNG';
import { addPoints, chebyshevDistance, DIRECTION_VECTORS, type Direction, type Point } from '../utils/geometry';
import { isWalkable } from '../world/GameMap';
import { MONSTERS } from '../entities/MonsterData';
import type { Monster } from '../entities/Monster';
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
import {
  actorLabel,
  callOutEnemy,
  livingActors,
  noticeCorpses,
  reactToAttack,
  removeActor,
  resolveInvestigation,
  type Actor,
  type Provokable,
} from './Actors';
import { narrateDistantFighting } from '../narrative/Shouts';
import {
  DETOUR_NODE_BUDGET,
  MAX_ACTIONS_PER_TURN,
  HEARING_RADIUS,
  NORMAL_SPEED,
  SCAVENGE_RADIUS,
} from '../config/constants';
import { nearestLoot, scavengeHere, scavenges } from './Scavenging';
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

    // Said the turn its nerve goes, not every turn it keeps running. Tracked on the creature so
    // it survives a save and doesn't outlive the run in module state.
    if (!monster.broken && isBroken(monster)) {
      monster.broken = true;
      if (canSpot(state, monster.x, monster.y)) {
        addMessage(state, `${actorLabel(monster)} breaks and runs.`.replace(/^./, (c) => c.toUpperCase()));
      }
    }

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
function takeAction(actor: Provokable, state: GameState, region: RegionState, rng: RNG): void {
  // A body on the ground is evidence, and it keeps: a killing done in private is still findable.
  noticeCorpses(state, region, actor);

  const behavior = effectiveBehavior(actor);

  if (behavior === 'flee') {
    const threat = actor.provokedBy.length > 0 ? findTarget(actor, state, region) : nearestOther(actor, state, region);
    if (threat) {
      // Running and screaming: the scream is the useful half.
      callOutEnemy(state, region, actor, threat.faction);
      moveAwayFrom(actor, threat, state, region);
    } else {
      actor.calledOut = false;
      wander(actor, state, region, rng);
    }
    return;
  }

  const target = behavior === 'chase' ? findTarget(actor, state, region) : null;
  if (target) {
    // Seeing the enemy is worth saying out loud — it's what pulls everyone else toward a fight.
    callOutEnemy(state, region, actor, target.faction);
    // Whatever they came to look at, this is more pressing.
    actor.investigating = null;
    if (chebyshevDistance(actor, target) === 1) attackTarget(actor, target, state, region, rng);
    else moveToward(actor, target, state, region);
    return;
  }

  // Nothing to fight, but something was heard. Go and see, then make up your mind.
  if (actor.investigating) {
    if (chebyshevDistance(actor, actor.investigating) > 1) {
      const before = { x: actor.x, y: actor.y };
      moveToward(actor, actor.investigating, state, region);

      // Couldn't get any closer — across water, behind a ridge, or simply too far to path. Give
      // up rather than stand there forever: the arrival check needs them to *reach* the place,
      // so an unreachable errand used to freeze an actor for the rest of the game.
      if (before.x === actor.x && before.y === actor.y) {
        actor.investigating = null;
      } else {
        return;
      }
    } else {
      const tookItUp = resolveInvestigation(actor);
      if (tookItUp && canSpot(state, actor.x, actor.y)) {
        addMessage(state, `${actorLabel(actor)} has seen enough.`.replace(/^./, (c) => c.toUpperCase()));
      }
      // They may now have someone to deal with; the next action will find them.
    }
  }

  // Nothing in sight any more: they'll shout again next time something turns up.
  actor.calledOut = false;

  // On the road, and nothing else to do: keep walking it.
  if (actor.kind === 'monster' && patrolStep(actor, state, region)) return;

  // Nothing to fight and nowhere to be: pick the ground clean.
  if (scavenges(actor)) {
    if (scavengeHere(state, region, actor)) return;
    const loot = nearestLoot(region, actor, SCAVENGE_RADIUS);
    if (loot) {
      moveToward(actor, loot, state, region);
      return;
    }
  }

  wander(actor, state, region, rng);
}

/**
 * What an actor will actually do this instant, which isn't always what its data says.
 *
 * Overrides, in order: anything with no stomach for a fight runs the moment it has one, anything
 * that's been hit fights back, and anything whose nerve has gone runs. Morale is per-creature
 * data (`MonsterDef.cowardly`) — the Wake break and run, Restoration troopers don't, and the
 * feral don't know how.
 */
function effectiveBehavior(actor: Provokable): 'wander' | 'chase' | 'flee' {
  if (actor.kind === 'npc' && actor.timid) return actor.provokedBy.length > 0 ? 'flee' : 'wander';
  if (isBroken(actor)) return 'flee';
  if (actor.provokedBy.length > 0) return 'chase';
  return actor.kind === 'monster' ? actor.behavior : 'wander';
}

function isBroken(actor: Provokable): boolean {
  if (actor.kind !== 'monster') return false;
  if (!MONSTERS[actor.defId]?.cowardly) return false;
  return actor.hp / actor.maxHp <= BADLY_HURT;
}

/** Whether this creature has a quarrel with that one — by faction, or because it was hit. */
function isEnemy(actor: Provokable, faction: string): boolean {
  return areHostile(actor.faction, faction) || actor.provokedBy.includes(faction);
}

/** The nearest hostile thing this actor can be bothered to notice, or null. */
function findTarget(actor: Provokable, state: GameState, region: RegionState): Actor | null {
  let best: Actor | null = null;
  let bestDistance = actor.awarenessRadius;

  for (const candidate of livingActors(state, region)) {
    if (candidate === actor) continue;
    if (!isEnemy(actor, candidate.faction)) continue;

    const distance = chebyshevDistance(actor, candidate);
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
function nearestOther(actor: Provokable, state: GameState, region: RegionState): Actor | null {
  let best: Actor | null = null;
  let bestDistance = actor.awarenessRadius;

  for (const candidate of livingActors(state, region)) {
    if (candidate === actor) continue;
    if (candidate.faction === actor.faction) continue;

    const distance = chebyshevDistance(actor, candidate);
    if (distance <= bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }

  return best;
}

function moveAwayFrom(monster: Provokable, threat: Point, state: GameState, region: RegionState): void {
  const dx = Math.sign(monster.x - threat.x);
  const dy = Math.sign(monster.y - threat.y);
  tryMoveMonster(monster, { x: monster.x + dx, y: monster.y + dy }, state, region);
}

/**
 * One actor hitting another — creature on creature, creature on townsfolk, anyone on the player.
 *
 * Reported only when the player can see it happen, or is in it: a battle two streets away
 * shouldn't fill the log with blow-by-blow nobody witnessed.
 */
function attackTarget(
  attacker: Provokable,
  defender: Actor,
  state: GameState,
  region: RegionState,
  rng: RNG,
): void {
  if (defender.kind === 'player') {
    attackPlayer(attacker, state, rng);
    return;
  }

  const result = resolveMeleeAttack(rng, attacker, defender);

  // Being hit is a reason to hit back, and the victim's friends take note.
  reactToAttack(state, region, defender, attacker.faction);

  // You only get the blow-by-blow for a fight you can actually make out. Terrain visibility isn't
  // the test: under daylight you can see a mile of road and still not tell who is hitting whom.
  // Out of sight but within earshot, a fight is just a fight, somewhere over there.
  const seen = canSpot(state, attacker.x, attacker.y) || canSpot(state, defender.x, defender.y);
  if (seen) {
    addMessage(
      state,
      narrateBystanderAttack({
        attacker: actorLabel(attacker),
        target: actorLabel(defender),
        hit: result.hit,
        killed: defender.hp <= 0,
        shrugged: result.shrugged,
        seed: state.turnCount,
      }),
    );
  } else if (chebyshevDistance(state.player, defender) <= HEARING_RADIUS) {
    addMessage(state, narrateDistantFighting(state.player, defender));
  }

  if (defender.hp <= 0) {
    dropLoot(defender, region, rng, attacker.faction);
    removeActor(region, defender);
  }
}

/** Someone hitting the player: the one case with armour, morale and a death to report. */
function attackPlayer(attacker: Provokable, state: GameState, rng: RNG): void {
  const { player } = state;
  const healthyBefore = player.hp > player.maxHp * BADLY_HURT;
  const result = resolveMeleeAttack(rng, attacker, player);

  addMessage(
    state,
    narrateMonsterAttack({
      attacker: actorLabel(attacker),
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

function moveToward(monster: Provokable, target: Point, state: GameState, region: RegionState): void {
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
function passableForMonster(monster: Provokable, state: GameState, region: RegionState) {
  return (x: number, y: number): boolean => {
    if (!isWalkable(region.map, x, y)) return false;
    if (x === state.player.x && y === state.player.y) return true;
    return !livingActors(state, region).some((a) => a !== monster && a.kind !== 'player' && a.x === x && a.y === y);
  };
}

function wander(monster: Provokable, state: GameState, region: RegionState, rng: RNG): void {
  const direction = ALL_DIRECTIONS[randomInt(rng, 0, ALL_DIRECTIONS.length - 1)] ?? 'N';
  tryMoveMonster(monster, addPoints(monster, DIRECTION_VECTORS[direction]), state, region);
}

/** Moves if the tile is free. Returns whether it actually went anywhere. */
function tryMoveMonster(monster: Provokable, target: Point, state: GameState, region: RegionState): boolean {
  if (!isWalkable(region.map, target.x, target.y)) return false;
  if (target.x === state.player.x && target.y === state.player.y) return false;
  if (livingActors(state, region).some((a) => a !== monster && a.kind !== 'player' && a.x === target.x && a.y === target.y)) {
    return false;
  }

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
    if (npc.hp <= 0 || state.gameOver) continue;

    // Someone with a quarrel stops sweeping the step and deals with it, using the same AI as
    // anything else — that's the point of NPCs being actors.
    if (npc.provokedBy.length > 0 || npc.investigating) {
      npc.energy += npc.speed;
      let actions = 0;
      while (npc.energy >= NORMAL_SPEED && actions < MAX_ACTIONS_PER_TURN) {
        npc.energy -= NORMAL_SPEED;
        actions += 1;
        if (npc.hp <= 0 || state.gameOver) break;
        takeAction(npc, state, region, rng);
      }
      continue;
    }

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

  region.npcs = region.npcs.filter((n) => n.hp > 0);
}

/**
 * One step of a patrol along the region's road.
 *
 * Waypoints are walked in order and wrap, so a group paces the same route indefinitely. That
 * regularity is the point: two hostile patrols on one road will meet, whereas two groups
 * wandering at random on a 70x30 map essentially never would.
 */
function patrolStep(monster: Monster, state: GameState, region: RegionState): boolean {
  if (monster.patrolIndex === undefined) return false; // not one of the road bands
  const route = region.patrolRoute;
  if (!route || route.length === 0) return false;

  const index = monster.patrolIndex;
  const waypoint = route[index % route.length]!;

  if (chebyshevDistance(monster, waypoint) <= 1) {
    monster.patrolIndex = (index + 1) % route.length;
    return false; // arrived; spend the action on whatever else is going on
  }

  // Deliberately the same mover the hunting AI uses, detour search and all. A hand-rolled
  // three-candidate step was tried first and produced patrollers who wedged themselves against a
  // rock and stood there for the rest of the game.
  const before = { x: monster.x, y: monster.y };
  moveToward(monster, waypoint, state, region);

  if (before.x === monster.x && before.y === monster.y) {
    // Wedged, or the route is unreachable from here. Try the next waypoint rather than sulk.
    monster.patrolIndex = (index + 1) % route.length;
    return false;
  }

  return true;
}
