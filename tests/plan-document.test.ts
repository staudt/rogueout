import { describe, expect, it } from 'vitest';
import { PlanDocument } from '../src/editor/PlanDocument';
import { parsePlan } from '../src/world/generation/plan/AreaPlan';

/**
 * The editing operations, kept pure and DOM-free so they're testable without a browser — the same
 * split the game uses between its systems and its UI.
 */
const BLANK = ['a plan', '---', 'BBBBB', 'BBBBB', 'BBBBB', 'BBBBB', 'BBBBB'].join('\n');

describe('editing a plan', () => {
  it('round-trips through text without disturbing the header', () => {
    const doc = new PlanDocument(BLANK);
    expect(doc.toText()).toBe(`${BLANK}\n`);
    expect(doc.header).toBe('a plan');
  });

  it('paints a single cell, and refuses a character the loader would reject', () => {
    const doc = new PlanDocument(BLANK);
    doc.paint(2, 2, '.');
    expect(doc.at(2, 2)).toBe('.');

    // Nothing may enter the document that could not be read back out of it.
    doc.paint(1, 1, 'Z');
    expect(doc.at(1, 1)).toBe('B');
  });

  it('draws a diagonal line, which is the thing a table did better and a grid does worse', () => {
    const doc = new PlanDocument(BLANK);
    doc.line({ x: 0, y: 0 }, { x: 4, y: 4 }, '=');

    for (let i = 0; i < 5; i++) expect(doc.at(i, i)).toBe('=');
    expect(doc.at(0, 4)).toBe('B');
  });

  it('fills a rectangle from either pair of corners', () => {
    const doc = new PlanDocument(BLANK);
    doc.rect({ x: 3, y: 3 }, { x: 1, y: 1 }, '~');

    expect(doc.at(1, 1)).toBe('~');
    expect(doc.at(3, 3)).toBe('~');
    expect(doc.at(0, 0)).toBe('B');
  });

  it('floods 4-connected, matching how the generator finds a region', () => {
    // If the editor filled 8-connected it would merge two blocks that the generator treats as
    // separate, and you would be painting something other than what you get.
    const doc = new PlanDocument(['t', '---', 'B.B', '.B.', 'B.B'].join('\n'));
    doc.fill({ x: 1, y: 1 }, 'C');

    expect(doc.at(1, 1)).toBe('C');
    expect(doc.at(0, 0)).toBe('B'); // touching only at a corner: a different region
    expect(doc.at(2, 2)).toBe('B');
  });

  it('takes back a whole stroke, not one cell of it', () => {
    const doc = new PlanDocument(BLANK);
    doc.beginStroke();
    doc.rect({ x: 0, y: 0 }, { x: 4, y: 4 }, '~');
    expect(doc.at(2, 2)).toBe('~');

    expect(doc.undo()).toBe(true);
    expect(doc.at(2, 2)).toBe('B');
    expect(doc.undo()).toBe(false); // nothing left to take back
  });

  it('produces text the loader accepts, after arbitrary editing', () => {
    // The guarantee that matters: the editor cannot write a file the game then refuses to start
    // with. Row widths are structural here rather than something a person has to count.
    const doc = new PlanDocument(BLANK);
    doc.line({ x: 0, y: 0 }, { x: 4, y: 4 }, '=');
    doc.rect({ x: 0, y: 3 }, { x: 2, y: 4 }, '~');
    doc.fill({ x: 4, y: 0 }, 'C');

    const reparsed = parsePlan(doc.toText());
    expect(reparsed.width).toBe(5);
    expect(reparsed.height).toBe(5);
  });

  it('counts what the plan is made of', () => {
    const doc = new PlanDocument(BLANK);
    doc.rect({ x: 0, y: 0 }, { x: 4, y: 0 }, '.');
    expect(doc.tally().get('.')).toBe(5);
    expect(doc.tally().get('B')).toBe(20);
  });
});
