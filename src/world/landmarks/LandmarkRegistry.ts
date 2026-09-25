import type { Point } from '../../utils/geometry';
import type { Monster } from '../../entities/Monster';
import type { Npc } from '../../entities/Npc';
import type { GroundItem } from '../../items/Item';
import type { RegionTransition } from '../regions/RegionTypes';
import type { Rect } from '../generation/Rect';
import { WRIGLEY_FIELD } from './wrigleyField';
import { ADDISON_STATION } from './addisonStation';

/** What a landmark contributes once it's been placed at a world position. */
export interface LandmarkContents {
  transitions?: RegionTransition[];
  npcs?: Npc[];
  monsters?: Monster[];
  groundItems?: GroundItem[];
}

/**
 * A place the city is built around rather than one it happens to produce.
 *
 * Stamped programmatically rather than written as ASCII art — the same decision the handcrafted
 * maps made back in M5, and for the same reason: counting characters in a 40-line block is how
 * the sealed-room bug shipped.
 */
export interface LandmarkDef {
  id: string;
  name: string;
  width: number;
  height: number;
  /** Draws the landmark in *landmark-local* coordinates, 0,0 at its top-left. */
  stamp: (put: (x: number, y: number, tileId: string) => void) => void;
  /** Everything living inside it, given where it ended up. */
  contents?: (origin: Point) => LandmarkContents;
  /**
   * Tiles that must still be walkable and reachable when generation finishes, landmark-local.
   * Generation throws if any of them isn't — a landmark quietly walled off by a damage pass is
   * exactly the kind of failure that would otherwise only turn up in a playthrough.
   */
  anchors?: Point[];
  /** Extra rects to keep generation off, beyond the landmark's own footprint. Landmark-local. */
  protect?: Rect[];
}

export const LANDMARKS: Record<string, LandmarkDef> = {
  wrigleyField: WRIGLEY_FIELD,
  addisonStation: ADDISON_STATION,
};

export function landmarkRect(def: LandmarkDef, origin: Point): Rect {
  return { x0: origin.x, y0: origin.y, x1: origin.x + def.width - 1, y1: origin.y + def.height - 1 };
}
