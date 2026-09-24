import { describe, expect, it } from 'vitest';
import { joinWithAnd, withArticle } from '../src/utils/text';

describe('withArticle', () => {
  it('picks the article from the first sound', () => {
    expect(withArticle('giant rat')).toBe('a giant rat');
    expect(withArticle('goblin')).toBe('a goblin');
    expect(withArticle('ogre')).toBe('an ogre');
    expect(withArticle('imp')).toBe('an imp');
  });

  it('is case-insensitive about the first letter', () => {
    expect(withArticle('Ogre')).toBe('an Ogre');
  });

  it('survives an empty name without producing "a undefined"', () => {
    expect(withArticle('')).toBe('a ');
  });
});

describe('joinWithAnd', () => {
  it('reads as a sentence fragment for any count', () => {
    expect(joinWithAnd([])).toBe('');
    expect(joinWithAnd(['a rat'])).toBe('a rat');
    expect(joinWithAnd(['a rat', 'a goblin'])).toBe('a rat and a goblin');
    expect(joinWithAnd(['a rat', 'a goblin', 'Old Maren'])).toBe('a rat, a goblin and Old Maren');
  });
});
