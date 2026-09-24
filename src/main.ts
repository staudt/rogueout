import './style.css';
import { Game } from './engine/Game';

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
const messageLogEl = document.querySelector<HTMLElement>('#message-log');
const menuEl = document.querySelector<HTMLElement>('#menu-overlay');
const statusBarEl = document.querySelector<HTMLElement>('#status-bar');
if (!canvas || !messageLogEl || !menuEl || !statusBarEl) {
  throw new Error('Missing #game-canvas, #message-log, #menu-overlay, or #status-bar element');
}

const game = new Game(canvas, messageLogEl, menuEl, statusBarEl);
game.start();
