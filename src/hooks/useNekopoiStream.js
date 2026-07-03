import { useState, useEffect, useCallback } from 'react';
import { fetchSourceEpisodeDetails, API_BASE_URL } from '../services/api';
import { orderNekopoiServers } from './streamHelpers';

/**
 * Hook untuk memuat stream dari source Nekopoi.
 * Nekopoi TIDAK di-extract — langsung pakai iframe ad-stripped dari backend
 * (/nekopoi/iframe-proxy). Cukup pilih server prioritas teratas dan
 * biarkan getIframeUrl() yang menyalurkan.
 */
export default function useNekopoiStream(currentEpisode) {
  const [streamUrl, setStreamUrl] = useState('');
  const [episodeDetails, setEpisodeDetails] = useState(null);
  const [isVideoLoading, setIsVideoLoading] = useState(false);
  const [videoError, setVideoError] = useState(null);
  const [activeServerId, setActiveServerId] = useState(null);
  const [activeResolution, setActiveResolution] = useState('Auto');

  useEffect(() => {
    if (!currentEpisode) return;
    let cancelled = false;

    const loadVideo = async () => {
      setIsVideoLoading(true);
      setVideoError(null);
      setStreamUrl('');

      try {
        const data = await fetchSourceEpisodeDetails('nekopoi', currentEpisode.id);
        if (cancelled) return;

        if (!data) {
          setVideoError('Maaf, link streaming tidak tersedia.');
          return;
        }

        // Nekopoi streamLinks -> serverList mapping
        if (data.streamLinks) {
          data.serverList = data.streamLinks.map(s => ({
            title: s.serverName || 'Nekopoi Player',
            serverId: s.serverId,
          }));
        }

        setEpisodeDetails(data);

        // Player utama Nekopoi: iframe ad-stripped dari backend.
        // Pilih server prioritas teratas (720p > vidnest > generik > streamruby/streampoi).
        const servers = orderNekopoiServers(data.serverList || []);
        if (servers.length === 0) {
          if (cancelled) return;
          setVideoError('Tidak ada server Nekopoi tersedia.');
        } else {
          const chosen = servers[0];
          const label = `${chosen.serverName || ''} ${chosen.title || ''} ${chosen.quality || ''} ${chosen.serverId || ''}`.toLowerCase();
          let detectedQuality = 'Auto';
          if (label.includes('720p') || label.includes('720 p')) detectedQuality = '720p';
          else if (label.includes('1080p')) detectedQuality = '1080p';
          else if (label.includes('480p')) detectedQuality = '480p';
          else if (label.includes('360p')) detectedQuality = '360p';
          setActiveResolution(detectedQuality);
          setActiveServerId(chosen.serverId);
          // streamUrl = serverId (embed URL); iframe path akan mem-proxy
          setStreamUrl(chosen.serverId);
        }
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

    // Nekopoi: langsung gunakan URL embed; getIframeUrl() yang akan
    // menyalurkan via /nekopoi/iframe-proxy (ad-stripped) ke <iframe>.
    setStreamUrl(server.serverId);
    setIsVideoLoading(false);
  }, [activeServerId]);

  const handleResolutionChange = useCallback(async (resolution) => {
    // Nekopoi: hanya update label resolusi aktif, tidak perlu ganti stream
    setActiveResolution(resolution);
  }, []);

  const getIframeUrl = useCallback(() => {
    if (!streamUrl) return '';
    // Jika sudah direct (.mp4/.m3u8/proxy), return as-is
    const isDirect = streamUrl.includes('.mp4') || streamUrl.includes('.m3u8') || streamUrl.includes('/proxy/stream') || streamUrl.includes('stream-proxy');
    if (isDirect) return streamUrl;
    // Route lewat backend iframe-proxy supaya iklan di-strip server-side
    return `${API_BASE_URL}/nekopoi/iframe-proxy?url=${encodeURIComponent(streamUrl)}`;
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
