import { useState, useEffect, useCallback } from 'react';
import { fetchSourceEpisodeDetails, fetchSourceStreamUrl, API_BASE_URL } from '../services/api';
import { pickHighest, resolveEmbedToStream } from './streamHelpers';

/**
 * Hook untuk memuat stream dari source Kuramanime.
 * Kuramanime diputar lewat <iframe> ke /kuramanime/iframe-proxy.
 * TIDAK lewat /extract-stream (Puppeteer di VPS bisa 30-90 detik).
 * Prioritas: defaultStreamingUrl -> stream-proxy wrap -> serverList fallback.
 */
export default function useKuramanimeStream(currentEpisode) {
  const [streamUrl, setStreamUrl] = useState('');
  const [episodeDetails, setEpisodeDetails] = useState(null);
  const [isVideoLoading, setIsVideoLoading] = useState(false);
  const [videoError, setVideoError] = useState(null);
  const [activeServerId, setActiveServerId] = useState(null);
  const [activeResolution, setActiveResolution] = useState('1080p');

  useEffect(() => {
    if (!currentEpisode) return;
    let cancelled = false;

    const loadVideo = async () => {
      setIsVideoLoading(true);
      setVideoError(null);
      setStreamUrl('');

      try {
        const data = await fetchSourceEpisodeDetails('kuramanime', currentEpisode.id);
        if (cancelled) return;

        if (!data) {
          setVideoError('Maaf, link streaming tidak tersedia.');
          return;
        }

        setEpisodeDetails(data);

        let finalStreamUrl = '';
        let defaultServer = null;

        // PRIORITAS: defaultStreamingUrl dulu (direct .mp4 dari CDN
        // kdrive/chisato/horikita) — endpoint ini SUDAH berisi link
        // langsung yang bisa diputar dengan player kustom via stream-proxy.
        if (data.defaultStreamingUrl) {
          finalStreamUrl = `${API_BASE_URL}/kuramanime/stream-proxy?url=${encodeURIComponent(data.defaultStreamingUrl)}`;
          setActiveResolution('1080p');
          // Tetap set defaultServer dari serverList[0] supaya user bisa
          // pindah server manual lewat picker.
          if (data.serverList?.length > 0) {
            defaultServer = data.serverList[0];
            setActiveServerId(defaultServer.serverId);
          }
        } else if (data.serverList?.length > 0) {
          defaultServer = pickHighest(data.serverList, s => s.title || '') || data.serverList[0];
          setActiveResolution(defaultServer.title || '1080p');
        } else {
          // Movie / OVA / anime baru di Kuramanime kadang tidak balikkan
          // serverList maupun defaultStreamingUrl — hanya streamingUrls / videoUrl / url.
          const alt = data.streamingUrls
            || data.streamLinks
            || data.videoUrl
            || data.url;
          if (Array.isArray(alt) && alt.length > 0 && alt[0]?.url) {
            finalStreamUrl = `${API_BASE_URL}/kuramanime/stream-proxy?url=${encodeURIComponent(alt[0].url)}`;
            setActiveResolution(alt[0].quality || alt[0].title || '1080p');
          } else if (typeof alt === 'string' && alt) {
            finalStreamUrl = `${API_BASE_URL}/kuramanime/stream-proxy?url=${encodeURIComponent(alt)}`;
            setActiveResolution('1080p');
          } else {
            // Last resort: /kuramanime/resolve-stream — tapi parser
            // backend kadang ambil widget chat. Validate sebelum pakai.
            try {
              const direct = await fetchSourceStreamUrl('kuramanime', currentEpisode.id);
              if (cancelled) return;
              const looksLikeStream = direct && /^https?:\/\//i.test(direct)
                && !/kuramachat\.com/i.test(direct);
              if (looksLikeStream) {
                finalStreamUrl = direct;
                setActiveResolution('1080p');
              } else if (direct) {
                console.warn('Kuramanime resolve-stream returned non-stream URL:', direct);
              }
            } catch (e) {
              console.warn('Kuramanime resolve-stream fallback failed:', e);
            }
            if (!finalStreamUrl) {
              if (cancelled) return;
              setVideoError('Server untuk episode ini sedang offline. Coba episode lain atau muat ulang.');
            }
          }
        }

        // Resolve stream URL dari default server jika belum ada finalStreamUrl
        if (defaultServer && !finalStreamUrl) {
          let resolvedUrl = await fetchSourceStreamUrl('kuramanime', defaultServer.serverId);
          if (cancelled) return;
          if (resolvedUrl) {
            finalStreamUrl = resolvedUrl;
          } else {
            finalStreamUrl = data.defaultStreamingUrl || '';
          }
          setActiveResolution(defaultServer.title || defaultServer.serverId);
          setActiveServerId(defaultServer.serverId);
        } else if (data.defaultStreamingUrl && !finalStreamUrl) {
          finalStreamUrl = data.defaultStreamingUrl;
        }

        // Paksa ke player kustom: ekstrak embed jadi stream langsung.
        finalStreamUrl = await resolveEmbedToStream(finalStreamUrl, 'kuramanime');
        if (cancelled) return;

        setStreamUrl(finalStreamUrl);
      } catch (e) {
        if (cancelled) return;
        console.error(e);
        setVideoError('Gagal memuat detail episode.');
      } finally {
        if (!cancelled) {
          setIsVideoLoading(false);
        }
      }
    };

    loadVideo();

    return () => { cancelled = true; };
  }, [currentEpisode]);

  const handleServerChange = useCallback(async (server) => {
    if (!server || !server.serverId || activeServerId === server.serverId) return;
    setIsVideoLoading(true);
    setVideoError(null);
    setActiveServerId(server.serverId);
    setActiveResolution(server.title || server.serverId);

    try {
      let resolvedUrl = await fetchSourceStreamUrl('kuramanime', server.serverId);
      if (resolvedUrl) {
        // Paksa ke player kustom: ekstrak embed jadi stream langsung bila perlu.
        resolvedUrl = await resolveEmbedToStream(resolvedUrl, 'kuramanime');
        setStreamUrl(resolvedUrl);
      } else {
        setVideoError('Gagal mendapatkan link streaming dari server ini.');
      }
    } catch (e) {
      setVideoError('Error saat menghubungi server stream.');
    } finally {
      setIsVideoLoading(false);
    }
  }, [activeServerId]);

  const handleResolutionChange = useCallback(async (resolution) => {
    setActiveResolution(resolution);

    if (episodeDetails?.serverList) {
      const servers = episodeDetails.serverList || [];
      const targetServer = servers.find(s => {
        const label = `${s.title || ''} ${s.quality || ''}`.toLowerCase();
        return label.includes(resolution.toLowerCase().replace('p', ''));
      });
      if (targetServer && targetServer.serverId !== activeServerId) {
        await handleServerChange(targetServer);
      }
    }
  }, [episodeDetails, activeServerId, handleServerChange]);

  const getIframeUrl = useCallback(() => {
    if (!streamUrl) return '';
    return `${API_BASE_URL}/kuramanime/iframe-proxy?url=${encodeURIComponent(streamUrl)}`;
  }, [streamUrl]);

  return {
    streamUrl,
    episodeDetails,
    isVideoLoading,
    videoError,
    activeServerId,
    activeResolution,
    handleServerChange,
    handleResolutionChange,
    getIframeUrl,
    setStreamUrl,
    setVideoError,
    setIsVideoLoading,
  };
}
