import { PlanDocument, type Point } from './PlanDocument';
import { INSTRUCTIONS, literalTile } from '../world/generation/plan/AreaPlan';
import { generateFromPlan } from '../world/generation/plan/generateFromPlan';
import { WRIGLEYVILLE } from '../world/maps/wrigleyville';
import { TILES } from '../world/Tile';
import { getTileId } from '../world/GameMap';
import { isConnectedWall, wallGlyph } from '../ui/WallGlyphs';

/**
 * The map editor.
 *
 * It exists because half the characters in a plan are not pixels but **instructions** — `B` is not
 * a tile, it is "put buildings in this shape" — so no general-purpose ASCII editor can show you
 * what you are actually making. This one draws the plan and the generated result side by side and
 * regenerates as you paint, which is the only way editing a plan rather than a picture is
 * tractable.
 *
 * Deliberately a separate page from the game. It shares the tile table and the generator and
 * nothing else, and the route that writes the file exists only on the dev server.
 */
/** Starting zoom, in pixels per tile. Changed by the zoom control; see `setZoom`. */
const DEFAULT_CELL = 7;
const ZOOM_STEPS = [3, 5, 7, 10, 14, 20];

type Tool = 'pencil' | 'line' | 'rect' | 'fill' | 'pick';

/** Everything you can paint, in the order it appears in the palette. */
const PALETTE: Array<{ char: string; label: string }> = [
  { char: '=', label: 'arterial' },
  { char: '.', label: 'street' },
  { char: "'", label: 'alley' },
  { char: ',', label: 'kerb' },
  { char: 'B', label: 'blocks (generated)' },
  { char: 'C', label: 'cave (generated)' },
  { char: '?', label: 'either (generated)' },
  { char: '#', label: 'brick' },
  { char: '*', label: 'ruin' },
  { char: ':', label: 'rubble' },
  { char: '~', label: 'water' },
  { char: '%', label: 'swamp' },
  { char: '"', label: 'weeds' },
  { char: 'T', label: 'thicket' },
  { char: 'g', label: 'grass' },
  { char: '_', label: 'floor' },
  { char: '+', label: 'door' },
  { char: '>', label: 'stairs down' },
  { char: '<', label: 'stairs up' },
];

/** How a plan character looks in the left-hand pane. */
function planColour(char: string): string {
  if (char in INSTRUCTIONS) return '#6f7d8c';
  return TILES[literalTile(char) ?? '']?.fg ?? '#888888';
}

function planBackground(char: string): string {
  if (char in INSTRUCTIONS) return '#14181c';
  return TILES[literalTile(char) ?? '']?.bg ?? '#000000';
}

