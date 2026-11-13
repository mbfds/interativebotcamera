import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Activity,
  AlertTriangle,
  Maximize2,
  Clock,
  Film,
} from 'lucide-react';
import { RecordingItem, MotionEvent, RecordingMotionMarker } from '../types/camera';

export function resolveRecordingMotionMarkers(
  recording: RecordingItem,
  motionEvents: MotionEvent[] = []
): RecordingMotionMarker[] {
  const duration = Math.max(1, recording.durationSeconds || 1);
  const markers: RecordingMotionMarker[] = [...(recording.motionMarkers || [])];

  // Match external MotionEvents that occurred during this recording's time window
  const startMs = recording.timestamp - 1500;
  const endMs = recording.timestamp + duration * 1000 + 1500;

  motionEvents.forEach((evt) => {
    if (evt.cameraId === recording.cameraId && evt.timestamp >= startMs && evt.timestamp <= endMs) {
      const offsetSeconds = Math.max(
        0,
        Math.min(duration, Number(((evt.timestamp - recording.timestamp) / 1000).toFixed(1)))
      );
      const alreadyNear = markers.some((m) => Math.abs(m.offsetSeconds - offsetSeconds) < 1.2);
      if (!alreadyNear) {
        markers.push({
          id: `evt-mk-${evt.id}`,
          offsetSeconds,
          timestamp: evt.timestamp,
          intensity: evt.intensity,
          label: evt.intensity >= 75 ? 'Movimento Intenso' : 'Movimento Detectado',
          isCritical: recording.isCritical && evt.intensity >= 80,
        });
      }
    }
  });

  // Fallback for legacy motion-triggered recordings stored before motionMarkers existed
  if (markers.length === 0 && recording.triggerType === 'motion') {
    markers.push({
      id: `trigger-mk-${recording.id}`,
      offsetSeconds: Number(Math.min(1.5, duration * 0.15).toFixed(1)),
      timestamp: recording.timestamp + 1500,
      intensity: recording.aiThreatScore || 68,
      label: recording.aiThreatReason || 'Disparo por movimento',
      isCritical: Boolean(recording.isCritical),
    });
    if (duration >= 10) {
      markers.push({
        id: `peak-mk-${recording.id}`,
        offsetSeconds: Number((duration * 0.52).toFixed(1)),
        timestamp: recording.timestamp + Math.round(duration * 520),
        intensity: recording.isCritical ? recording.aiThreatScore || 90 : 74,
        label: recording.isCritical ? 'Pico de atividade crítica' : 'Pico de movimento',
        isCritical: Boolean(recording.isCritical),
      });
    }
  }

  return markers.sort((a, b) => a.offsetSeconds - b.offsetSeconds);
}

interface RecordingTimelineProps {
  recordings: RecordingItem[];
  motionEvents: MotionEvent[];
  selectedRecordingId: string | null;
  onSelectRecording: (rec: RecordingItem) => void;
  onOpenPlayerAtTime: (rec: RecordingItem, seekTime: number) => void;
}

