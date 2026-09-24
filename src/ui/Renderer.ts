import type { GameState } from '../engine/GameState';
import { getActiveRegion } from '../engine/GameState';
import { TILE_SIZE, VIEWPORT_COLS, VIEWPORT_ROWS } from '../config/constants';
import { getTileId } from '../world/GameMap';
import { TILES } from '../world/Tile';
import { isExplored, isVisible } from '../fov/VisibilityState';
import { ITEMS } from '../items/ItemData';
import type { Camera } from './Camera';

/** Overlay drawn on explored-but-not-currently-visible ("remembered") tiles to dim them. */
const REMEMBERED_OVERLAY = 'rgba(0, 0, 0, 0.65)';

/** Draws the current viewport as a monospace glyph grid onto a single canvas. */
export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly canvas: HTMLCanvasElement;
  private readonly camera: Camera;

  constructor(canvas: HTMLCanvasElement, camera: Camera) {
    this.canvas = canvas;
    this.camera = camera;
    canvas.width = VIEWPORT_COLS * TILE_SIZE;
    canvas.height = VIEWPORT_ROWS * TILE_SIZE;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    this.ctx = ctx;
    this.ctx.font = `${TILE_SIZE - 4}px monospace`;
    this.ctx.textBaseline = 'top';
  }

  render(state: GameState): void {
    const region = getActiveRegion(state);
    this.camera.centerOn(state.player, region.map.width, region.map.height);
    const { ctx } = this;

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    for (let sy = 0; sy < VIEWPORT_ROWS; sy++) {
      const worldY = this.camera.originY + sy;
      for (let sx = 0; sx < VIEWPORT_COLS; sx++) {
        const worldX = this.camera.originX + sx;

        const visible = isVisible(region.visibility, worldX, worldY);
        const explored = visible || isExplored(region.visibility, worldX, worldY);
        if (!explored) continue; // unexplored: leave blank

        const tile = TILES[getTileId(region.map, worldX, worldY)];
        if (!tile) continue;

        const px = sx * TILE_SIZE;
        const py = sy * TILE_SIZE;

        if (tile.bg !== '#000000') {
          ctx.fillStyle = tile.bg;
          ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        }
        ctx.fillStyle = tile.fg;
        ctx.fillText(tile.glyph, px + 2, py + 2);

        if (!visible) {
          ctx.fillStyle = REMEMBERED_OVERLAY;
          ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        }
      }
    }

    for (const ground of region.groundItems) {
      if (!isVisible(region.visibility, ground.x, ground.y)) continue;
      const def = ITEMS[ground.item.defId];
      if (!def) continue;
      const screen = this.camera.worldToScreen(ground.x, ground.y);
      ctx.fillStyle = def.fg;
      ctx.fillText(def.glyph, screen.x + 2, screen.y + 2);
    }

    for (const npc of region.npcs) {
      if (!isVisible(region.visibility, npc.x, npc.y)) continue;
      const screen = this.camera.worldToScreen(npc.x, npc.y);
      ctx.fillStyle = npc.fg;
      ctx.fillText(npc.glyph, screen.x + 2, screen.y + 2);
    }

    for (const monster of region.monsters) {
      if (!isVisible(region.visibility, monster.x, monster.y)) continue;
      const screen = this.camera.worldToScreen(monster.x, monster.y);
      ctx.fillStyle = monster.fg;
      ctx.fillText(monster.glyph, screen.x + 2, screen.y + 2);
    }

    if (isVisible(region.visibility, state.player.x, state.player.y)) {
      const playerScreen = this.camera.worldToScreen(state.player.x, state.player.y);
      ctx.fillStyle = state.player.fg;
      ctx.fillText(state.player.glyph, playerScreen.x + 2, playerScreen.y + 2);
    }
  }
}