async function boot(): Promise<void> {
  const root = document.querySelector<HTMLDivElement>('#editor')!;
  root.innerHTML = LAYOUT;
  document.head.insertAdjacentHTML('beforeend', `<style>${STYLE}</style>`);

  const planText = await fetch('/__plan')
    .then((response) => (response.ok ? response.text() : Promise.reject()))
    .catch(() => {
      // Falls back to whatever was bundled, so the editor still opens without the dev server —
      // it just cannot save.
      return WRIGLEYVILLE.plan;
    });

  const doc = new PlanDocument(planText);
  const planCanvas = root.querySelector<HTMLCanvasElement>('#plan')!;
  const resultCanvas = root.querySelector<HTMLCanvasElement>('#result')!;
  let cell = DEFAULT_CELL;

  /**
   * Redraws at a new scale.
   *
   * At 20 pixels a tile this is the size the game actually draws it, which is the point of being
   * able to zoom at all: a map that looks well proportioned shrunk to fit a pane can read quite
   * differently when you are standing in it.
   */
  function setZoom(next: number): void {
    cell = next;
    for (const canvas of [planCanvas, resultCanvas]) {
      canvas.width = doc.width * cell;
      canvas.height = doc.height * cell;
    }
    // Assigning width resets the context, so the font has to be re-applied after.
    for (const ctx of [planCtx, resultCtx]) {
      ctx.font = `${cell}px monospace`;
      ctx.textBaseline = 'top';
    }
    root.querySelector('#zoom')!.textContent = `${cell}px`;
    redraw();
  }

  let tool: Tool = 'pencil';
  let brush = '.';
  let anchor: Point | null = null;
  let painting = false;
  let dirty = false;

  const status = root.querySelector<HTMLDivElement>('#status')!;
  const problems = root.querySelector<HTMLDivElement>('#problems')!;

  // --- drawing ------------------------------------------------------------------------------
  const planCtx = planCanvas.getContext('2d')!;
  const resultCtx = resultCanvas.getContext('2d')!;

  function drawPlan(): void {
    planCtx.fillStyle = '#000';
    planCtx.fillRect(0, 0, planCanvas.width, planCanvas.height);
    for (let y = 0; y < doc.height; y++) {
      for (let x = 0; x < doc.width; x++) {
        const char = doc.at(x, y);
        const bg = planBackground(char);
        if (bg !== '#000000') {
          planCtx.fillStyle = bg;
          planCtx.fillRect(x * cell, y * cell, cell, cell);
        }
        planCtx.fillStyle = planColour(char);
        planCtx.fillText(char, x * cell, y * cell);
      }
    }
  }

  /** Regenerates and draws the result, or reports why it cannot. */
  function drawResult(): void {
    let area;
    try {
      area = generateFromPlan({ ...WRIGLEYVILLE, plan: doc.toText() });
    } catch (error) {
      problems.textContent = error instanceof Error ? error.message : String(error);
      problems.className = 'bad';
      return;
    }

    const counts = doc.tally();
    const generated = [...Object.keys(INSTRUCTIONS)].reduce((sum, c) => sum + (counts.get(c) ?? 0), 0);
    problems.textContent =
      `${area.monsters.length} creatures, ${area.npcs.length} people, ` +
      `${area.transitions.length} ways out. ` +
      `${Math.round((generated / (doc.width * doc.height)) * 100)}% of the map is left to the generator.`;
    problems.className = 'good';

    resultCtx.fillStyle = '#000';
    resultCtx.fillRect(0, 0, resultCanvas.width, resultCanvas.height);
    for (let y = 0; y < area.map.height; y++) {
      for (let x = 0; x < area.map.width; x++) {
        const id = getTileId(area.map, x, y);
        const tile = TILES[id];
        if (!tile) continue;
        if (tile.bg !== '#000000') {
          resultCtx.fillStyle = tile.bg;
          resultCtx.fillRect(x * cell, y * cell, cell, cell);
        }
        resultCtx.fillStyle = tile.fg;
        resultCtx.fillText(isConnectedWall(id) ? wallGlyph(area.map, x, y) : tile.glyph, x * cell, y * cell);
      }
    }

    // Everything living in it, so you can see whether a street you drew is somewhere people are.
    for (const actor of [...area.monsters, ...area.npcs]) {
      resultCtx.fillStyle = actor.fg;
      resultCtx.fillText(actor.glyph, actor.x * cell, actor.y * cell);
    }
  }

  /**
   * Outlines every named place and labels it, on both panes.
   *
   * Places carry their coordinates in a table rather than being marked in the plan, which is what
   * lets there be fifty of them — but it also means a rect can drift off the art it describes when
   * you move something. Drawing them is what keeps that visible instead of silent.
   */
  function drawPlaces(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 210, 122, 0.75)';
    ctx.fillStyle = 'rgba(255, 210, 122, 0.95)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    for (const place of WRIGLEYVILLE.places) {
      const { x0, y0, x1, y1 } = place.rect;
      ctx.strokeRect(x0 * cell + 0.5, y0 * cell + 0.5, (x1 - x0 + 1) * cell, (y1 - y0 + 1) * cell);
      if (cell >= 5) ctx.fillText(place.name, x0 * cell + 2, y0 * cell - cell - 1);
    }
    ctx.restore();
  }

  function redraw(): void {
    drawPlan();
    drawResult();
    drawPlaces(planCtx);
    drawPlaces(resultCtx);
  }

  // --- input --------------------------------------------------------------------------------
  const cellAt = (event: MouseEvent): Point => {
    const box = planCanvas.getBoundingClientRect();
    return {
      x: Math.floor(((event.clientX - box.left) / box.width) * doc.width),
      y: Math.floor(((event.clientY - box.top) / box.height) * doc.height),
    };
  };

  planCanvas.addEventListener('mousedown', (event) => {
    const at = cellAt(event);
    if (tool === 'pick') {
      brush = doc.at(at.x, at.y);
      refreshPalette();
      return;
    }

    doc.beginStroke();
    painting = true;
    anchor = at;
    if (tool === 'pencil') doc.paint(at.x, at.y, brush);
    if (tool === 'fill') {
      doc.fill(at, brush);
      painting = false;
      anchor = null;
    }
    redraw();
    markDirty();
  });

  planCanvas.addEventListener('mousemove', (event) => {
    const at = cellAt(event);
    status.textContent = `${at.x}, ${at.y}   ${doc.at(at.x, at.y)}`;
    if (!painting || !anchor) return;

    if (tool === 'pencil') {
      // Straight to the previous cell, so a fast drag doesn't leave gaps.
      doc.line(anchor, at, brush);
      anchor = at;
      redraw();
      markDirty();
    }
  });

  window.addEventListener('mouseup', (event) => {
    if (!painting || !anchor) {
      painting = false;
      return;
    }
    const at = cellAt(event);
    if (tool === 'line') doc.line(anchor, at, brush);
    if (tool === 'rect') doc.rect(anchor, at, brush);
    painting = false;
    anchor = null;
    redraw();
    markDirty();
  });

  window.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'z') {
      event.preventDefault();
      if (doc.undo()) {
        redraw();
        markDirty();
      }
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key === 's') {
      event.preventDefault();
      void save();
    }
  });

  // --- chrome -------------------------------------------------------------------------------
  const paletteEl = root.querySelector<HTMLDivElement>('#palette')!;
  function refreshPalette(): void {
    paletteEl.innerHTML = '';
    for (const entry of PALETTE) {
      const button = document.createElement('button');
      button.className = entry.char === brush ? 'swatch on' : 'swatch';
      button.style.color = planColour(entry.char);
      button.style.background = planBackground(entry.char);
      button.textContent = entry.char;
      button.title = entry.label;
      button.addEventListener('click', () => {
        brush = entry.char;
        refreshPalette();
      });
      paletteEl.append(button);
    }
  }

  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-tool]')) {
    button.addEventListener('click', () => {
      tool = button.dataset['tool'] as Tool;
      for (const other of root.querySelectorAll('[data-tool]')) other.classList.remove('on');
      button.classList.add('on');
    });
  }

  const saveButton = root.querySelector<HTMLButtonElement>('#save')!;
  function markDirty(): void {
    dirty = true;
    saveButton.textContent = 'Save •';
  }

  async function save(): Promise<void> {
    if (!dirty) return;
    try {
      const response = await fetch('/__plan', { method: 'POST', body: doc.toText() });
      saveButton.textContent = response.ok ? 'Saved' : 'Save failed';
      dirty = !response.ok;
    } catch {
      // No dev server: fall back to a download, which is at least not losing the work.
      const url = URL.createObjectURL(new Blob([doc.toText()], { type: 'text/plain' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'wrigleyville.plan.txt';
      link.click();
      URL.revokeObjectURL(url);
      saveButton.textContent = 'Downloaded';
    }
  }
  saveButton.addEventListener('click', () => void save());

  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-zoom]')) {
    button.addEventListener('click', () => {
      const index = ZOOM_STEPS.indexOf(cell);
      const next = ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, index + Number(button.dataset['zoom'])))];
      if (next && next !== cell) setZoom(next);
    });
  }

  const fitToggle = root.querySelector<HTMLButtonElement>('#fit')!;
  fitToggle.addEventListener('click', () => {
    root.querySelector('main')!.classList.toggle('fit');
    fitToggle.classList.toggle('on');
  });

  refreshPalette();
  setZoom(DEFAULT_CELL);
}

