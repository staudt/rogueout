import type { AreaDef, StreetDef } from './AreaDef';
import { streetRect } from './AreaDef';
import type { Rect } from '../Rect';

/**
 * The street lattice as a graph: intersections are nodes, the stretches between them are edges.
 *
 * **Connectivity is reasoned about here, on a few dozen nodes, and never on the tile grid.** That
 * is the whole trick. A 192x192 area has ~37,000 tiles, and asking "would burying this stretch
 * strand anything?" of the grid would be a flood fill per proposal. Asked of the graph it is a
 * walk over ~100 nodes, cheap enough to do for every stretch the damage pass wants to take.
 *
 * The desert solved the same problem by carving a road *after* the damage and sealing whatever was
 * left stranded. That works when the map is mostly open. A city is mostly solid, so a seal pass
 * running after the fact would happily brick up half a district; the connectivity has to be
 * preserved as damage is applied, not repaired afterwards.
 */
export interface StreetSegment {
  id: number;
  /** The street this stretch belongs to. */
  street: StreetDef;
  /** Node ids at either end. */
  from: number;
  to: number;
  /** The tiles this stretch covers. */
  rect: Rect;
  buried: boolean;
}

interface Node {
  id: number;
  x: number;
  y: number;
}

export class StreetGraph {
  private readonly nodes: Node[] = [];
  private readonly segments: StreetSegment[] = [];
  private readonly nodeAt = new Map<string, number>();

  constructor(area: AreaDef) {
    const ns = area.streets.filter((s) => s.axis === 'ns').sort((a, b) => a.at - b.at);
    const ew = area.streets.filter((s) => s.axis === 'ew').sort((a, b) => a.at - b.at);

    // A node per crossing. Streets that never meet another street have nothing to connect and are
    // left out — they'd be a dead end by construction, which the area def shouldn't be declaring.
    for (const column of ns) {
      for (const row of ew) {
        this.addNode(column.at, row.at);
      }
    }

    for (const column of ns) {
      for (let i = 0; i < ew.length - 1; i++) {
        this.addSegment(column, ew[i]!, ew[i + 1]!, area);
      }
    }
    for (const row of ew) {
      for (let i = 0; i < ns.length - 1; i++) {
        this.addSegment(row, ns[i]!, ns[i + 1]!, area);
      }
    }
  }

  private addNode(x: number, y: number): number {
    const key = `${x},${y}`;
    const existing = this.nodeAt.get(key);
    if (existing !== undefined) return existing;

    const id = this.nodes.length;
    this.nodes.push({ id, x, y });
    this.nodeAt.set(key, id);
    return id;
  }

  private addSegment(street: StreetDef, a: StreetDef, b: StreetDef, area: AreaDef): void {
    const full = streetRect(street, area);
    const rect: Rect =
      street.axis === 'ns'
        ? { x0: full.x0, x1: full.x1, y0: a.at, y1: b.at + b.width - 1 }
        : { y0: full.y0, y1: full.y1, x0: a.at, x1: b.at + b.width - 1 };

    const from =
      street.axis === 'ns' ? this.nodeAt.get(`${street.at},${a.at}`) : this.nodeAt.get(`${a.at},${street.at}`);
    const to =
      street.axis === 'ns' ? this.nodeAt.get(`${street.at},${b.at}`) : this.nodeAt.get(`${b.at},${street.at}`);
    if (from === undefined || to === undefined) return;

    this.segments.push({ id: this.segments.length, street, from, to, rect, buried: false });
  }

  allSegments(): readonly StreetSegment[] {
    return this.segments;
  }

  /**
   * Buries a stretch of street — **unless doing so would cut the lattice in two.**
   *
   * Returns whether it took. The refusal is the point: it means the damage pass can propose
   * whatever the noise field asks for and never has to understand connectivity itself, and the
   * finished map is connected by construction rather than by a repair pass hoping to catch
   * everything.
   */
  bury(segmentId: number): boolean {
    const segment = this.segments[segmentId];
    if (!segment || segment.buried) return false;

    segment.buried = true;
    if (this.isConnected()) return true;

    segment.buried = false;
    return false;
  }

  /** Whether every node is still reachable from the first one over unburied stretches. */
  private isConnected(): boolean {
    if (this.nodes.length === 0) return true;

    const adjacency = new Map<number, number[]>();
    for (const segment of this.segments) {
      if (segment.buried) continue;
      (adjacency.get(segment.from) ?? adjacency.set(segment.from, []).get(segment.from)!).push(segment.to);
      (adjacency.get(segment.to) ?? adjacency.set(segment.to, []).get(segment.to)!).push(segment.from);
    }

    const seen = new Set<number>([0]);
    const queue = [0];
    let head = 0;
    while (head < queue.length) {
      const current = queue[head++]!;
      for (const next of adjacency.get(current) ?? []) {
        if (seen.has(next)) continue;
        seen.add(next);
        queue.push(next);
      }
    }

    return seen.size === this.nodes.length;
  }
}
