import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildVideoHref } from '../utils/buildVideoHref';

describe('buildVideoHref', () => {
  it('should build correct URL for otakudesu source', () => {
    const anime = { id: 'one-piece', source: 'otakudesu' };
    expect(buildVideoHref(anime)).toBe('/video/one-piece');
  });

  it('should include source param for kuramanime', () => {
    const anime = { id: '1533/road-of-naruto', source: 'kuramanime' };
    expect(buildVideoHref(anime)).toBe('/video/1533/road-of-naruto?source=kuramanime');
  });

  it('should include source param for nekopoi', () => {
    const anime = { id: 'hentai/furachi-flat', source: 'nekopoi' };
    expect(buildVideoHref(anime)).toBe('/video/hentai/furachi-flat?source=nekopoi');
  });

  it('should handle _source field', () => {
    const anime = { id: 'test-id', _source: 'kuramanime' };
    expect(buildVideoHref(anime)).toBe('/video/test-id?source=kuramanime');
  });

  it('should handle availableSources array', () => {
    const anime = { id: 'test-id', availableSources: ['kuramanime', 'otakudesu'] };
    expect(buildVideoHref(anime)).toBe('/video/test-id?source=kuramanime');
  });

  it('should prioritize kuramanime over otakudesu in availableSources', () => {
    const anime = { id: 'test-id', availableSources: ['otakudesu', 'kuramanime'] };
    expect(buildVideoHref(anime)).toBe('/video/test-id?source=kuramanime');
  });

  it('should handle sourceIds object - uses sourceIds when explicit source differs from picked source', () => {
    // When no explicit source, but availableSources has kuramanime, 
    // pickPrimarySource picks kuramanime (priority). 
    // Since no explicit source, falls to else branch and uses sourceIds
    const anime = { 
      id: 'fallback-id', 
      sourceIds: { kuramanime: '1533/naruto', otakudesu: 'naruto' },
      availableSources: ['otakudesu', 'kuramanime'], // no explicit source
    };
    expect(buildVideoHref(anime)).toBe('/video/1533/naruto?source=kuramanime');
  });

  it('should handle empty source', () => {
    const anime = { id: 'test-id' };
    expect(buildVideoHref(anime)).toBe('/video/test-id');
  });

  it('should handle extra query params', () => {
    const anime = { id: 'test-id', source: 'kuramanime' };
    expect(buildVideoHref(anime, 'play=true')).toBe('/video/test-id?source=kuramanime&play=true');
  });

  it('should return # for missing id', () => {
    const anime = { source: 'kuramanime' };
    expect(buildVideoHref(anime)).toBe('#');
  });

  it('should handle undefined anime', () => {
    expect(buildVideoHref(null)).toBe('#');
    expect(buildVideoHref(undefined)).toBe('#');
  });
});