const LAYOUT = `
  <header>
    <strong>Wrigleyville</strong>
    <span class="tools">
      <button data-tool="pencil" class="on">Pencil</button>
      <button data-tool="line">Line</button>
      <button data-tool="rect">Rect</button>
      <button data-tool="fill">Fill</button>
      <button data-tool="pick">Pick</button>
    </span>
    <span class="tools">
      <button data-zoom="-1">&minus;</button>
      <span id="zoom">7px</span>
      <button data-zoom="1">+</button>
      <button id="fit" class="on">Fit</button>
    </span>
    <div id="palette"></div>
    <span class="grow"></span>
    <span id="status">&nbsp;</span>
    <button id="save">Save</button>
  </header>
  <div id="problems"></div>
  <main class="fit">
    <section><h2>Plan — what you draw</h2><div><canvas id="plan"></canvas></div></section>
    <section><h2>Result — what it makes</h2><div><canvas id="result"></canvas></div></section>
  </main>
`;

const STYLE = `
  body { margin: 0; background: #0b0d10; color: #c8cdd4;
         font: 13px ui-monospace, SFMono-Regular, Menlo, monospace; }
  header { display: flex; gap: 12px; align-items: center; flex-wrap: wrap;
           padding: 8px 12px; background: #11151a; border-bottom: 1px solid #222; }
  .grow { flex: 1; }
  button { background: #1b2027; color: #c8cdd4; border: 1px solid #2c333c;
           padding: 4px 9px; border-radius: 3px; cursor: pointer; font: inherit; }
  button.on { background: #2f6f4f; border-color: #3d8a63; color: #fff; }
  #palette { display: flex; gap: 2px; flex-wrap: wrap; }
  .swatch { width: 26px; height: 26px; padding: 0; font-size: 14px; }
  .swatch.on { outline: 2px solid #7ad2a0; }
  #problems { padding: 6px 12px; border-bottom: 1px solid #222; }
  #problems.bad { background: #3a1616; color: #ffb4b4; }
  #problems.good { background: #11151a; color: #8fa3b5; }
  /* Two modes. "Fit" scales each pane to the window for an overview; unset, the canvases draw at
     their true pixel size and each pane scrolls, which is the only way to see the map at the size
     the game actually renders it. */
  main { display: flex; gap: 14px; padding: 14px; align-items: flex-start;
         height: calc(100vh - 92px); box-sizing: border-box; }
  main section { flex: 1 1 0; min-width: 0; height: 100%;
                 display: flex; flex-direction: column; }
  main section > div { overflow: auto; flex: 1; border: 1px solid #222; }
  main.fit canvas { width: 100%; height: auto; }
  main.fit section > div { overflow: hidden; }
  h2 { font-size: 12px; font-weight: normal; color: #8fa3b5; margin: 0 0 6px; }
  /* Scaled to the pane rather than drawn at cell size: both halves have to be on screen at once
     or the whole point of showing them together is lost. Mouse coordinates are taken from the
     bounding rect, so painting stays accurate at any scale. */
  canvas { display: block; cursor: crosshair; }
  #status { color: #8fa3b5; min-width: 90px; }
`;

void boot();
