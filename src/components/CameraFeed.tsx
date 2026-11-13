import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Circle,
  Camera,
  Maximize2,
  Minimize2,
  Moon,
  Sun,
  Sliders,
  VideoOff,
  Sparkles,
  Volume2,
  VolumeX,
  ShieldAlert,
  CalendarClock,
  PauseCircle,
  Wifi,
  RefreshCw,
} from 'lucide-react';
import {
  CameraConfig,
  MotionEvent,
  RecordingItem,
  RecordingMotionMarker,
  DetectedObjectTag,
  UserRole,
} from '../types/camera';
import { MotionDetector } from '../utils/motionDetector';
import { saveRecordingToDB, saveEventToDB, DEFAULT_UNIT_ID } from '../services/db';
import { playMotionAlarm, playRecordBeep, playAIThreatAlarm } from '../utils/soundAlert';
import { sendHighThreatBrowserNotification } from '../utils/browserNotifications';
import { evaluateRecordingSchedule } from '../utils/recordingSchedule';
import { probeSingleCameraIp } from '../utils/networkDiscovery';
import { PTZControls } from './PTZControls';

interface CameraFeedProps {
  camera: CameraConfig;
  onUpdateCamera: (camera: CameraConfig) => void;
  onRecordingSaved: () => void;
  onMotionEventLogged: (event: MotionEvent) => void;
  soundEnabled: boolean;
  isFocused?: boolean;
  onToggleFocus?: () => void;
  onAnalyzeAI?: (camera: CameraConfig, frameBase64: string) => void;
  externalThreatAlert?: {
    level: 'alto' | 'medio' | 'baixo';
    score: number;
    reason?: string;
    timestamp: number;
  } | null;
  onDismissThreatAlert?: () => void;
  latestAiTags?: {
    detectedObjects: DetectedObjectTag[];
    detectedElements: string[];
    summary?: string;
  } | null;
  currentUserRole?: UserRole;
}

function isBrowserPlayableUrl(url?: string): boolean {
  if (!url) return false;
  const trimmed = url.trim().toLowerCase();
  return (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('blob:')
  );
}

