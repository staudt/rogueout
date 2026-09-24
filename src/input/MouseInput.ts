import type { Point } from '../utils/geometry';
import type { Camera } from '../ui/Camera';

/** Translates a canvas click into a grid coordinate. Game.ts owns what clicking a tile means. */
export class MouseInput {
  private readonly canvas: HTMLCanvasElement;
  private readonly camera: Camera;
  private readonly onTileClick: (target: Point) => void;

  private readonly handleClick = (event: MouseEvent): void => {
    const rect = this.canvas.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    this.onTileClick(this.camera.screenToWorld(px, py));
  };

  constructor(canvas: HTMLCanvasElement, camera: Camera, onTileClick: (target: Point) => void) {
    this.canvas = canvas;
    this.camera = camera;
    this.onTileClick = onTileClick;
  }

  attach(): void {
    this.canvas.addEventListener('click', this.handleClick);
  }

  detach(): void {
    this.canvas.removeEventListener('click', this.handleClick);
  }
}
