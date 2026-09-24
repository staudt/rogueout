const MAX_VISIBLE_MESSAGES = 6;

/** Mirrors GameState.messageLog (the source of truth) into a DOM element — NetHack-style log. */
export class MessageLog {
  private readonly container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  render(messages: readonly string[]): void {
    const visible = messages.slice(-MAX_VISIBLE_MESSAGES);
    this.container.innerHTML = '';
    for (const message of visible) {
      const line = document.createElement('div');
      line.textContent = message;
      this.container.appendChild(line);
    }
    this.container.scrollTop = this.container.scrollHeight;
  }
}
