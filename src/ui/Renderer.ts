import type { GameState } from '../engine/GameState';
import { getActiveRegion } from '../engine/GameState';

import { MIN_VIEWPORT_COLS, MIN_VIEWPORT_ROWS, TILE_SIZE } from '../config/constants';
import { getTileId } from '../world/GameMap';
import { TILES } from '../world/Tile';
import { isExplored, isVisible } from '../fov/VisibilityState';
import { canSpot } from '../engine/GameState';
import { FACTIONS, standingBetween } from '../world/Factions';
import { ITEMS } from '../items/ItemData';
import type { Camera } from './Camera';
import type { Point } from '../utils/geometry';

/** Overlay drawn on explored-but-not-currently-visible ("remembered") tiles to dim them. */
const REMEMBERED_OVERLAY = 'rgba(0, 0, 0, 0.65)';

/** Draws the current viewport as a monospace glyph grid onto a single canvas. */
export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly canvas: HTMLCanvasElement;
  private readonly camera: Camera;
  private ratio = 0;

  constructor(canvas: HTMLCanvasElement, camera: Camera) {
    this.canvas = canvas;
    this.camera = camera;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    this.ctx = ctx;

    this.resize();
  }

  /** The element whose size the canvas fills — what a ResizeObserver should watch. */
  hostElement(): HTMLElement | null {
    return this.canvas.parentElement;
  }

  /**
   * Fits the canvas to the space its container gives it, in whole tiles, and tells the camera how
   * many it now has. Call on startup and on every window resize.
   *
   * The canvas is sized to an exact multiple of TILE_SIZE rather than to the container, so there's
   * never a half-drawn row along an edge; the leftover strip is background, centred by CSS.
   */
  resize(): boolean {
    const host = this.canvas.parentElement;
    const availableWidth = host?.clientWidth ?? 0;
    const availableHeight = host?.clientHeight ?? 0;

    // Nothing to measure (jsdom, or a layout that hasn't happened yet) — fall back rather than
    // collapsing the viewport to zero tiles.
    const cols = availableWidth > 0 ? Math.max(1, Math.floor(availableWidth / TILE_SIZE)) : MIN_VIEWPORT_COLS;
    const rows = availableHeight > 0 ? Math.max(1, Math.floor(availableHeight / TILE_SIZE)) : MIN_VIEWPORT_ROWS;
    const ratio = window.devicePixelRatio || 1;

    // Nothing to do — bail before touching the canvas, since assigning width/height wipes it and
    // resets the context even when the value is unchanged.
    if (cols === this.camera.cols && rows === this.camera.rows && ratio === this.ratio) return false;

    this.ratio = ratio;
    this.camera.resize(cols, rows);

    const cssWidth = cols * TILE_SIZE;
    const cssHeight = rows * TILE_SIZE;

    // Back the canvas at the display's real pixel density, then scale the context to match, so
    // glyphs stay sharp on HiDPI screens instead of being upscaled from a CSS-pixel bitmap.
    this.canvas.width = Math.round(cssWidth * ratio);
    this.canvas.height = Math.round(cssHeight * ratio);
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;

    // Resizing a canvas resets its context, so transform and font are (re)applied here, after.
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.ctx.font = `${TILE_SIZE - 4}px monospace`;
    this.ctx.textBaseline = 'top';
    return true;
  }

  /**
   * Rings a creature in its faction's colour, so who belongs to whom is readable at a glance —
   * the thing that matters most once two groups are fighting each other on the same screen.
   * Thicker for anything hostile to the player, so "will this kill me" survives the same glance.
   * The player's own faction is left unmarked: no point ringing everything.
   */
  private drawFactionMark(screen: Point, playerFaction: string, faction: string): void {
    if (faction === playerFaction) return;
    const color = FACTIONS[faction]?.color;
    if (!color) return;

    const width = standingBetween(playerFaction, faction) === 'hostile' ? 2 : 1;
    const inset = width / 2;
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = width;
    this.ctx.strokeRect(screen.x + inset, screen.y + inset, TILE_SIZE - width, TILE_SIZE - width);
  }

  render(state: GameState): void {
    const region = getActiveRegion(state);
    this.camera.centerOn(state.player, region.map.width, region.map.height);
    const { ctx } = this;

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, this.camera.cols * TILE_SIZE, this.camera.rows * TILE_SIZE);

    for (let sy = 0; sy < this.camera.rows; sy++) {
      const worldY = this.camera.originY + sy;
      for (let sx = 0; sx < this.camera.cols; sx++) {
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

    // Items, creatures and people all need to be *picked out*, not merely stood in daylight.
    for (const ground of region.groundItems) {
      if (!canSpot(state, ground.x, ground.y)) continue;
      const def = ITEMS[ground.item.defId];
      if (!def) continue;
      const screen = this.camera.worldToScreen(ground.x, ground.y);
      ctx.fillStyle = def.fg;
      ctx.fillText(def.glyph, screen.x + 2, screen.y + 2);
    }

    for (const npc of region.npcs) {
      if (!canSpot(state, npc.x, npc.y)) continue;
      const screen = this.camera.worldToScreen(npc.x, npc.y);
      this.drawFactionMark(screen, state.player.faction, npc.faction);
      ctx.fillStyle = npc.fg;
      ctx.fillText(npc.glyph, screen.x + 2, screen.y + 2);
    }

    for (const monster of region.monsters) {
      if (!canSpot(state, monster.x, monster.y)) continue;
      const screen = this.camera.worldToScreen(monster.x, monster.y);
      this.drawFactionMark(screen, state.player.faction, monster.faction);
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
