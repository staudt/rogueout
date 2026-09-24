import { isWalkable, setTileId, type GameMapData } from '../GameMap';

const NEIGHBOR_OFFSETS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const;

/** Every walkable tile 8-connected to (startX, startY), as "x,y" keys. */
export function reachableWalkable(map: GameMapData, startX: number, startY: number): Set<string> {
  const reached = new Set<string>();
  if (!isWalkable(map, startX, startY)) return reached;

  reached.add(`${startX},${startY}`);
  const queue: Array<[number, number]> = [[startX, startY]];
  let head = 0;

  while (head < queue.length) {
    const [x, y] = queue[head++]!;
    for (const [dx, dy] of NEIGHBOR_OFFSETS) {
      const nx = x + dx;
      const ny = y + dy;
      const key = `${nx},${ny}`;
      if (reached.has(key) || !isWalkable(map, nx, ny)) continue;
      reached.add(key);
      queue.push([nx, ny]);
    }
  }

  return reached;
}

/**
 * Fills in every walkable tile that isn't reachable from the given origin, so the finished map has
 * exactly one connected walkable component.
 *
 * Noise terrain naturally produces islands: a patch of grass ringed by water, a hollow inside a
 * rock ridge. They're unreachable, so from the player's side they're indistinguishable from solid
 * terrain — but they'd be a silent trap for anything that places content by picking a random
 * walkable tile, and they're exactly the failure `tests/region-connectivity.test.ts` guards
 * against. Sealing them (rather than tunneling to them) keeps the guarantee unconditional: no
 * seed can produce a pocket, because pockets stop existing.
 *
 * Returns the number of tiles filled.
 */
export function sealDisconnectedAreas(
  map: GameMapData,
  originX: number,
  originY: number,
  fillTileId = 'rock',
): number {
  const reached = reachableWalkable(map, originX, originY);
  let filled = 0;

  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (!isWalkable(map, x, y) || reached.has(`${x},${y}`)) continue;
      setTileId(map, x, y, fillTileId);
      filled++;
    }
  }

  return filled;
}