export const CameraFeed: React.FC<CameraFeedProps> = ({
  camera,
  onUpdateCamera,
  onRecordingSaved,
  onMotionEventLogged,
  soundEnabled,
  isFocused,
  onToggleFocus,
  onAnalyzeAI,
  externalThreatAlert,
  onDismissThreatAlert,
  latestAiTags,
  currentUserRole = 'admin',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const activeStreamRef = useRef<MediaStream | null>(null);
  const motionDetectorRef = useRef<MotionDetector | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const autoRecordTimerRef = useRef<number | null>(null);

  const isCameraSoundEnabled = camera.soundAlarmEnabled !== false;

  // Stream & RTSP Probe State
  const [activeStream, setActiveStream] = useState<MediaStream | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [isLoadingStream, setIsLoadingStream] = useState<boolean>(true);
  const [rtspStatus, setRtspStatus] = useState<{
    checked: boolean;
    reachable: boolean;
    latencyMs?: number;
    message: string;
  } | null>(null);
  const [isCheckingRtsp, setIsCheckingRtsp] = useState(false);

  // Recording state
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordDuration, setRecordDuration] = useState<number>(0);
  const [recordTrigger, setRecordTrigger] = useState<'manual' | 'motion'>('manual');
  const recordIntervalRef = useRef<number | null>(null);
  const recordingStartTimeRef = useRef<number>(0);
  const recordingMotionMarkersRef = useRef<RecordingMotionMarker[]>([]);
  const lastMarkerTimeRef = useRef<number>(0);

  // Motion Detection state
  const [motionScore, setMotionScore] = useState<number>(0);
  const [isMotionTriggered, setIsMotionTriggered] = useState<boolean>(false);
  const lastAlarmTimeRef = useRef<number>(0);

  // AI High Threat Alert State & Siren Handle
  const [activeAIThreat, setActiveAIThreat] = useState<{
    level: 'alto' | 'medio' | 'baixo';
    score: number;
    reason?: string;
  } | null>(null);
  const activeAIThreatRef = useRef<{
    level: 'alto' | 'medio' | 'baixo';
    score: number;
    reason?: string;
  } | null>(null);
  const activeSirenHandleRef = useRef<{ stop: () => void } | null>(null);

  useEffect(() => {
    activeAIThreatRef.current = activeAIThreat;
  }, [activeAIThreat]);

  // UI Controls & Recording Schedule Evaluation
  const [showPTZ, setShowPTZ] = useState<boolean>(false);
  const [clockString, setClockString] = useState<string>('');
  const [scheduleStatus, setScheduleStatus] = useState(() =>
    evaluateRecordingSchedule(camera.recordingSchedule)
  );

  // Clock OSD & Schedule Evaluation loop
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setClockString(
        now.toLocaleDateString('pt-BR', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
      setScheduleStatus(evaluateRecordingSchedule(camera.recordingSchedule, now));
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, [camera.recordingSchedule]);

  // Cleanup active siren on unmount
  useEffect(() => {
    return () => {
      if (activeSirenHandleRef.current) {
        activeSirenHandleRef.current.stop();
        activeSirenHandleRef.current = null;
      }
    };
  }, []);

  const toggleCameraSound = () => {
    const newSoundState = !isCameraSoundEnabled;
    onUpdateCamera({
      ...camera,
      soundAlarmEnabled: newSoundState,
    });

    if (!newSoundState && activeSirenHandleRef.current) {
      activeSirenHandleRef.current.stop();
      activeSirenHandleRef.current = null;
    } else if (newSoundState && activeAIThreat && activeAIThreat.level === 'alto' && soundEnabled) {
      if (!activeSirenHandleRef.current) {
        activeSirenHandleRef.current = playAIThreatAlarm();
      }
    }
  };

  const silenceAIThreat = () => {
    if (activeSirenHandleRef.current) {
      activeSirenHandleRef.current.stop();
      activeSirenHandleRef.current = null;
    }
    setActiveAIThreat(null);
    onDismissThreatAlert?.();
  };

  useEffect(() => {
    if (!soundEnabled && activeSirenHandleRef.current) {
      activeSirenHandleRef.current.stop();
      activeSirenHandleRef.current = null;
    }
  }, [soundEnabled]);

  const checkRtspReachability = useCallback(async () => {
    if (!camera.ipHost) return;
    setIsCheckingRtsp(true);
    try {
      const res = await probeSingleCameraIp(camera.ipHost, camera.ipPort || 554, []);
      setRtspStatus({
        checked: true,
        reachable: res.reachable,
        latencyMs: res.device?.latencyMs,
        message: res.message,
      });
    } catch (err: unknown) {
      setRtspStatus({
        checked: true,
        reachable: false,
        message: err instanceof Error ? err.message : 'Host RTSP inacessível',
      });
    } finally {
      setIsCheckingRtsp(false);
    }
  }, [camera.ipHost, camera.ipPort]);

  // Stop Recording
  const stopRecording = useCallback(() => {
    if (autoRecordTimerRef.current) {
      clearTimeout(autoRecordTimerRef.current);
      autoRecordTimerRef.current = null;
    }
    if (recordIntervalRef.current) {
      clearInterval(recordIntervalRef.current);
      recordIntervalRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    setIsRecording(false);
    setRecordDuration(0);
  }, []);

  // Capture current video frame as base64 JPEG
  const captureFrameSnapshot = useCallback((): string => {
    if (!videoRef.current || videoRef.current.readyState < 2) return '';
    try {
      const snapCanvas = document.createElement('canvas');
      snapCanvas.width = 320;
      snapCanvas.height = 180;
      const snapCtx = snapCanvas.getContext('2d');
      if (!snapCtx) return '';
      snapCtx.drawImage(videoRef.current, 0, 0, 320, 180);
      return snapCanvas.toDataURL('image/jpeg', 0.8);
    } catch {
      return '';
    }
  }, []);

  // Start Recording
  const startRecording = useCallback(
    (trigger: 'manual' | 'motion' = 'manual') => {
      if (isRecording) return;

      let streamToRecord: MediaStream | null = activeStream;

      if (!streamToRecord && videoRef.current && videoRef.current.readyState >= 2) {
        try {
          const streamFromVideo = (
            videoRef.current as unknown as { captureStream?: () => MediaStream }
          ).captureStream?.();
          if (streamFromVideo) {
            streamToRecord = streamFromVideo;
          }
        } catch {
          // Cross-origin or unsupported stream capture
        }
      }

      if (!streamToRecord) {
        if (trigger === 'manual') {
          setStreamError((prev) => prev || 'Sem fluxo de vídeo HTML5 ativo para gravar neste canal.');
        }
        return;
      }

      try {
        const mimeTypes = [
          'video/webm;codecs=vp9',
          'video/webm;codecs=vp8',
          'video/webm',
          'video/mp4',
        ];
        let selectedMime = '';
        for (const mime of mimeTypes) {
          if (MediaRecorder.isTypeSupported(mime)) {
            selectedMime = mime;
            break;
          }
        }

        const recorder = new MediaRecorder(streamToRecord, {
          mimeType: selectedMime || undefined,
        });

        recordedChunksRef.current = [];
        const thumbnailSnapshot = captureFrameSnapshot();
        const startTime = Date.now();
        recordingStartTimeRef.current = startTime;
        lastMarkerTimeRef.current = 0;
        recordingMotionMarkersRef.current =
          trigger === 'motion'
            ? [
                {
                  id: `mk-init-${startTime}`,
                  offsetSeconds: 0.5,
                  timestamp: startTime,
                  intensity: Math.max(50, motionScore || 65),
                  label:
                    activeAIThreatRef.current?.level === 'alto'
                      ? activeAIThreatRef.current.reason || 'Ameaça IA Detectada'
                      : 'Início do Movimento',
                  isCritical: activeAIThreatRef.current?.level === 'alto',
                },
              ]
            : [];

        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            recordedChunksRef.current.push(e.data);
          }
        };

        recorder.onstop = async () => {
          const chunks = recordedChunksRef.current;
          if (chunks.length === 0) return;

          const blob = new Blob(chunks, { type: selectedMime || 'video/webm' });
          const elapsedSec = Math.max(1, Math.round((Date.now() - startTime) / 1000));

          const isCriticalIncident = Boolean(
            activeAIThreatRef.current?.level === 'alto' ||
              (externalThreatAlert && externalThreatAlert.level === 'alto')
          );

          const threatScore = activeAIThreatRef.current?.score || externalThreatAlert?.score || 85;
          const threatReason =
            activeAIThreatRef.current?.reason ||
            externalThreatAlert?.reason ||
            'Detecção de evento crítico pela IA';

          const collectedMarkers = [...recordingMotionMarkersRef.current].filter(
            (m) => m.offsetSeconds <= elapsedSec
          );

          const recording: RecordingItem = {
            id: `rec-${Date.now()}`,
            tenantId: camera.tenantId || DEFAULT_UNIT_ID,
            cameraId: camera.id,
            cameraName: camera.name,
            cameraLocation: camera.location,
            timestamp: startTime,
            durationSeconds: elapsedSec,
            fileSizeBytes: blob.size,
            triggerType: trigger,
            blob,
            thumbnailDataUrl: thumbnailSnapshot,
            mimeType: selectedMime || 'video/webm',
            isCritical: isCriticalIncident,
            aiThreatLevel: isCriticalIncident ? 'alto' : undefined,
            aiThreatScore: isCriticalIncident ? threatScore : undefined,
            aiThreatReason: isCriticalIncident ? threatReason : undefined,
            aiAnalysisSummary: isCriticalIncident
              ? `Alerta Crítico IA (${threatScore}%): ${threatReason}`
              : latestAiTags?.summary,
            detectedObjects: latestAiTags?.detectedObjects,
            detectedElements: latestAiTags?.detectedElements,
            motionMarkers: collectedMarkers,
          };

          await saveRecordingToDB(recording);
          onRecordingSaved();

          if (soundEnabled && isCameraSoundEnabled) {
            playRecordBeep(false);
          }
        };

        recorder.start(1000);
        mediaRecorderRef.current = recorder;
        setIsRecording(true);
        setRecordTrigger(trigger);
        setRecordDuration(0);

        if (soundEnabled && isCameraSoundEnabled) {
          playRecordBeep(true);
        }

        recordIntervalRef.current = window.setInterval(() => {
          setRecordDuration((prev) => prev + 1);
        }, 1000);

        if (trigger === 'motion') {
          const autoDuration = (camera.autoRecordDuration || 10) * 1000;
          if (autoRecordTimerRef.current) clearTimeout(autoRecordTimerRef.current);
          autoRecordTimerRef.current = window.setTimeout(() => {
            stopRecording();
          }, autoDuration);
        }
      } catch (err: unknown) {
        const error = err as Error;
        setStreamError(`Falha ao iniciar gravação: ${error.message}`);
      }
    },
    [
      isRecording,
      activeStream,
      camera,
      captureFrameSnapshot,
      onRecordingSaved,
      soundEnabled,
      isCameraSoundEnabled,
      externalThreatAlert,
      latestAiTags,
      motionScore,
      stopRecording,
    ]
  );

  const triggerAIThreatAlert = useCallback(
    (score: number = 88, reason: string = 'Ameaça de intrusão detectada pela IA') => {
      const threatObj = { level: 'alto' as const, score, reason };
      setActiveAIThreat(threatObj);
      activeAIThreatRef.current = threatObj;

      if (camera.soundAlarmEnabled !== false && soundEnabled) {
        if (activeSirenHandleRef.current) {
          activeSirenHandleRef.current.stop();
        }
        activeSirenHandleRef.current = playAIThreatAlarm();
      }

      if (!isRecording) {
        startRecording('motion');
      } else if (recordingStartTimeRef.current > 0) {
        const offsetSec = Math.max(0, Math.round((Date.now() - recordingStartTimeRef.current) / 1000));
        recordingMotionMarkersRef.current.push({
          id: `mk-ai-${Date.now()}`,
          offsetSeconds: offsetSec,
          timestamp: Date.now(),
          intensity: score,
          label: reason,
          isCritical: true,
        });
      }

      sendHighThreatBrowserNotification({
        cameraName: camera.name,
        threatScore: score,
        reason,
        location: camera.location,
      });
    },
    [camera.soundAlarmEnabled, soundEnabled, isRecording, camera.name, camera.location, startRecording]
  );

  // Sync external high threat alert from AI analysis
  const lastAlertTimestampRef = useRef<number>(0);
  useEffect(() => {
    if (
      externalThreatAlert &&
      externalThreatAlert.level === 'alto' &&
      externalThreatAlert.timestamp !== lastAlertTimestampRef.current
    ) {
      lastAlertTimestampRef.current = externalThreatAlert.timestamp;
      triggerAIThreatAlert(externalThreatAlert.score, externalThreatAlert.reason);
    }
  }, [externalThreatAlert, triggerAIThreatAlert]);

  // Initialize camera stream (real sources only)
  useEffect(() => {
    let isCancelled = false;
    setIsLoadingStream(true);
    setStreamError(null);
    setRtspStatus(null);

    if (activeStreamRef.current) {
      activeStreamRef.current.getTracks().forEach((t) => t.stop());
      activeStreamRef.current = null;
      setActiveStream(null);
    }

    const setupStream = async () => {
      try {
        if (camera.type === 'webcam') {
          const constraints: MediaStreamConstraints = {
            video: camera.deviceId
              ? { deviceId: { exact: camera.deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
              : { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
            audio: camera.enableAudio,
          };

          const stream = await navigator.mediaDevices.getUserMedia(constraints);
          if (isCancelled) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }

          activeStreamRef.current = stream;
          setActiveStream(stream);
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch(() => {});
          }
          setIsLoadingStream(false);
        } else if (isBrowserPlayableUrl(camera.streamUrl)) {
          if (videoRef.current && camera.streamUrl) {
            videoRef.current.srcObject = null;
            videoRef.current.src = camera.streamUrl;
            videoRef.current.play().catch((err) => {
              if (!isCancelled) {
                setStreamError(`Erro ao conectar stream IP: ${err.message || 'Falha de rede'}`);
              }
            });
          }
          setIsLoadingStream(false);
        } else if (camera.type === 'commercial_ip' || camera.ipHost) {
          // Raw RTSP URLs cannot render natively in HTML5 <video> without WebRTC/HLS relay
          setIsLoadingStream(false);
          if (camera.ipHost) {
            checkRtspReachability();
          }
        } else {
          setStreamError('URL de transmissão não configurada');
          setIsLoadingStream(false);
        }
      } catch (err: unknown) {
        const error = err as Error;
        if (!isCancelled) {
          setStreamError(
            error.name === 'NotAllowedError'
              ? 'Permissão de câmera negada no navegador. Permita o acesso para visualizar.'
              : `Não foi possível iniciar câmera: ${error.message}`
          );
          setIsLoadingStream(false);
        }
      }
    };

    setupStream();

    return () => {
      isCancelled = true;
      if (activeStreamRef.current) {
        activeStreamRef.current.getTracks().forEach((track) => track.stop());
        activeStreamRef.current = null;
      }
    };
  }, [camera.type, camera.deviceId, camera.streamUrl, camera.enableAudio, camera.ipHost, checkRtspReachability]);

  // Motion Detection Analyzer loop
  useEffect(() => {
    if (!camera.motionDetectionEnabled) {
      setMotionScore(0);
      setIsMotionTriggered(false);
      return;
    }

    if (!motionDetectorRef.current) {
      motionDetectorRef.current = new MotionDetector();
    }

    const checkMotion = () => {
      if (!videoRef.current || videoRef.current.readyState < 2) return;

      const result = motionDetectorRef.current?.analyze(
        videoRef.current,
        camera.motionSensitivity
      );

      if (result) {
        setMotionScore(result.score);
        setIsMotionTriggered(result.isMotion);

        if (result.isMotion) {
          const now = Date.now();
          if (now - lastAlarmTimeRef.current > 4000) {
            lastAlarmTimeRef.current = now;
            if (soundEnabled && isCameraSoundEnabled) {
              playMotionAlarm();
            }

            const motionEvent: MotionEvent = {
              id: `evt-${Date.now()}`,
              tenantId: camera.tenantId || DEFAULT_UNIT_ID,
              cameraId: camera.id,
              cameraName: camera.name,
              timestamp: now,
              intensity: result.score,
            };
            saveEventToDB(motionEvent);
            onMotionEventLogged(motionEvent);
          }

          if (isRecording && recordingStartTimeRef.current > 0 && now - lastMarkerTimeRef.current > 1500) {
            lastMarkerTimeRef.current = now;
            const offsetSeconds = Math.max(0, Number(((now - recordingStartTimeRef.current) / 1000).toFixed(1)));
            recordingMotionMarkersRef.current.push({
              id: `mk-${now}`,
              offsetSeconds,
              timestamp: now,
              intensity: result.score,
              label: result.score >= 75 ? 'Movimento Intenso' : 'Movimento Detectado',
              isCritical: activeAIThreatRef.current?.level === 'alto',
            });
          }

          if (camera.autoRecordOnMotion && !isRecording && !scheduleStatus.isScheduledPause) {
            startRecording('motion');
          }
        }
      }
    };

    const intervalId = window.setInterval(checkMotion, 180);

    return () => {
      clearInterval(intervalId);
    };
  }, [
    camera.motionDetectionEnabled,
    camera.motionSensitivity,
    camera.autoRecordOnMotion,
    scheduleStatus.isScheduledPause,
    isRecording,
    soundEnabled,
    isCameraSoundEnabled,
    camera.tenantId,
    camera.id,
    camera.name,
    onMotionEventLogged,
    startRecording,
  ]);

  // Automatically pause active recording if scheduled pause window begins
  useEffect(() => {
    if (scheduleStatus.isScheduledPause && isRecording && recordTrigger === 'motion') {
      stopRecording();
    }
  }, [scheduleStatus.isScheduledPause, isRecording, recordTrigger, stopRecording]);

  const handleTakeSnapshot = () => {
    const dataUrl = captureFrameSnapshot();
    if (!dataUrl) return;

    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `foto_${camera.name.replace(/\s+/g, '_')}_${Date.now()}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const ptzTransform = `scale(${camera.digitalZoom || 1}) translate(${camera.pan || 0}px, ${-(camera.tilt || 0)}px)`;
  const isThreatAlarmActive = !!activeAIThreat && activeAIThreat.level === 'alto';
  const isRawRtspOnly =
    camera.type === 'commercial_ip' && !isBrowserPlayableUrl(camera.streamUrl);
  const canCaptureVideo = !streamError && !isRawRtspOnly && !isLoadingStream;

  return (
    <div
      ref={containerRef}
      className={`relative flex flex-col bg-neutral-950 rounded-xl overflow-hidden border transition-all ${
        isThreatAlarmActive
          ? 'border-red-500 shadow-[0_0_25px_rgba(239,68,68,0.5)] ring-2 ring-red-500/80'
          : isMotionTriggered
          ? 'border-amber-500/80 shadow-[0_0_15px_rgba(245,158,11,0.25)]'
          : isRecording
          ? 'border-red-500/80 shadow-[0_0_15px_rgba(239,68,68,0.25)]'
          : 'border-neutral-800 hover:border-neutral-700'
      } ${isFocused ? 'col-span-full row-span-2' : ''}`}
    >
      {/* Viewport Frame */}
      <div className="relative aspect-video w-full bg-black overflow-hidden flex items-center justify-center">
        {isLoadingStream && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-neutral-400 gap-2 z-10 bg-neutral-950">
            <div className="w-6 h-6 border-2 border-neutral-600 border-t-blue-500 rounded-full animate-spin" />
            <span className="text-xs">Conectando câmera...</span>
          </div>
        )}

        {/* Honest RTSP Endpoint Panel when stream requires HTTP/HLS/WebRTC relay */}
        {isRawRtspOnly && !streamError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-5 bg-neutral-950 z-10 space-y-2.5">
            <div
              className={`p-2.5 rounded-xl border ${
                rtspStatus?.reachable
                  ? 'bg-emerald-950/60 border-emerald-800 text-emerald-400'
                  : 'bg-neutral-900 border-neutral-800 text-neutral-400'
              }`}
            >
              <Wifi className="w-6 h-6" />
            </div>
            <div className="space-y-1 max-w-sm">
              <p className="text-xs font-semibold text-neutral-100">
                Câmera RTSP ({camera.ipHost}:{camera.ipPort || 554})
              </p>
              <p className="text-[11px] text-neutral-400 leading-relaxed">
                {isCheckingRtsp
                  ? 'Verificando conectividade TCP/RTSP com o dispositivo...'
                  : rtspStatus?.checked
                  ? rtspStatus.reachable
                    ? `Dispositivo acessível na rede (${rtspStatus.latencyMs ?? '-'}ms). Navegadores não reproduzem RTSP nativo diretamente — informe uma URL HTTP/HLS/MJPEG no gerenciador de câmeras caso utilize gateway de mídia.`
                    : rtspStatus.message
                  : 'Stream RTSP nativo requer gateway HTTP/HLS/WebRTC para exibição no navegador.'}
              </p>
            </div>
            {currentUserRole === 'admin' && camera.ipHost && (
              <button
                type="button"
                onClick={checkRtspReachability}
                disabled={isCheckingRtsp}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-[11px] text-neutral-200 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${isCheckingRtsp ? 'animate-spin' : ''}`} />
                <span>{isCheckingRtsp ? 'Testando...' : 'Testar Conexão TCP/RTSP'}</span>
              </button>
            )}
          </div>
        )}

        {/* Error state */}
        {streamError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4 bg-neutral-900 z-10">
            <VideoOff className="w-10 h-10 text-neutral-500 mb-2" />
            <p className="text-sm font-medium text-neutral-300 mb-1">{camera.name}</p>
            <p className="text-xs text-neutral-400 max-w-xs">{streamError}</p>
            {camera.type === 'webcam' && (
              <button
                onClick={() => {
                  setIsLoadingStream(true);
                  setStreamError(null);
                  navigator.mediaDevices
                    .getUserMedia({ video: true, audio: camera.enableAudio })
                    .then((s) => {
                      activeStreamRef.current = s;
                      setActiveStream(s);
                      if (videoRef.current) videoRef.current.srcObject = s;
                      setIsLoadingStream(false);
                    })
                    .catch((e) => {
                      setStreamError(e.message);
                      setIsLoadingStream(false);
                    });
                }}
                className="mt-3 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
              >
                Tentar Novamente
              </button>
            )}
          </div>
        )}

        {/* Video Screen */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-cover transition-transform duration-200 ${
            camera.nightVision
              ? 'filter grayscale contrast-150 brightness-90 hue-rotate-90'
              : ''
          }`}
          style={{ transform: ptzTransform }}
        />

        {/* Security OSD: Top Bar */}
        <div className="absolute top-0 inset-x-0 p-2.5 flex items-center justify-between bg-gradient-to-b from-black/80 via-black/40 to-transparent pointer-events-none z-20">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold text-xs text-neutral-100 tracking-wide drop-shadow-md truncate">
              {camera.name}
            </span>
            <span className="text-[11px] text-neutral-400">·</span>
            <span className="text-[11px] text-neutral-400 drop-shadow-md truncate">
              {camera.location}
            </span>
          </div>

          <div className="flex items-center gap-2 font-mono tabular-nums text-xs text-neutral-200 drop-shadow-md shrink-0">
            <span>{clockString}</span>
          </div>
        </div>

        {/* High Threat Emergency Banner */}
        {isThreatAlarmActive && (
          <div className="absolute top-10 inset-x-3 z-30 p-2.5 rounded-xl bg-red-950/95 border border-red-600 shadow-2xl flex items-center justify-between gap-2 backdrop-blur-md">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-red-400 shrink-0" />
              <div>
                <div className="font-bold text-[11px] text-red-100 uppercase tracking-wider flex items-center gap-1.5">
                  <span>AMEAÇA ALTA DETECTADA PELA IA</span>
                  <span className="font-mono text-[10px] px-1.5 py-0.2 bg-red-900 rounded border border-red-700">
                    {activeAIThreat.score}/100
                  </span>
                </div>
                <p className="text-[10px] text-red-200 truncate max-w-xs sm:max-w-md">
                  {isCameraSoundEnabled
                    ? 'Sirene de emergência tocando nesta câmera'
                    : 'Som silenciado individualmente nesta câmera'}
                  {activeAIThreat.reason ? ` · ${activeAIThreat.reason}` : ''}
                </p>
              </div>
            </div>

            <button
              onClick={silenceAIThreat}
              className="px-2.5 py-1 text-[11px] font-semibold bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors shrink-0 shadow"
            >
              Silenciar
            </button>
          </div>
        )}

        {/* Security OSD: Bottom Bar & Indicators */}
        <div className="absolute bottom-0 inset-x-0 p-2.5 flex items-center justify-between bg-gradient-to-t from-black/85 via-black/40 to-transparent pointer-events-none z-20">
          <div className="flex items-center gap-2.5">
            {isRecording ? (
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-red-600/90 text-white text-[11px] font-mono tabular-nums font-semibold tracking-wider">
                <Circle className="w-2 h-2 fill-current" />
                <span>REC {formatSeconds(recordDuration)}</span>
                <span className="text-[9px] uppercase opacity-80">({recordTrigger})</span>
              </div>
            ) : scheduleStatus.isScheduledPause ? (
              <div className="flex items-center gap-1 text-[11px] font-mono text-amber-400 drop-shadow-md">
                <PauseCircle className="w-3 h-3" />
                <span>GRAVAÇÃO PAUSADA (AGENDA)</span>
              </div>
            ) : isRawRtspOnly ? (
              <div className="flex items-center gap-1 text-[11px] font-mono text-neutral-300 drop-shadow-md">
                <span>{rtspStatus?.reachable ? 'RTSP ONLINE' : 'RTSP AGUARDANDO RELAY'}</span>
              </div>
            ) : (
              <div className="flex items-center gap-1 text-[11px] font-mono text-emerald-400 drop-shadow-md">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>AO VIVO</span>
              </div>
            )}

            {camera.recordingSchedule?.enabled && !scheduleStatus.isScheduledPause && (
              <div className="flex items-center gap-1 text-[10px] font-mono text-cyan-300 drop-shadow-md">
                <CalendarClock className="w-3 h-3 text-cyan-400" />
                <span className="hidden sm:inline">AGENDADA</span>
              </div>
            )}

            <div className="flex items-center gap-1 text-[10px] font-mono drop-shadow-md">
              {isCameraSoundEnabled ? (
                <span className="text-blue-300 flex items-center gap-1">
                  <Volume2 className="w-3 h-3 text-blue-400" />
                  <span className="hidden sm:inline">SOM ATIVO</span>
                </span>
              ) : (
                <span className="text-neutral-400 flex items-center gap-1">
                  <VolumeX className="w-3 h-3 text-neutral-400" />
                  <span className="hidden sm:inline">MUDO</span>
                </span>
              )}
            </div>

            {camera.nightVision && (
              <div className="flex items-center gap-1 text-[10px] font-mono text-emerald-300 drop-shadow-md">
                <Moon className="w-3 h-3" />
                <span>IR</span>
              </div>
            )}
          </div>

          {camera.motionDetectionEnabled && canCaptureVideo && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-neutral-400 font-mono">SENSOR</span>
              <div className="w-16 h-1.5 bg-neutral-800/80 rounded-full overflow-hidden border border-neutral-700">
                <div
                  className={`h-full transition-all duration-150 ${
                    isMotionTriggered
                      ? 'bg-amber-400'
                      : motionScore > 20
                      ? 'bg-yellow-500'
                      : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min(100, motionScore)}%` }}
                />
              </div>
              {isMotionTriggered && (
                <span className="text-[10px] text-amber-400 font-bold">MOVIMENTO</span>
              )}
            </div>
          )}
        </div>

        {/* PTZ Floating Overlay Menu */}
        {showPTZ && (
          <div className="absolute right-3 top-10 z-30">
            <PTZControls
              zoom={camera.digitalZoom || 1}
              pan={camera.pan || 0}
              tilt={camera.tilt || 0}
              onChange={(update) => onUpdateCamera({ ...camera, ...update })}
              onReset={() => onUpdateCamera({ ...camera, digitalZoom: 1, pan: 0, tilt: 0 })}
            />
          </div>
        )}
      </div>

      {/* Control Action Toolbar */}
      <div className="p-2.5 bg-neutral-900 border-t border-neutral-800 flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          {isRecording ? (
            <button
              onClick={stopRecording}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-medium transition-colors whitespace-nowrap shrink-0"
              title="Interromper gravação e salvar"
            >
              <Circle className="w-3.5 h-3.5 fill-current" />
              <span>Parar e Salvar</span>
            </button>
          ) : (
            <button
              onClick={() => startRecording('manual')}
              disabled={!canCaptureVideo}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed text-neutral-200 hover:text-white font-medium transition-colors border border-neutral-700 whitespace-nowrap shrink-0"
              title="Gravar vídeo desta câmera"
            >
              <Circle className="w-3 h-3 text-red-500 fill-red-500" />
              <span>Gravar</span>
            </button>
          )}

          <button
            onClick={handleTakeSnapshot}
            disabled={!canCaptureVideo}
            className="p-1.5 rounded-lg bg-neutral-800/80 hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed text-neutral-300 hover:text-white transition-colors border border-neutral-700/60"
            title="Capturar foto instantânea"
          >
            <Camera className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={toggleCameraSound}
            className={`flex items-center gap-1 px-2 py-1.5 rounded-lg transition-colors border whitespace-nowrap shrink-0 ${
              isCameraSoundEnabled
                ? 'bg-blue-950/80 text-blue-300 border-blue-700 hover:bg-blue-900'
                : 'bg-neutral-800/80 text-neutral-400 border-neutral-700/60 hover:text-neutral-200'
            }`}
            title={
              isCameraSoundEnabled
                ? 'Alarme sonoro desta câmera: ATIVADO'
                : 'Alarme sonoro desta câmera: SILENCIADO'
            }
          >
            {isCameraSoundEnabled ? (
              <>
                <Volume2 className="w-3.5 h-3.5 text-blue-400" />
                <span className="hidden sm:inline text-[11px]">Som On</span>
              </>
            ) : (
              <>
                <VolumeX className="w-3.5 h-3.5 text-neutral-400" />
                <span className="hidden sm:inline text-[11px]">Mudo</span>
              </>
            )}
          </button>

          {onAnalyzeAI && (
            <button
              onClick={() => {
                const frame = captureFrameSnapshot();
                if (frame) onAnalyzeAI(camera, frame);
              }}
              disabled={!canCaptureVideo}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-purple-950/80 hover:bg-purple-900 disabled:opacity-40 disabled:cursor-not-allowed text-purple-300 font-medium transition-colors border border-purple-800/80 shadow whitespace-nowrap shrink-0"
              title="Auditar segurança deste frame com IA"
            >
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              <span className="hidden sm:inline">Auditoria IA</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onUpdateCamera({ ...camera, nightVision: !camera.nightVision })}
            className={`p-1.5 rounded-lg transition-colors border ${
              camera.nightVision
                ? 'bg-emerald-950 text-emerald-300 border-emerald-600'
                : 'bg-neutral-800/80 hover:bg-neutral-700 text-neutral-300 border-neutral-700/60'
            }`}
            title={camera.nightVision ? 'Desativar Visão Noturna IR' : 'Ativar Visão Noturna IR'}
          >
            {camera.nightVision ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          </button>

          <button
            onClick={() => setShowPTZ(!showPTZ)}
            className={`p-1.5 rounded-lg transition-colors border ${
              showPTZ
                ? 'bg-blue-950 text-blue-300 border-blue-600'
                : 'bg-neutral-800/80 hover:bg-neutral-700 text-neutral-300 border-neutral-700/60'
            }`}
            title="Ajustar Zoom Digital e Pan/Tilt"
          >
            <Sliders className="w-3.5 h-3.5" />
          </button>

          {onToggleFocus && (
            <button
              onClick={onToggleFocus}
              className="p-1.5 rounded-lg bg-neutral-800/80 hover:bg-neutral-700 text-neutral-300 hover:text-white transition-colors border border-neutral-700/60"
              title={isFocused ? 'Minimizar enquadramento' : 'Expandir câmera na tela'}
            >
              {isFocused ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
