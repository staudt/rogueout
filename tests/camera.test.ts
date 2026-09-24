import { describe, expect, it } from 'vitest';
import { Camera } from '../src/ui/Camera';
import { TILE_SIZE } from '../src/config/constants';

/**
 * Camera scrolling went untested for a long time because every map was smaller than the fixed
 * viewport, so the clamping never actually ran. Now that the viewport is sized to the window it
 * can be larger *or* smaller than a map, and both directions matter.
 */
describe('Camera', () => {
  it('centers on the focus in the middle of a large map', () => {
    const camera = new Camera();
    camera.resize(40, 20);

    camera.centerOn({ x: 50, y: 40 }, 200, 100);

    expect(camera.originX).toBe(30); // 50 - 40/2
    expect(camera.originY).toBe(30); // 40 - 20/2
  });

  it('stops at the top-left corner instead of scrolling past it', () => {
    const camera = new Camera();
    camera.resize(40, 20);

    camera.centerOn({ x: 3, y: 2 }, 200, 100);

    expect(camera.originX).toBe(0);
    expect(camera.originY).toBe(0);
  });

  it('stops at the bottom-right corner instead of scrolling past it', () => {
    const camera = new Camera();
    camera.resize(40, 20);

    camera.centerOn({ x: 199, y: 99 }, 200, 100);

    expect(camera.originX).toBe(160); // 200 - 40
    expect(camera.originY).toBe(80); // 100 - 20
  });

  it('centers a map smaller than the viewport rather than pinning it to a corner', () => {
    // A 16x10 dungeon in a viewport that fits 60x30 tiles: the origin goes negative so the room
    // sits in the middle of the screen with even margins.
    const camera = new Camera();
    camera.resize(60, 30);

    camera.centerOn({ x: 8, y: 5 }, 16, 10);

    expect(camera.originX).toBe(-22); // -(60 - 16) / 2
    expect(camera.originY).toBe(-10); // -(30 - 10) / 2
  });

  it('keeps a smaller map centered no matter where the player stands in it', () => {
    const camera = new Camera();
    camera.resize(60, 30);

    camera.centerOn({ x: 1, y: 1 }, 16, 10);
    const corner = { x: camera.originX, y: camera.originY };
    camera.centerOn({ x: 14, y: 8 }, 16, 10);

    expect({ x: camera.originX, y: camera.originY }).toEqual(corner);
  });

  it('never collapses to a zero-tile viewport', () => {
    const camera = new Camera();
    camera.resize(0, -5);

    expect(camera.cols).toBe(1);
    expect(camera.rows).toBe(1);
  });

  describe('pixel <-> grid conversion', () => {
    it('round-trips a world tile through screen pixels', () => {
      const camera = new Camera();
      camera.resize(40, 20);
      camera.centerOn({ x: 50, y: 40 }, 200, 100);

      const screen = camera.worldToScreen(52, 43);
      expect(camera.screenToWorld(screen.x, screen.y)).toEqual({ x: 52, y: 43 });
    });

    it('maps any pixel inside a tile back to that tile', () => {
      const camera = new Camera();
      camera.resize(40, 20);
      camera.centerOn({ x: 50, y: 40 }, 200, 100);

      const topLeft = camera.worldToScreen(52, 43);
      for (const [dx, dy] of [
        [0, 0],
        [TILE_SIZE - 1, 0],
        [0, TILE_SIZE - 1],
        [TILE_SIZE - 1, TILE_SIZE - 1],
      ]) {
        expect(camera.screenToWorld(topLeft.x + dx!, topLeft.y + dy!)).toEqual({ x: 52, y: 43 });
      }
    });

    it('resolves clicks correctly while the map is centered at a negative origin', () => {
      const camera = new Camera();
      camera.resize(60, 30);
      camera.centerOn({ x: 8, y: 5 }, 16, 10);

      // The map's own (0,0) is drawn 22 tiles in from the canvas's left edge.
      expect(camera.screenToWorld(22 * TILE_SIZE, 10 * TILE_SIZE)).toEqual({ x: 0, y: 0 });
    });
  });
});
