import { describe, it, expect, vi, beforeEach } from 'vitest';
import { filterDonghua, looksLikeDonghua } from '../utils/donghuaFilter';

describe('donghuaFilter', () => {
  describe('looksLikeDonghua', () => {
    it('should detect donghua by Chinese characters in title', () => {
      expect(looksLikeDonghua('斗破苍穹')).toBe(true);
      expect(looksLikeDonghua('完美世界')).toBe(true);
      expect(looksLikeDonghua('One Piece')).toBe(false);
      expect(looksLikeDonghua('Naruto')).toBe(false);
    });

    it('should detect donghua by pinyin tokens', () => {
      expect(looksLikeDonghua('Doupo Cangqiong')).toBe(true);
      expect(looksLikeDonghua('Wushen Zhuzai')).toBe(true);
      expect(looksLikeDonghua('Xianwu Zhuan')).toBe(true);
      expect(looksLikeDonghua('Wu Shang Shen Di')).toBe(true);
    });

    it('should detect explicit donghua tag', () => {
      expect(looksLikeDonghua('[Donghua] Some Title')).toBe(true);
      expect(looksLikeDonghua('Chinese Animation')).toBe(true);
    });

    it('should not flag regular anime titles', () => {
      expect(looksLikeDonghua('One Piece')).toBe(false);
      expect(looksLikeDonghua('Naruto')).toBe(false);
      expect(looksLikeDonghua('Attack on Titan')).toBe(false);
      expect(looksLikeDonghua('Jujutsu Kaisen')).toBe(false);
      expect(looksLikeDonghua('Demon Slayer')).toBe(false);
      expect(looksLikeDonghua('Spy x Family')).toBe(false);
      expect(looksLikeDonghua('Frieren')).toBe(false);
      expect(looksLikeDonghua('Chainsaw Man')).toBe(false);
    });

    it('should detect common donghua patterns', () => {
      expect(looksLikeDonghua('Douluo Dalu')).toBe(true);
      expect(looksLikeDonghua('Wanmei Shijie')).toBe(true);
      expect(looksLikeDonghua('Ze Tian Ji')).toBe(true);
      expect(looksLikeDonghua('Jian Lai')).toBe(true);
      expect(looksLikeDonghua('Tian Ji')).toBe(true);
    });
  });

  describe('filterDonghua', () => {
    it('should filter out donghua from mixed list', () => {
      const mixedList = [
        { id: '1', title: 'One Piece' },
        { id: '2', title: 'Doupo Cangqiong' },
        { id: '3', title: 'Naruto' },
        { id: '4', title: 'Wushen Zhuzai' },
        { id: '5', title: 'Attack on Titan' },
      ];
      const filtered = filterDonghua(mixedList);
      expect(filtered).toHaveLength(3);
      expect(filtered.map(f => f.title)).toEqual(['One Piece', 'Naruto', 'Attack on Titan']);
    });

    it('should keep list unchanged if no donghua', () => {
      const animeList = [
        { id: '1', title: 'One Piece' },
        { id: '2', title: 'Naruto' },
        { id: '3', title: 'Attack on Titan' },
      ];
      const filtered = filterDonghua(animeList);
      expect(filtered).toHaveLength(3);
    });

    it('should return empty array if all donghua', () => {
      const donghuaList = [
        { id: '1', title: 'Doupo Cangqiong' },
        { id: '2', title: 'Wushen Zhuzai' },
      ];
      const filtered = filterDonghua(donghuaList);
      expect(filtered).toHaveLength(0);
    });

    it('should handle empty array', () => {
      expect(filterDonghua([])).toEqual([]);
    });

    it('should handle null/undefined input', () => {
      expect(filterDonghua(null as any)).toEqual([]);
      expect(filterDonghua(undefined as any)).toEqual([]);
    });
  });
});