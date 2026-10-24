import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Play,
  Pause,
  Download,
  Trash2,
  Camera,
  Calendar,
  Clock,
  HardDrive,
  Maximize2,
  RotateCcw,
  Cloud,
  UploadCloud,
  ExternalLink,
  AlertTriangle,
} from 'lucide-react';
import { RecordingItem } from '../types/camera';

interface VideoPlayerModalProps {
  recording: RecordingItem | null;
  onClose: () => void;
  onDelete: (id: string) => void;
  onUploadToDrive?: (recording: RecordingItem) => Promise<void>;
  isUploadingToDrive?: boolean;
}

export const VideoPlayerModal: React.FC<VideoPlayerModalProps> = ({
  recording,
  onClose,
  onDelete,
  onUploadToDrive,
  isUploadingToDrive,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [hasVideoError, setHasVideoError] = useState<boolean>(false);

  useEffect(() => {
    if (!recording || !recording.blob) {
      setObjectUrl(null);
      return;
    }

    const url = URL.createObjectURL(recording.blob);
    setObjectUrl(url);
    setIsPlaying(false);
    setCurrentTime(0);
    setHasVideoError(false);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [recording]);

  if (!recording || !objectUrl) return null;

  const isCritical = Boolean(
    recording.isCritical ||
    recording.aiThreatLevel === 'alto' ||
    (typeof recording.aiThreatScore === 'number' && recording.aiThreatScore >= 70)
  );

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
      if (!duration && videoRef.current.duration) {
        setDuration(videoRef.current.duration);
      }
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
  };

  const handleSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
  };

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = objectUrl;
    const safeDate = new Date(recording.timestamp).toISOString().replace(/[:.]/g, '-');
    link.download = `gravacao_${recording.cameraName.replace(/\s+/g, '_')}_${safeDate}.webm`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSnapshotFrame = () => {
    if (!videoRef.current) return;
    try {
      const snapCanvas = document.createElement('canvas');
      snapCanvas.width = videoRef.current.videoWidth || 640;
      snapCanvas.height = videoRef.current.videoHeight || 360;
      const ctx = snapCanvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(videoRef.current, 0, 0, snapCanvas.width, snapCanvas.height);
      const dataUrl = snapCanvas.toDataURL('image/jpeg', 0.9);

      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `frame_${recording.cameraName.replace(/\s+/g, '_')}_${Date.now()}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      alert('Não foi possível capturar o frame');
    }
  };

  const formatTime = (timeInSec: number) => {
    if (isNaN(timeInSec)) return '00:00';
    const m = Math.floor(timeInSec / 60);
    const s = Math.floor(timeInSec % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes: number) => {
    if (!bytes) return '0 KB';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const formattedDate = new Date(recording.timestamp).toLocaleString('pt-BR');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-4xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-3.5 border-b border-neutral-800 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-neutral-100">{recording.cameraName}</h2>
              <span className="text-neutral-500">·</span>
              <span className="text-xs text-neutral-400">{recording.cameraLocation}</span>
              {isCritical && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-950 border border-red-700 text-red-300 text-[10px] font-bold">
                  <AlertTriangle className="w-3 h-3 text-red-400" />
                  <span>EVENTO CRÍTICO IA</span>
                </span>
              )}
            </div>
            <p className="text-xs text-neutral-400 mt-0.5">
              Gravado em {formattedDate}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-neutral-100 rounded-lg hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Critical AI Threat Notification Ribbon */}
        {isCritical && (
          <div className="px-5 py-2.5 bg-gradient-to-r from-red-950 via-red-900 to-neutral-900 border-b border-red-800/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5 animate-pulse" />
              <div>
                <span className="font-bold text-red-200 uppercase tracking-wider text-[11px] mr-1.5">
                  Detecção de Evento Crítico pela IA:
                </span>
                <span className="text-red-100 font-medium">
                  {recording.aiThreatReason ||
                    recording.aiAnalysisSummary ||
                    'Ameaça de alta severidade detectada na cena.'}
                </span>
              </div>
            </div>
            {recording.aiThreatScore && (
              <span className="px-2 py-0.5 rounded bg-red-800/90 border border-red-600 text-white font-mono text-[11px] font-bold shrink-0">
                Ameaça: {recording.aiThreatScore}%
              </span>
            )}
          </div>
        )}

        {/* Video Player Display */}
        <div className="relative aspect-video w-full bg-black flex items-center justify-center group overflow-hidden">
          {hasVideoError && recording.thumbnailDataUrl ? (
            <div className="relative w-full h-full flex items-center justify-center bg-black">
              <img
                src={recording.thumbnailDataUrl}
                alt={recording.cameraName}
                className="w-full h-full object-contain"
              />
              <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center p-4 text-center">
                <div className="p-3 rounded-full bg-neutral-900/90 text-neutral-300 border border-neutral-700 mb-2">
                  <Play className="w-6 h-6 ml-0.5" />
                </div>
                <p className="text-xs text-neutral-200 font-medium">
                  Prévia de frame da gravação do circuito CFTV
                </p>
                <p className="text-[11px] text-neutral-400 mt-0.5">
                  Utilize o botão &quot;Baixar&quot; para exportar o arquivo de vídeo original
                </p>
              </div>
            </div>
          ) : (
            <video
              ref={videoRef}
              src={objectUrl}
              playsInline
              onError={() => setHasVideoError(true)}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={() => {
                if (videoRef.current) {
                  setDuration(videoRef.current.duration || recording.durationSeconds);
                }
              }}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsPlaying(false)}
              className="w-full h-full object-contain"
              onClick={togglePlay}
            />
          )}

          {/* Big Center Play Button when paused */}
          {!isPlaying && !hasVideoError && (
            <button
              onClick={togglePlay}
              className={`absolute p-4 rounded-full text-white backdrop-blur-sm hover:scale-110 transition-transform shadow-xl ${
                isCritical ? 'bg-red-600/90 shadow-red-950/80' : 'bg-neutral-900/80'
              }`}
            >
              <Play className="w-8 h-8 fill-current ml-0.5" />
            </button>
          )}

          {/* OSD Watermark Tags */}
          <div className="absolute top-3 left-3 flex flex-wrap items-center gap-2">
            {isCritical && (
              <div className="px-2 py-0.5 rounded bg-red-950/90 border border-red-500 backdrop-blur-sm text-[11px] font-mono text-red-200 flex items-center gap-1 shadow-lg">
                <AlertTriangle className="w-3.5 h-3.5 text-red-400 animate-pulse" />
                <span>AMEAÇA CRÍTICA IA</span>
              </div>
            )}
            <div className="px-2 py-0.5 rounded bg-black/60 backdrop-blur-sm text-[11px] font-mono text-neutral-300">
              {recording.triggerType === 'motion' ? 'TRIGGER: MOVIMENTO' : 'TRIGGER: MANUAL'}
            </div>
            {recording.driveFileId && (
              <div className="px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-700/60 backdrop-blur-sm text-[11px] font-mono text-emerald-300 flex items-center gap-1">
                <Cloud className="w-3 h-3" />
                <span>SALVO NO DRIVE</span>
              </div>
            )}
          </div>
        </div>

        {/* Video Scrubber & Playback Controls */}
        <div className="p-4 bg-neutral-950 border-t border-neutral-800 space-y-3">
          {/* Timeline Scrubber */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono tabular-nums text-neutral-300 w-10 text-right">
              {formatTime(currentTime)}
            </span>
            <input
              type="range"
              min="0"
              max={duration || recording.durationSeconds || 1}
              step="0.1"
              value={currentTime}
              onChange={handleSeek}
              className="w-full accent-blue-500 h-1.5 bg-neutral-800 rounded-lg cursor-pointer"
            />
            <span className="text-xs font-mono tabular-nums text-neutral-400 w-10">
              {formatTime(duration || recording.durationSeconds)}
            </span>
          </div>

          {/* Buttons row */}
          <div className="flex items-center justify-between gap-3 text-xs">
            {/* Play/Pause & Speed */}
            <div className="flex items-center gap-2">
              <button
                onClick={togglePlay}
                className="p-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors"
                title={isPlaying ? 'Pausar' : 'Reproduzir'}
              >
                {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
              </button>

              <button
                onClick={() => {
                  if (videoRef.current) {
                    videoRef.current.currentTime = 0;
                  }
                }}
                className="p-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors"
                title="Reiniciar vídeo"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              {/* Speed Selectors */}
              <div className="flex items-center gap-1 bg-neutral-900 p-0.5 rounded-lg border border-neutral-800">
                {[0.5, 1, 1.5, 2].map((spd) => (
                  <button
                    key={spd}
                    onClick={() => handleSpeedChange(spd)}
                    className={`px-2 py-1 rounded text-[11px] font-mono transition-colors ${
                      playbackSpeed === spd
                        ? 'bg-neutral-800 text-neutral-100 font-semibold'
                        : 'text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    {spd}x
                  </button>
                ))}
              </div>
            </div>

            {/* Actions: Google Drive Cloud, Download, Frame Snapshot, Delete */}
            <div className="flex items-center gap-2">
              {/* Google Drive action */}
              {recording.driveViewLink ? (
                <a
                  href={recording.driveViewLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 font-medium transition-colors border border-emerald-800/80"
                  title="Abrir arquivo de vídeo no Google Drive"
                >
                  <Cloud className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Ver no Drive</span>
                  <ExternalLink className="w-3 h-3 text-emerald-400" />
                </a>
              ) : onUploadToDrive ? (
                <button
                  onClick={() => onUploadToDrive(recording)}
                  disabled={isUploadingToDrive}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-emerald-400 font-medium transition-colors border border-neutral-700 disabled:opacity-50"
                  title="Fazer upload para o Google Drive"
                >
                  <UploadCloud className="w-3.5 h-3.5" />
                  <span>{isUploadingToDrive ? 'Enviando...' : 'Salvar no Drive'}</span>
                </button>
              ) : null}

              <button
                onClick={handleSnapshotFrame}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white transition-colors border border-neutral-700"
                title="Salvar foto deste frame do vídeo"
              >
                <Camera className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Capturar Frame</span>
              </button>

              <button
                onClick={handleDownload}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors shadow"
                title="Baixar arquivo de vídeo (.webm) para o computador"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Baixar</span>
              </button>

              <button
                onClick={() => {
                  if (confirm('Tem certeza que deseja excluir esta gravação do site?')) {
                    onDelete(recording.id);
                    onClose();
                  }
                }}
                className="p-2 rounded-lg bg-neutral-800 hover:bg-red-950 hover:text-red-400 text-neutral-400 transition-colors border border-neutral-700"
                title="Excluir gravação"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Video Metadata Footer */}
        <div className="px-6 py-3 bg-neutral-900 border-t border-neutral-800 flex items-center justify-between text-xs text-neutral-400">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 font-mono tabular-nums">
              <Clock className="w-3.5 h-3.5 text-neutral-500" />
              Duração: {formatTime(recording.durationSeconds)}
            </span>
            <span className="flex items-center gap-1.5 font-mono tabular-nums">
              <HardDrive className="w-3.5 h-3.5 text-neutral-500" />
              Tamanho: {formatFileSize(recording.fileSizeBytes)}
            </span>
          </div>
          <span className="text-[11px] text-neutral-500">
            {recording.driveFileId
              ? 'Sincronizado na Nuvem (Google Drive)'
              : 'Armazenado no navegador (IndexedDB)'}
          </span>
        </div>
      </div>
    </div>
  );
};
