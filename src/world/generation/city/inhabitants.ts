import { getTileId, isWalkable, type GameMapData } from '../../GameMap';
import { randomInt, type RNG } from '../../../utils/RNG';
import { createMonster, type Monster } from '../../../entities/Monster';
import { MONSTERS } from '../../../entities/MonsterData';
import { rectContains, type Rect } from '../Rect';

/**
 * Who lives here.
 *
 * The area shipped with eight creatures on it, all of them on one road, and everywhere else was
 * scenery. Wildlife is scattered by **what a creature would actually be doing there** rather than
 * uniformly: rats and roaches in the ruins, dogs working the open ground, crows on anything, mold
 * in the wet. The result is that the texture of a place tells you what to expect from it, which is
 * most of what makes exploring a ruin different from crossing a car park.
 */
interface SpeciesRule {
  defId: string;
  /** Tiles it will be found on. */
  on: string[];
  /** One *placement* per this many eligible tiles — a placement being a group, where grouped. */
  per: number;
  /** Spawned as a group of this many, scattered within a few tiles of each other. */
  group?: [min: number, max: number];
}

const WILDLIFE: SpeciesRule[] = [
  // The ruins are full of vermin. By far the most common thing you meet, and the least dangerous.
  { defId: 'alleyRat', on: ['rubble', 'weeds'], per: 170 },
  { defId: 'ironRoach', on: ['rubble'], per: 190 },
  // Bigger rats keep to the flooded ground, which gives the wet parts their own reputation.
  { defId: 'bloatedRat', on: ['swamp'], per: 130 },
  { defId: 'blackMold', on: ['swamp', 'rubble'], per: 300 },

  // Dogs work the open ground, where they can run you down, and they come as a pack — which is
  // the whole difference between meeting one and meeting four. Deliberately few: four at speed 15
  // will kill a starting character, so a pack should be something you see coming down a street and
  // make a decision about, not the background texture.
  { defId: 'strayDog', on: ['street', 'weeds'], per: 1100, group: [3, 4] },
  { defId: 'junkyardDog', on: ['street', 'rubble'], per: 1400 },

  // Ambient life, so the place is never quite still.
  { defId: 'carrionCrow', on: ['weeds', 'rubble', 'street'], per: 700, group: [2, 4] },
  { defId: 'feralCat', on: ['weeds', 'rubble', 'street'], per: 400 },
];

/** How far a group's members are scattered from the spot the group was placed. */
const GROUP_SPREAD = 3;

/**
 * Scatters wildlife across a finished map.
 *
 * `avoid` keeps them out of the settlement — a ball park with rats wandering the concourse is not
 * a refuge, and the one place the player is supposed to be safe should not be generated into
 * danger. Everything else is fair game.
 */
export function populate(map: GameMapData, rng: RNG, avoid: Rect[] = []): Monster[] {
  const eligible = new Map<string, Array<{ x: number; y: number }>>();

  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (!isWalkable(map, x, y)) continue;
      if (avoid.some((rect) => rectContains(rect, x, y))) continue;

      const tile = getTileId(map, x, y);
      const spots = eligible.get(tile);
      if (spots) spots.push({ x, y });
      else eligible.set(tile, [{ x, y }]);
    }
  }

  const monsters: Monster[] = [];
  const taken = new Set<number>();

  for (const rule of WILDLIFE) {
    const def = MONSTERS[rule.defId];
    if (!def) continue;

    const spots = rule.on.flatMap((tile) => eligible.get(tile) ?? []);
    if (spots.length === 0) continue;

    const count = Math.floor(spots.length / rule.per);
    for (let i = 0; i < count; i++) {
      const anchor = spots[randomInt(rng, 0, spots.length - 1)]!;
      const size = rule.group ? randomInt(rng, rule.group[0], rule.group[1]) : 1;

      for (let member = 0; member < size; member++) {
        const x = anchor.x + (member === 0 ? 0 : randomInt(rng, -GROUP_SPREAD, GROUP_SPREAD));
        const y = anchor.y + (member === 0 ? 0 : randomInt(rng, -GROUP_SPREAD, GROUP_SPREAD));
        if (!isWalkable(map, x, y)) continue;
        if (avoid.some((rect) => rectContains(rect, x, y))) continue;

        // One creature per tile. Two spawned on top of each other would be indistinguishable on
        // screen and one of them could never be reached to be attacked.
        const index = y * map.width + x;
        if (taken.has(index)) continue;
        taken.add(index);

        monsters.push(createMonster(def, x, y));
      }
    }
  }

  return monsters;
}