export const RecordingTimeline: React.FC<RecordingTimelineProps> = ({
  recordings,
  motionEvents,
  selectedRecordingId,
  onSelectRecording,
  onOpenPlayerAtTime,
}) => {
  const activeRecording = useMemo(() => {
    if (recordings.length === 0) return null;
    return recordings.find((r) => r.id === selectedRecordingId) || recordings[0];
  }, [recordings, selectedRecordingId]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [hasVideoError, setHasVideoError] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [isScrubbing, setIsScrubbing] = useState<boolean>(false);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoveredMarker, setHoveredMarker] = useState<RecordingMotionMarker | null>(null);

  // Chronological list (oldest to newest) for overview strip
  const chronologicalRecordings = useMemo(() => {
    return [...recordings].sort((a, b) => a.timestamp - b.timestamp);
  }, [recordings]);

  const activeMarkers = useMemo(() => {
    if (!activeRecording) return [];
    return resolveRecordingMotionMarkers(activeRecording, motionEvents);
  }, [activeRecording, motionEvents]);

  const effectiveDuration = Math.max(
    1,
    duration || activeRecording?.durationSeconds || 1
  );

  // Manage Blob Object URL when active recording changes
  useEffect(() => {
    if (!activeRecording || !activeRecording.blob) {
      setObjectUrl(null);
      return;
    }

    const url = URL.createObjectURL(activeRecording.blob);
    setObjectUrl(url);
    setHasVideoError(false);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(activeRecording.durationSeconds || 1);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [activeRecording]);

  // Simulated playback progression if the blob is a seeded/non-playable placeholder video
  useEffect(() => {
    if (!isPlaying || !hasVideoError) return;
    const interval = window.setInterval(() => {
      setCurrentTime((prev) => {
        const next = prev + 0.1;
        if (next >= effectiveDuration) {
          setIsPlaying(false);
          return effectiveDuration;
        }
        return next;
      });
    }, 100);
    return () => clearInterval(interval);
  }, [isPlaying, hasVideoError, effectiveDuration]);

  const seekTo = useCallback(
    (timeSec: number) => {
      const clamped = Math.max(0, Math.min(effectiveDuration, timeSec));
      setCurrentTime(clamped);
      if (videoRef.current && !hasVideoError) {
        try {
          videoRef.current.currentTime = clamped;
        } catch {
          // Ignore seek errors while metadata loads
        }
      }
    },
    [effectiveDuration, hasVideoError]
  );

  const togglePlay = () => {
    if (hasVideoError) {
      if (currentTime >= effectiveDuration) {
        setCurrentTime(0);
      }
      setIsPlaying((prev) => !prev);
      return;
    }
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play().catch(() => {});
    }
  };

  // Pointer scrubbing on the timeline track
  const calculateTimeFromPointer = (clientX: number): number => {
    if (!trackRef.current) return 0;
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
    return ratio * effectiveDuration;
  };

  const handleTrackPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsScrubbing(true);
    const t = calculateTimeFromPointer(e.clientX);
    seekTo(t);
  };

  const handleTrackPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const t = calculateTimeFromPointer(e.clientX);
    setHoverTime(t);
    if (isScrubbing) {
      seekTo(t);
    }
  };

  const handleTrackPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isScrubbing) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore
      }
      setIsScrubbing(false);
    }
  };

  // Jump to previous or next detected motion event
  const handleJumpPrevMotion = () => {
    if (activeMarkers.length === 0) return;
    const prevMarkers = activeMarkers.filter((m) => m.offsetSeconds < currentTime - 0.6);
    const target = prevMarkers.length > 0 ? prevMarkers[prevMarkers.length - 1] : activeMarkers[0];
    seekTo(target.offsetSeconds);
  };

  const handleJumpNextMotion = () => {
    if (activeMarkers.length === 0) return;
    const nextMarker = activeMarkers.find((m) => m.offsetSeconds > currentTime + 0.6);
    const target = nextMarker || activeMarkers[activeMarkers.length - 1];
    seekTo(target.offsetSeconds);
  };

  const formatTimestamp = (sec: number) => {
    if (isNaN(sec) || sec < 0) return '00:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Check if playhead is currently inside a detected motion window (±1.4s)
  const currentActiveMotion = useMemo(() => {
    return (
      activeMarkers.find((m) => Math.abs(m.offsetSeconds - currentTime) <= 1.4) || null
    );
  }, [activeMarkers, currentTime]);

  if (!activeRecording) return null;

  const progressPercent = Math.min(100, Math.max(0, (currentTime / effectiveDuration) * 100));

  return (
    <section
      aria-label="Linha do tempo visual de movimento e gravações"
      className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 sm:p-5 space-y-4"
    >
      {/* Timeline Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <Activity className="w-4 h-4 text-amber-400 shrink-0" />
            <h3 className="text-sm font-semibold text-neutral-100">
              Linha do Tempo de Eventos e Scrubbing
            </h3>
            <span className="text-neutral-500">·</span>
            <span className="text-xs text-neutral-400 font-mono tabular-nums">
              {activeMarkers.length} {activeMarkers.length === 1 ? 'evento de movimento' : 'eventos de movimento'} nesta gravação
            </span>
          </div>
          <p className="text-xs text-neutral-400">
            Arraste o cursor na barra para avançar/retroceder ou clique nos marcadores destacados para saltar exatamente ao instante do movimento.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onOpenPlayerAtTime(activeRecording, currentTime)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs font-medium text-neutral-100 transition-colors whitespace-nowrap shrink-0"
          >
            <Maximize2 className="w-3.5 h-3.5 text-blue-400" />
            <span>Expandir Player</span>
          </button>
        </div>
      </div>

      {/* Multi-Recording Chronological Strip */}
      {chronologicalRecordings.length > 1 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-neutral-400">
            <span>Sequência Cronológica ({chronologicalRecordings.length} gravações filtradas)</span>
            <span className="font-mono tabular-nums">
              {new Date(chronologicalRecordings[0].timestamp).toLocaleTimeString('pt-BR', {
                hour: '2-digit',
                minute: '2-digit',
              })}
              {' → '}
              {new Date(
                chronologicalRecordings[chronologicalRecordings.length - 1].timestamp
              ).toLocaleTimeString('pt-BR', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {chronologicalRecordings.map((rec) => {
              const markers = resolveRecordingMotionMarkers(rec, motionEvents);
              const isSelected = rec.id === activeRecording.id;
              const isCrit = Boolean(rec.isCritical || rec.aiThreatLevel === 'alto');
              const timeLabel = new Date(rec.timestamp).toLocaleTimeString('pt-BR', {
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <button
                  key={rec.id}
                  type="button"
                  onClick={() => onSelectRecording(rec)}
                  className={`group relative flex flex-col justify-between min-w-[132px] max-w-[180px] p-2 rounded-lg border text-left transition-colors shrink-0 ${
                    isSelected
                      ? 'bg-neutral-800 border-blue-500 text-neutral-100'
                      : 'bg-neutral-950/70 border-neutral-800 hover:border-neutral-700 text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 text-[10px] font-mono tabular-nums">
                    <span className={isSelected ? 'text-blue-400 font-semibold' : 'text-neutral-400'}>
                      {timeLabel}
                    </span>
                    <span>{formatTimestamp(rec.durationSeconds)}</span>
                  </div>
                  <div className="text-[11px] font-medium truncate mt-0.5 text-neutral-200">
                    {rec.cameraName}
                  </div>
                  {/* Mini motion density preview bar inside segment */}
                  <div className="relative w-full h-1.5 bg-neutral-900 rounded-sm mt-1.5 overflow-hidden">
                    {markers.map((m) => {
                      const leftPct = Math.min(
                        96,
                        Math.max(0, (m.offsetSeconds / Math.max(1, rec.durationSeconds)) * 100)
                      );
                      return (
                        <span
                          key={m.id}
                          style={{ left: `${leftPct}%` }}
                          className={`absolute top-0 bottom-0 w-1.5 rounded-sm ${
                            m.isCritical || isCrit ? 'bg-red-500' : 'bg-amber-400'
                          }`}
                        />
                      );
                    })}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Active Scrubber + Preview Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch pt-1 border-t border-neutral-800/80">
        {/* Compact Live Scrub Preview Viewport */}
        <div className="lg:col-span-4 relative aspect-video bg-black rounded-xl overflow-hidden border border-neutral-800 flex items-center justify-center">
          {hasVideoError || !objectUrl ? (
            <div className="relative w-full h-full flex items-center justify-center bg-neutral-950">
              {activeRecording.thumbnailDataUrl ? (
                <img
                  src={activeRecording.thumbnailDataUrl}
                  alt={activeRecording.cameraName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Film className="w-8 h-8 text-neutral-600" />
              )}
            </div>
          ) : (
            <video
              ref={videoRef}
              src={objectUrl}
              playsInline
              muted
              onError={() => setHasVideoError(true)}
              onTimeUpdate={() => {
                if (videoRef.current && !isScrubbing) {
                  setCurrentTime(videoRef.current.currentTime);
                  if (videoRef.current.duration && !isNaN(videoRef.current.duration)) {
                    setDuration(videoRef.current.duration);
                  }
                }
              }}
              onLoadedMetadata={() => {
                if (videoRef.current && videoRef.current.duration && !isNaN(videoRef.current.duration)) {
                  setDuration(videoRef.current.duration);
                }
              }}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsPlaying(false)}
              onClick={togglePlay}
              className="w-full h-full object-cover cursor-pointer"
            />
          )}

          {/* Scrim + Timecode & Active Motion Overlay */}
          <div className="absolute inset-x-0 bottom-0 p-2.5 bg-gradient-to-t from-black/85 via-black/40 to-transparent flex items-center justify-between gap-2 pointer-events-none">
            <span className="font-mono tabular-nums text-[11px] text-neutral-100">
              {formatTimestamp(currentTime)} / {formatTimestamp(effectiveDuration)}
            </span>
            {currentActiveMotion && (
              <span
                className={`text-[10px] font-mono tabular-nums font-semibold px-1.5 py-0.5 rounded ${
                  currentActiveMotion.isCritical
                    ? 'bg-red-600 text-white'
                    : 'bg-amber-500 text-neutral-950'
                }`}
              >
                MOVIMENTO {currentActiveMotion.intensity}%
              </span>
            )}
          </div>
        </div>

        {/* Interactive Timeline Track & Controls */}
        <div className="lg:col-span-8 flex flex-col justify-between gap-3">
          {/* Selected Recording Meta + Transport Controls */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-semibold text-neutral-100 truncate">
                  {activeRecording.cameraName}
                </span>
                <span className="text-neutral-500">·</span>
                <span className="text-neutral-400 truncate">{activeRecording.cameraLocation}</span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-neutral-400 font-mono tabular-nums mt-0.5">
                <Clock className="w-3 h-3 text-neutral-500" />
                <span>{new Date(activeRecording.timestamp).toLocaleString('pt-BR')}</span>
                {currentActiveMotion?.label && (
                  <>
                    <span className="text-neutral-600">·</span>
                    <span className={currentActiveMotion.isCritical ? 'text-red-400 font-semibold' : 'text-amber-400'}>
                      {currentActiveMotion.label}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Playback + Jump to Motion Controls */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={handleJumpPrevMotion}
                disabled={activeMarkers.length === 0}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 text-xs text-neutral-300 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
                title="Saltar para o evento de movimento anterior"
              >
                <SkipBack className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">Anterior</span>
              </button>

              <button
                type="button"
                onClick={togglePlay}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-medium text-white transition-colors whitespace-nowrap shrink-0"
              >
                {isPlaying ? (
                  <>
                    <Pause className="w-3.5 h-3.5 fill-current" />
                    <span>Pausar</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Reproduzir</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleJumpNextMotion}
                disabled={activeMarkers.length === 0}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 text-xs text-neutral-300 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
                title="Saltar para o próximo evento de movimento"
              >
                <span className="hidden sm:inline">Próximo</span>
                <SkipForward className="w-3.5 h-3.5 text-amber-400" />
              </button>
            </div>
          </div>

          {/* Interactive Motion Scrub Track */}
          <div className="space-y-1.5">
            <div
              ref={trackRef}
              onPointerDown={handleTrackPointerDown}
              onPointerMove={handleTrackPointerMove}
              onPointerUp={handleTrackPointerUp}
              onPointerLeave={() => {
                setHoverTime(null);
                setHoveredMarker(null);
              }}
              role="slider"
              aria-label="Linha do tempo interativa com eventos de movimento"
              aria-valuemin={0}
              aria-valuemax={effectiveDuration}
              aria-valuenow={Number(currentTime.toFixed(1))}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight') seekTo(currentTime + 2);
                if (e.key === 'ArrowLeft') seekTo(currentTime - 2);
              }}
              className="relative h-16 bg-neutral-950 border border-neutral-800 rounded-xl select-none cursor-pointer overflow-visible touch-none"
            >
              {/* Ruler Grid Lines */}
              <div className="absolute inset-0 flex justify-between px-2 pointer-events-none">
                {[0, 0.25, 0.5, 0.75, 1].map((pct) => (
                  <div key={pct} className="h-full border-l border-neutral-800/70 first:border-l-0" />
                ))}
              </div>

              {/* Played Progress Fill */}
              <div
                className="absolute inset-y-0 left-0 bg-blue-600/15 pointer-events-none rounded-l-xl"
                style={{ width: `${progressPercent}%` }}
              />

              {/* Highlighted Motion Activity Bars */}
              {activeMarkers.map((marker) => {
                const leftPct = Math.min(
                  98.5,
                  Math.max(1.5, (marker.offsetSeconds / effectiveDuration) * 100)
                );
                const barHeightPct = Math.max(30, Math.min(92, marker.intensity));
                const isCrit = Boolean(marker.isCritical || marker.intensity >= 85);

                return (
                  <button
                    key={marker.id}
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      seekTo(marker.offsetSeconds);
                    }}
                    onMouseEnter={() => setHoveredMarker(marker)}
                    onMouseLeave={() => setHoveredMarker(null)}
                    style={{ left: `${leftPct}%` }}
                    className="absolute bottom-0 top-0 -translate-x-1/2 w-5 flex flex-col items-center justify-end group/pin z-10 focus:outline-none"
                    title={`${formatTimestamp(marker.offsetSeconds)} · Movimento ${marker.intensity}%${
                      marker.label ? ` (${marker.label})` : ''
                    }`}
                  >
                    {/* Top Event Pin */}
                    <span
                      className={`mt-1 w-2.5 h-2.5 rounded-full border transition-transform group-hover/pin:scale-125 ${
                        isCrit
                          ? 'bg-red-500 border-red-200'
                          : 'bg-amber-400 border-amber-100'
                      }`}
                    />
                    {/* Vertical Intensity Spike */}
                    <span
                      style={{ height: `${barHeightPct}%` }}
                      className={`w-1.5 rounded-t transition-opacity mt-auto ${
                        isCrit
                          ? 'bg-red-500/85 group-hover/pin:bg-red-400'
                          : 'bg-amber-400/80 group-hover/pin:bg-amber-300'
                      }`}
                    />
                  </button>
                );
              })}

              {/* Hover Time / Marker Tooltip */}
              {(hoveredMarker || hoverTime !== null) && (
                <div
                  style={{
                    left: `${
                      hoveredMarker
                        ? Math.min(92, Math.max(8, (hoveredMarker.offsetSeconds / effectiveDuration) * 100))
                        : Math.min(92, Math.max(8, ((hoverTime || 0) / effectiveDuration) * 100))
                    }%`,
                  }}
                  className="absolute -top-8 -translate-x-1/2 px-2 py-0.5 rounded bg-neutral-800 border border-neutral-700 text-[10px] font-mono tabular-nums text-neutral-100 whitespace-nowrap pointer-events-none z-30 shadow-lg"
                >
                  {hoveredMarker
                    ? `${formatTimestamp(hoveredMarker.offsetSeconds)} · ${hoveredMarker.intensity}% ${
                        hoveredMarker.label ? `(${hoveredMarker.label})` : ''
                      }`
                    : formatTimestamp(hoverTime || 0)}
                </div>
              )}

              {/* Playhead Needle */}
              <div
                style={{ left: `${progressPercent}%` }}
                className="absolute inset-y-0 w-0.5 bg-blue-400 pointer-events-none z-20"
              >
                <div className="w-3 h-3 rounded-full bg-blue-400 border-2 border-neutral-950 -translate-x-[5px] -translate-y-1 shadow" />
              </div>
            </div>

            {/* Ruler Timestamps */}
            <div className="flex items-center justify-between text-[10px] font-mono tabular-nums text-neutral-500 px-0.5">
              <span>00:00</span>
              <span>{formatTimestamp(effectiveDuration * 0.25)}</span>
              <span>{formatTimestamp(effectiveDuration * 0.5)}</span>
              <span>{formatTimestamp(effectiveDuration * 0.75)}</span>
              <span>{formatTimestamp(effectiveDuration)}</span>
            </div>
          </div>

          {/* Quick-Jump Motion Event Timestamps List */}
          <div className="flex items-center gap-2 flex-wrap pt-1">
            <span className="text-[11px] text-neutral-400 shrink-0">Saltar para movimento:</span>
            {activeMarkers.length === 0 ? (
              <span className="text-[11px] text-neutral-500">
                Nenhum evento de movimento registrado nesta gravação manual.
              </span>
            ) : (
              activeMarkers.map((marker) => {
                const isNear = Math.abs(currentTime - marker.offsetSeconds) <= 1.2;
                const isCrit = Boolean(marker.isCritical || marker.intensity >= 85);

                return (
                  <button
                    key={marker.id}
                    type="button"
                    onClick={() => seekTo(marker.offsetSeconds)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-mono tabular-nums transition-colors whitespace-nowrap shrink-0 ${
                      isNear
                        ? isCrit
                          ? 'bg-red-950 border-red-500 text-red-200 font-semibold'
                          : 'bg-amber-950 border-amber-500 text-amber-200 font-semibold'
                        : 'bg-neutral-950 hover:bg-neutral-800 border-neutral-800 text-neutral-300'
                    }`}
                  >
                    {isCrit ? (
                      <AlertTriangle className="w-3 h-3 text-red-400 shrink-0" />
                    ) : (
                      <Activity className="w-3 h-3 text-amber-400 shrink-0" />
                    )}
                    <span>{formatTimestamp(marker.offsetSeconds)}</span>
                    <span className="text-neutral-500">·</span>
                    <span>{marker.intensity}%</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
