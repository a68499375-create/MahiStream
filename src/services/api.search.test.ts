import { describe, it, expect, vi, beforeEach } from 'vitest';
import { searchAnimeAggregate, searchAnime, liveSearchKurama } from '../services/api';

vi.mock('../services/api.js', async () => {
  const actual = await vi.importActual('../services/api.js');
  return {
    ...actual,
    fetchWithRetry: vi.fn(),
  };
});

import { fetchWithRetry } from '../services/api';

describe('searchAnimeAggregate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should merge results from all sources when all succeed', async () => {
    const mockAggregate = {
      ok: true,
      json: async () => ({
        statusCode: 200,
        data: [{ id: 'agg-1', title: 'Aggregate Anime', animeId: 'agg-1', poster_url: '', rating: '8.5', availableSources: ['otakudesu'], sourceIds: { otakudesu: 'agg-1' } }]
      })
    };
    
    const mockOtaku = {
      ok: true,
      json: async () => ({
        statusCode: 200,
        data: { animeList: [{ animeId: 'otaku-1', title: 'Otaku Anime', poster: '', score: '8.0' }] }
      })
    };
    
    const mockKurama = {
      ok: true,
      json: async () => ({
        statusCode: 200,
        data: { animeList: [{ animeId: 'kura-1', title: 'Kurama Anime', poster: '', score: '8.2' }] }
      })
    };
    
    const mockNeko = {
      ok: true,
      json: async () => ({
        statusCode: 200,
        data: [{ id: 'neko-1', title: 'Neko Anime', image: '', type: 'hentai' }]
      })
    };

    fetchWithRetry
      .mockResolvedValueOnce(mockAggregate)
      .mockResolvedValueOnce(mockOtaku)
      .mockResolvedValueOnce(mockKurama)
      .mockResolvedValueOnce(mockNeko);

    const results = await searchAnimeAggregate('test', 1);
    
    expect(results.length).toBeGreaterThan(0);
    expect(fetchWithRetry).toHaveBeenCalledTimes(4);
  });

  it('should handle nekopoi timeout gracefully', async () => {
    const mockAggregate = {
      ok: true,
      json: async () => ({
        statusCode: 200,
        data: [{ id: 'agg-1', title: 'Aggregate Anime', animeId: 'agg-1', poster_url: '', rating: '8.5', availableSources: ['otakudesu'], sourceIds: { otakudesu: 'agg-1' } }]
      })
    };
    
    const mockOtaku = {
      ok: true,
      json: async () => ({
        statusCode: 200,
        data: { animeList: [{ animeId: 'otaku-1', title: 'Otaku Anime', poster: '', score: '8.0' }] }
      })
    };
    
    const mockKurama = {
      ok: true,
      json: async () => ({
        statusCode: 200,
        data: { animeList: [{ animeId: 'kura-1', title: 'Kurama Anime', poster: '', score: '8.2' }] }
      })
    };

    // Nekopoi throws timeout error
    fetchWithRetry
      .mockResolvedValueOnce(mockAggregate)
      .mockResolvedValueOnce(mockOtaku)
      .mockResolvedValueOnce(mockKurama)
      .mockRejectedValueOnce(new Error('Timeout'));

    const results = await searchAnimeAggregate('test', 1);
    
    // Should still return results from other sources
    expect(results.length).toBeGreaterThan(0);
    expect(fetchWithRetry).toHaveBeenCalledTimes(4);
  });

  it('should handle nekopoi 403/locked gracefully', async () => {
    const mockAggregate = {
      ok: true,
      json: async () => ({
        statusCode: 200,
        data: [{ id: 'agg-1', title: 'Aggregate Anime', animeId: 'agg-1', poster_url: '', rating: '8.5', availableSources: ['otakudesu'], sourceIds: { otakudesu: 'agg-1' } }]
      })
    };
    
    const mockOtaku = {
      ok: true,
      json: async () => ({
        statusCode: 200,
        data: { animeList: [{ animeId: 'otaku-1', title: 'Otaku Anime', poster: '', score: '8.0' }] }
      })
    };
    
    const mockKurama = {
      ok: true,
      json: async () => ({
        statusCode: 200,
        data: { animeList: [{ animeId: 'kura-1', title: 'Kurama Anime', poster: '', score: '8.2' }] }
      })
    };

    // Nekopoi returns 403
    const mockNeko = {
      ok: false,
      status: 403,
      json: async () => ({ statusCode: 403, message: 'Locked' })
    };

    fetchWithRetry
      .mockResolvedValueOnce(mockAggregate)
      .mockResolvedValueOnce(mockOtaku)
      .mockResolvedValueOnce(mockKurama)
      .mockResolvedValueOnce(mockNeko);

    const results = await searchAnimeAggregate('test', 1);
    
    // Should still return results from other sources
    expect(results.length).toBeGreaterThan(0);
  });
});

describe('searchAnime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return results from aggregate', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        statusCode: 200,
        data: [{ id: 'test-1', title: 'Test Anime', poster_url: '', rating: '8.0', availableSources: ['otakudesu'], sourceIds: { otakudesu: 'test-1' } }]
      })
    };
    
    fetchWithRetry.mockResolvedValue(mockResponse);
    
    const results = await searchAnime('test');
    
    expect(results.length).toBe(1);
    expect(results[0].title).toBe('Test Anime');
  });

  it('should return empty array on failure', async () => {
    fetchWithRetry.mockRejectedValue(new Error('Network error'));
    
    const results = await searchAnime('test');
    
    expect(results).toEqual([]);
  });
});

describe('liveSearchKurama', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return kuramanime live search results', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        statusCode: 200,
        data: { items: [{ animeId: 'kura-1', title: 'Live Anime', poster: '', score: '8.5' }] }
      })
    };
    
    fetchWithRetry.mockResolvedValue(mockResponse);
    
    const results = await liveSearchKurama('test');
    
    expect(results.length).toBe(1);
    expect(results[0].animeId).toBe('kura-1');
  });

  it('should return empty for short queries', async () => {
    const results = await liveSearchKurama('a');
    expect(results).toEqual([]);
  });

  it('should handle errors gracefully', async () => {
    fetchWithRetry.mockRejectedValue(new Error('Network error'));
    
    const results = await liveSearchKurama('test');
    
    expect(results).toEqual([]);
  });
});