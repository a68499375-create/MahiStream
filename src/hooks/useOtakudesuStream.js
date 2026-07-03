import { useState, useEffect, useCallback } from 'react';
import { fetchSourceEpisodeDetails, fetchSourceStreamUrl } from '../services/api';
import { resolutionScore, pickHighest, resolveEmbedToStream } from './streamHelpers';

/**
 * Hook untuk memuat stream dari source Otakudesu.
 * Otakudesu SELALU di-extract ke .m3u8/.mp4 via /extract-stream lalu
 * disalurkan lewat stream-proxy supaya player kustom (HTML5 <video>) yang memutar.
 */
export default function useOtakudesuStream(currentEpisode) {
  const [streamUrl, setStreamUrl] = useState('');
  const [episodeDetails, setEpisodeDetails] = useState(null);
  const [isVideoLoading, setIsVideoLoading] = useState(false);
  const [videoError, setVideoError] = useState(null);
  const [activeServerId, setActiveServerId] = useState(null);
  const [activeResolution, setActiveResolution] = useState('720p');

  useEffect(() => {
    if (!currentEpisode) return;
    let cancelled = false;

    const loadVideo = async () => {
      setIsVideoLoading(true);
      setVideoError(null);
      setStreamUrl('');

      try {
        const data = await fetchSourceEpisodeDetails('otakudesu', currentEpisode.id);
        if (cancelled) return;

        if (!data) {
          setVideoError('Maaf, link streaming tidak tersedia.');
          return;
        }

        setEpisodeDetails(data);

        let finalStreamUrl = '';
        let defaultServer = null;

        const serverQualities = data.server?.qualityList || [];
        // Utamakan resolusi tertinggi yang tersedia (mis. 1080p > 720p > 480p).
        let matchedQuality = pickHighest(serverQualities, q => q.title || q.quality || '');

        if (matchedQuality && matchedQuality.serverList?.length > 0) {
          const preferredNames = ['desustream', 'pdrain', 'filedon', 'otakuwatch', 'yourupload'];
          for (const pref of preferredNames) {
            const found = matchedQuality.serverList.find(s => s.title.toLowerCase().includes(pref));
            if (found) {
              defaultServer = found;
              break;
            }
          }
          if (!defaultServer) {
            defaultServer = matchedQuality.serverList[0];
          }
          setActiveResolution(matchedQuality.quality || matchedQuality.title || '720p');
        }

        // Resolve stream URL dari default server
        if (defaultServer && !finalStreamUrl) {
          let resolvedUrl = await fetchSourceStreamUrl('otakudesu', defaultServer.serverId);
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
        finalStreamUrl = await resolveEmbedToStream(finalStreamUrl, 'otakudesu');
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
      let resolvedUrl = await fetchSourceStreamUrl('otakudesu', server.serverId);
      if (resolvedUrl) {
        resolvedUrl = await resolveEmbedToStream(resolvedUrl, 'otakudesu');
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

    if (episodeDetails?.server?.qualityList) {
      const servers = (episodeDetails.server.qualityList || []).flatMap(q => q.serverList || []);
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
    // Otakudesu: streamUrl sudah berupa direct stream (mp4/m3u8 via proxy)
    return streamUrl;
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
