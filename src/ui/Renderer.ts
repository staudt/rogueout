import type { GameState } from '../engine/GameState';
import { getActiveRegion } from '../engine/GameState';

import { MIN_VIEWPORT_COLS, MIN_VIEWPORT_ROWS, TILE_SIZE } from '../config/constants';
import { getTileId } from '../world/GameMap';
import { TILES } from '../world/Tile';
import { isExplored, isVisible } from '../fov/VisibilityState';
import { canSpot } from '../engine/GameState';
import { standingBetween } from '../world/Factions';

/** Wants you dead. */
const HOSTILE_MARK = '#e05252';
/** On your side — allies, and pets once those exist. */
const ALLIED_MARK = '#6fd3a0';
const MARK_WIDTH = 2;
/** The look cursor: bright and unlike any faction mark, so it reads as UI rather than a creature. */
const CURSOR_COLOR = '#ffffff';
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
  private cursor: Point | null = null;

  constructor(canvas: HTMLCanvasElement, camera: Camera) {
    this.canvas = canvas;
    this.camera = camera;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    this.ctx = ctx;

    this.resize();
  }

  /** Where the look cursor sits, or null when not looking at anything. */
  setCursor(cursor: Point | null): void {
    this.cursor = cursor;
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
   * Rings a creature according to what it is to *you*, not which faction it belongs to.
   *
   * Only two cases are worth marking: something that wants you dead, and something fighting on
   * your side. Everything else — the great neutral middle, including animals that will bite you
   * if you corner them — gets no ring at all, because marking everything is the same as marking
   * nothing. Which faction someone belongs to is already carried by their glyph colour, which is
   * enough: factions are mostly a human concern.
   */
  private drawStandingMark(screen: Point, playerFaction: string, actor: { faction: string; provokedBy: string[] }): void {
    if (actor.faction === playerFaction) return; // you don't need ringing

    // Provocation counts. Someone you just kicked is trying to kill you whatever the table says,
    // and the ring is meant to answer "is this thing coming for me right now".
    const standing = actor.provokedBy.includes(playerFaction)
      ? 'hostile'
      : standingBetween(playerFaction, actor.faction);
    if (standing === 'neutral') return;

    this.ctx.strokeStyle = standing === 'hostile' ? HOSTILE_MARK : ALLIED_MARK;
    this.ctx.lineWidth = MARK_WIDTH;
    const inset = MARK_WIDTH / 2;
    this.ctx.strokeRect(screen.x + inset, screen.y + inset, TILE_SIZE - MARK_WIDTH, TILE_SIZE - MARK_WIDTH);
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
      this.drawStandingMark(screen, state.player.faction, npc);
      ctx.fillStyle = npc.fg;
      ctx.fillText(npc.glyph, screen.x + 2, screen.y + 2);
    }

    for (const monster of region.monsters) {
      if (!canSpot(state, monster.x, monster.y)) continue;
      const screen = this.camera.worldToScreen(monster.x, monster.y);
      this.drawStandingMark(screen, state.player.faction, monster);
      ctx.fillStyle = monster.fg;
      ctx.fillText(monster.glyph, screen.x + 2, screen.y + 2);
    }

    if (isVisible(region.visibility, state.player.x, state.player.y)) {
      const playerScreen = this.camera.worldToScreen(state.player.x, state.player.y);
      ctx.fillStyle = state.player.fg;
      ctx.fillText(state.player.glyph, playerScreen.x + 2, playerScreen.y + 2);
    }

    if (this.cursor) {
      const screen = this.camera.worldToScreen(this.cursor.x, this.cursor.y);
      ctx.strokeStyle = CURSOR_COLOR;
      ctx.lineWidth = 2;
      ctx.strokeRect(screen.x + 1, screen.y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
    }
  }
}
