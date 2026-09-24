import './style.css';
import { Game } from './engine/Game';

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
const messageLogEl = document.querySelector<HTMLElement>('#message-log');
const menuEl = document.querySelector<HTMLElement>('#menu-overlay');
if (!canvas || !messageLogEl || !menuEl) {
  throw new Error('Missing #game-canvas, #message-log, or #menu-overlay element');
}

const game = new Game(canvas, messageLogEl, menuEl);
game.start();
