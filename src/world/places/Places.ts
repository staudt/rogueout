import type { Point } from '../../utils/geometry';
import type { Monster } from '../../entities/Monster';
import type { Npc } from '../../entities/Npc';
import type { GroundItem } from '../../items/Item';
import type { RegionTransition } from '../regions/RegionTypes';
import { rectContains, type Rect } from '../generation/Rect';

/**
 * A named somewhere, at known coordinates.
 *
 * This replaces marking landmarks with their own plan character. One character per landmark did
 * not scale — the alphabet was going to run out well before the interesting places did, and every
 * letter spent on a landmark was one the terrain couldn't have. A table has no such budget: fifty
 * places is fifty rows.
 *
 * It also earns its keep three more times over. The rect says where a place's **contents** go, so
 * its people and doors land in the right spot. It gives the player a **location** — "Wrigley
 * Field", "the Addison station" — instead of a pair of numbers. And what is drawn inside it is
 * **protected** from the ruin, flood and growth passes, which is what makes hand-drawn art safe
 * to put on a map that is otherwise being weathered.
 *
 * Note what a place no longer does: it does not *draw* anything. The art is in the plan, drawn by
 * hand, which is the point — a ball park somebody laid out tile by tile is worth more than one a
 * function produced from concentric bands.
 */
export interface PlaceContents {
  transitions?: RegionTransition[];
  npcs?: Npc[];
  monsters?: Monster[];
  groundItems?: GroundItem[];
}

export interface Place {
  id: string;
  /** What the player is told they're standing in. */
  name: string;
  /** Where it is, in world coordinates. The plan draws it; this says where "it" is. */
  rect: Rect;
  /** Everything living in it, given the rect's top-left corner. */
  contents?: (origin: Point) => PlaceContents;
  /**
   * Tiles that must still be walkable and reachable when generation finishes, relative to the
   * rect's top-left. Generation throws if any of them isn't — a doorway quietly walled off is the
   * kind of failure that would otherwise only turn up in a playthrough.
   */
  anchors?: Point[];
  /**
   * Wildlife isn't scattered here. What walks in afterwards is another matter — the settlement is
   * meant to be *mostly* safe, not safe.
   */
  sanctuary?: boolean;
  /**
   * Whether what's drawn here survives the weather. True for anything hand-drawn; false for a
   * place that is only a *name* for a stretch of ground the generator is still free to wreck.
   */
  authored?: boolean;
}

/** The place the player is standing in, innermost first, or null out on the open street. */
export function placeAt(places: readonly Place[], at: Point): Place | null {
  let best: Place | null = null;
  let bestArea = Infinity;

  for (const place of places) {
    if (!rectContains(place.rect, at.x, at.y)) continue;
    // Smallest wins, so standing in the clubhouse doorway reads as the clubhouse rather than as
    // the ball park that contains it.
    const area = (place.rect.x1 - place.rect.x0 + 1) * (place.rect.y1 - place.rect.y0 + 1);
    if (area < bestArea) {
      bestArea = area;
      best = place;
    }
  }

  return best;
}
