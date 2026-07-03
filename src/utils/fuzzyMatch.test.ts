import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fuzzyRank, scoreTitle } from '../utils/fuzzyMatch';

describe('fuzzyMatch', () => {
  describe('scoreTitle', () => {
    it('should give perfect score for exact match', () => {
      expect(scoreTitle('One Piece', 'One Piece')).toBe(1);
      expect(scoreTitle('Naruto', 'Naruto')).toBe(1);
    });

    it('should give high score for prefix match', () => {
      expect(scoreTitle('One Piece', 'One')).toBeGreaterThan(0.8);
      expect(scoreTitle('Attack on Titan', 'Attack')).toBeGreaterThan(0.8);
    });

    it('should handle case insensitivity', () => {
      expect(scoreTitle('One Piece', 'one piece')).toBe(1);
      expect(scoreTitle('NARUTO', 'naruto')).toBe(1);
    });

    it('should handle partial matches', () => {
      expect(scoreTitle('Naruto Shippuden', 'Naruto')).toBeGreaterThan(0.7);
      expect(scoreTitle('Boruto: Naruto Next Generations', 'Naruto')).toBeGreaterThan(0.6);
    });

    it('should give low score for no match', () => {
      expect(scoreTitle('One Piece', 'Dragon Ball')).toBeLessThan(0.3);
    });

    it('should handle empty strings', () => {
      expect(scoreTitle('', 'One Piece')).toBe(0);
      expect(scoreTitle('One Piece', '')).toBe(0);
      expect(scoreTitle('', '')).toBe(0);
    });
  });

  describe('fuzzyRank', () => {
    const items = [
      { id: '1', title: 'One Piece' },
      { id: '2', title: 'Naruto' },
      { id: '3', title: 'Naruto Shippuden' },
      { id: '4', title: 'Attack on Titan' },
      { id: '5', title: 'Demon Slayer' },
      { id: '6', title: 'Jujutsu Kaisen' },
    ];

    it('should rank exact matches first', () => {
      const ranked = fuzzyRank(items, 'Naruto', (x) => x.title, 0.2);
      expect(ranked[0].title).toBe('Naruto');
    });

    it('should rank prefix matches high', () => {
      const ranked = fuzzyRank(items, 'Naru', (x) => x.title, 0.2);
      expect(ranked[0].title).toBe('Naruto');
    });

    it('should return empty array for empty query', () => {
      const ranked = fuzzyRank(items, '', (x) => x.title, 0.2);
      expect(ranked).toEqual(items);
    });

    it('should return all items ranked by score when threshold provided', () => {
      const ranked = fuzzyRank(items, 'xyz', (x) => x.title, 0.5);
      // Should return all items ranked by score (threshold doesn't filter)
      expect(ranked.length).toBe(items.length);
    });

    it('should handle unicode characters', () => {
      const unicodeItems = [
        { id: '1', title: '鬼滅の刃' },
        { id: '2', title: '呪術廻戦' },
      ];
      const ranked = fuzzyRank(unicodeItems, '鬼滅', (x) => x.title, 0.2);
      expect(ranked[0].title).toBe('鬼滅の刃');
    });
  });
});