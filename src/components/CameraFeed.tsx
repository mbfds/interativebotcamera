import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Circle,
  Camera,
  Maximize2,
  Minimize2,
  Moon,
  Sun,
  Activity,
  Sliders,
  AlertCircle,
  VideoOff,
  Sparkles,
  Volume2,
  VolumeX,
  ShieldAlert,
  BellOff,
  BellRing,
} from 'lucide-react';
import { CameraConfig, MotionEvent, RecordingItem } from '../types/camera';
import { MotionDetector } from '../utils/motionDetector';
import { StreamSimulator } from '../utils/streamSimulator';
import { saveRecordingToDB, saveEventToDB } from '../services/db';
import { playMotionAlarm, playRecordBeep, playAIThreatAlarm } from '../utils/soundAlert';
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
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const simulatorRef = useRef<StreamSimulator | null>(null);
  const motionDetectorRef = useRef<MotionDetector | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const autoRecordTimerRef = useRef<number | null>(null);

  // Per-camera sound configuration
  const isCameraSoundEnabled = camera.soundAlarmEnabled !== false;

  // Stream state
  const [activeStream, setActiveStream] = useState<MediaStream | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [isLoadingStream, setIsLoadingStream] = useState<boolean>(true);

  // Recording state
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordDuration, setRecordDuration] = useState<number>(0);
  const [recordTrigger, setRecordTrigger] = useState<'manual' | 'motion'>('manual');
  const recordIntervalRef = useRef<number | null>(null);

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

  // UI Controls
  const [showPTZ, setShowPTZ] = useState<boolean>(false);
  const [clockString, setClockString] = useState<string>('');

  // Clock OSD
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
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  // Cleanup active siren on unmount
  useEffect(() => {
    return () => {
      if (activeSirenHandleRef.current) {
        activeSirenHandleRef.current.stop();
        activeSirenHandleRef.current = null;
      }
    };
  }, []);

  // Toggle individual camera sound alert setting
  const toggleCameraSound = () => {
    const newSoundState = !isCameraSoundEnabled;
    onUpdateCamera({
      ...camera,
      soundAlarmEnabled: newSoundState,
    });

    // If camera was muted while siren was sounding, stop siren immediately
    if (!newSoundState && activeSirenHandleRef.current) {
      activeSirenHandleRef.current.stop();
      activeSirenHandleRef.current = null;
    } else if (newSoundState && activeAIThreat && activeAIThreat.level === 'alto' && soundEnabled) {
      // If camera unmuted while high threat is active, resume emergency siren
      if (!activeSirenHandleRef.current) {
        activeSirenHandleRef.current = playAIThreatAlarm();
      }
    }
  };

  // Silence currently active AI Threat Alarm
  const silenceAIThreat = () => {
    if (activeSirenHandleRef.current) {
      activeSirenHandleRef.current.stop();
      activeSirenHandleRef.current = null;
    }
    setActiveAIThreat(null);
    onDismissThreatAlert?.();
  };

  // Stop siren if global sound toggle is turned off
  useEffect(() => {
    if (!soundEnabled && activeSirenHandleRef.current) {
      activeSirenHandleRef.current.stop();
      activeSirenHandleRef.current = null;
    }
  }, [soundEnabled]);

  // Trigger AI High Threat Alert
  const triggerAIThreatAlert = useCallback(
    (score: number = 88, reason: string = 'Ameaça de intrusão / violação detectada pela IA') => {
      const threatObj = { level: 'alto' as const, score, reason };
      setActiveAIThreat(threatObj);
      activeAIThreatRef.current = threatObj;

      // Play emergency siren ONLY IF:
      // 1. This specific camera has sound enabled (soundAlarmEnabled !== false)
      // 2. The global sound setting is enabled
      if (camera.soundAlarmEnabled !== false && soundEnabled) {
        if (activeSirenHandleRef.current) {
          activeSirenHandleRef.current.stop();
        }
        activeSirenHandleRef.current = playAIThreatAlarm();
      }

      // Auto start recording high threat incident
      if (!isRecording) {
        startRecording('motion');
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [camera.soundAlarmEnabled, soundEnabled, isRecording]
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

  // Initialize camera stream
  useEffect(() => {
    let isCancelled = false;
    setIsLoadingStream(true);
    setStreamError(null);

    const setupStream = async () => {
      try {
        if (camera.type === 'webcam') {
          // Request user webcam
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

          setActiveStream(stream);
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch(() => {});
          }
          setIsLoadingStream(false);
        } else if (camera.type === 'simulated' || camera.type === 'commercial_ip') {
          // Simulated CCTV feed or commercial camera stream simulation
          const simulator = new StreamSimulator(camera.simulationPreset || 'entrance');
          simulatorRef.current = simulator;
          const stream = simulator.getStream();

          if (isCancelled) {
            simulator.destroy();
            return;
          }

          setActiveStream(stream);
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch(() => {});
          }
          setIsLoadingStream(false);
        } else if (camera.type === 'ip_stream') {
          // IP / HLS / MJPEG camera stream
          if (!camera.streamUrl) {
            setStreamError('URL do stream IP não configurada');
            setIsLoadingStream(false);
            return;
          }
          if (videoRef.current) {
            videoRef.current.src = camera.streamUrl;
            videoRef.current.play().catch((err) => {
              setStreamError(`Erro ao conectar stream IP: ${err.message || 'Falha de rede'}`);
            });
          }
          setIsLoadingStream(false);
        }
      } catch (err: unknown) {
        const error = err as Error;
        if (!isCancelled) {
          setStreamError(
            error.name === 'NotAllowedError'
              ? 'Permissão de câmera negada no navegador. Permita o acesso à câmera para visualizar.'
              : `Não foi possível iniciar câmera: ${error.message}`
          );
          setIsLoadingStream(false);
        }
      }
    };

    setupStream();

    return () => {
      isCancelled = true;
      if (simulatorRef.current) {
        simulatorRef.current.destroy();
        simulatorRef.current = null;
      }
      if (activeStream) {
        activeStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [camera.type, camera.deviceId, camera.streamUrl, camera.simulationPreset, camera.enableAudio]);

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

    let intervalId: number;

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
          // Rate-limit sound alarm to once every 4 seconds
          if (now - lastAlarmTimeRef.current > 4000) {
            lastAlarmTimeRef.current = now;
            // Respect individual camera sound alert setting
            if (soundEnabled && isCameraSoundEnabled) {
              playMotionAlarm();
            }

            // Log event
            const motionEvent: MotionEvent = {
              id: `evt-${Date.now()}`,
              tenantId: camera.tenantId || 'biz-demo-1',
              cameraId: camera.id,
              cameraName: camera.name,
              timestamp: now,
              intensity: result.score,
            };
            saveEventToDB(motionEvent);
            onMotionEventLogged(motionEvent);
          }

          // Trigger Auto-record if enabled and not currently recording
          if (camera.autoRecordOnMotion && !isRecording) {
            startRecording('motion');
          }
        }
      }
    };

    intervalId = window.setInterval(checkMotion, 180);

    return () => {
      clearInterval(intervalId);
    };
  }, [
    camera.motionDetectionEnabled,
    camera.motionSensitivity,
    camera.autoRecordOnMotion,
    isRecording,
    soundEnabled,
    isCameraSoundEnabled,
    camera.tenantId,
    camera.id,
    camera.name,
    onMotionEventLogged,
  ]);

  // Capture current video frame as base64 JPEG
  const captureFrameSnapshot = useCallback((): string => {
    if (!videoRef.current) return '';
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
  const startRecording = useCallback((trigger: 'manual' | 'motion' = 'manual') => {
    if (isRecording) return;

    let streamToRecord: MediaStream | null = activeStream;

    // Fallback: capture stream from canvas if video element is playing but no activeStream
    if (!streamToRecord && videoRef.current) {
      try {
        const streamFromVideo = (videoRef.current as unknown as { captureStream?: () => MediaStream }).captureStream?.();
        if (streamFromVideo) {
          streamToRecord = streamFromVideo;
        }
      } catch {
        // Fallback capture failed
      }
    }

    if (!streamToRecord) {
      alert('Não há fluxo de vídeo disponível para gravar nesta câmera.');
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

        const recording: RecordingItem = {
          id: `rec-${Date.now()}`,
          tenantId: camera.tenantId || 'biz-demo-1',
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
            : undefined,
        };

        await saveRecordingToDB(recording);
        onRecordingSaved();

        if (soundEnabled && isCameraSoundEnabled) {
          playRecordBeep(false);
        }
      };

      recorder.start(1000); // 1s slice
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordTrigger(trigger);
      setRecordDuration(0);

      if (soundEnabled && isCameraSoundEnabled) {
        playRecordBeep(true);
      }

      // Elapsed timer
      recordIntervalRef.current = window.setInterval(() => {
        setRecordDuration((prev) => prev + 1);
      }, 1000);

      // Auto stop if triggered by motion
      if (trigger === 'motion') {
        const autoDuration = (camera.autoRecordDuration || 10) * 1000;
        if (autoRecordTimerRef.current) clearTimeout(autoRecordTimerRef.current);
        autoRecordTimerRef.current = window.setTimeout(() => {
          stopRecording();
        }, autoDuration);
      }
    } catch (err: unknown) {
      const error = err as Error;
      alert(`Falha ao iniciar gravação: ${error.message}`);
    }
  }, [isRecording, activeStream, camera, captureFrameSnapshot, onRecordingSaved, soundEnabled, isCameraSoundEnabled]);

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

  // Take Instant Snapshot photo and download
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

  // Test motion trigger for simulated feeds
  const handleSimulateMotion = () => {
    if (simulatorRef.current) {
      simulatorRef.current.triggerMotion(4500);
    }
  };

  // Format record duration mm:ss
  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // PTZ Transform
  const ptzTransform = `scale(${camera.digitalZoom || 1}) translate(${camera.pan || 0}px, ${-(camera.tilt || 0)}px)`;

  const isThreatAlarmActive = !!activeAIThreat && activeAIThreat.level === 'alto';

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
        {/* Loading state */}
        {isLoadingStream && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-neutral-400 gap-2 z-10 bg-neutral-950">
            <div className="w-6 h-6 border-2 border-neutral-600 border-t-blue-500 rounded-full animate-spin" />
            <span className="text-xs">Conectando câmera...</span>
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
          <div className="flex items-center gap-2">
            <span className="font-semibold text-xs text-neutral-100 tracking-wide drop-shadow-md">
              {camera.name}
            </span>
            {camera.brand && (
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-blue-950/80 border border-blue-700/60 text-blue-300">
                {camera.brand}
              </span>
            )}
            <span className="text-[11px] text-neutral-400">·</span>
            <span className="text-[11px] text-neutral-400 drop-shadow-md">
              {camera.location}
            </span>
          </div>

          <div className="flex items-center gap-2 font-mono tabular-nums text-xs text-neutral-200 drop-shadow-md">
            <span>{clockString}</span>
          </div>
        </div>

        {/* High Threat Emergency Banner (When AI identifies threat) */}
        {isThreatAlarmActive && (
          <div className="absolute top-10 inset-x-3 z-30 p-2.5 rounded-xl bg-red-950/95 border border-red-600 shadow-2xl flex items-center justify-between gap-2 backdrop-blur-md animate-pulse">
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
            {/* Recording Indicator */}
            {isRecording ? (
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-red-600/90 text-white text-[11px] font-mono tabular-nums font-semibold tracking-wider animate-pulse">
                <Circle className="w-2 h-2 fill-current" />
                <span>REC {formatSeconds(recordDuration)}</span>
                <span className="text-[9px] uppercase opacity-80">({recordTrigger})</span>
              </div>
            ) : (
              <div className="flex items-center gap-1 text-[11px] font-mono text-emerald-400 drop-shadow-md">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>AO VIVO</span>
              </div>
            )}

            {/* Individual Camera Sound Status Badge */}
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

            {/* Night vision badge */}
            {camera.nightVision && (
              <div className="flex items-center gap-1 text-[10px] font-mono text-emerald-300 drop-shadow-md">
                <Moon className="w-3 h-3" />
                <span>IR</span>
              </div>
            )}
          </div>

          {/* Motion Activity Indicator */}
          {camera.motionDetectionEnabled && (
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
                <span className="text-[10px] text-amber-400 font-bold animate-pulse">
                  MOVIMENTO!
                </span>
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
        {/* Left Actions: Record, Snapshot, Individual Sound Toggle, and AI Audit */}
        <div className="flex items-center gap-2">
          {isRecording ? (
            <button
              onClick={stopRecording}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-medium transition-colors"
              title="Interromper gravação e salvar"
            >
              <Circle className="w-3.5 h-3.5 fill-current" />
              <span>Parar e Salvar</span>
            </button>
          ) : (
            <button
              onClick={() => startRecording('manual')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 hover:text-white font-medium transition-colors border border-neutral-700"
              title="Gravar vídeo desta câmera no site"
            >
              <Circle className="w-3 h-3 text-red-500 fill-red-500" />
              <span>Gravar</span>
            </button>
          )}

          <button
            onClick={handleTakeSnapshot}
            className="p-1.5 rounded-lg bg-neutral-800/80 hover:bg-neutral-700 text-neutral-300 hover:text-white transition-colors border border-neutral-700/60"
            title="Capturar foto instantânea (Snapshot)"
          >
            <Camera className="w-3.5 h-3.5" />
          </button>

          {/* Individual Camera Sound Alert Toggle Button */}
          <button
            onClick={toggleCameraSound}
            className={`flex items-center gap-1 px-2 py-1.5 rounded-lg transition-colors border ${
              isCameraSoundEnabled
                ? 'bg-blue-950/80 text-blue-300 border-blue-700 hover:bg-blue-900'
                : 'bg-neutral-800/80 text-neutral-400 border-neutral-700/60 hover:text-neutral-200'
            }`}
            title={
              isCameraSoundEnabled
                ? 'Alarme sonoro desta câmera: ATIVADO (Emitirá sirene se a IA detectar Ameaça Alta)'
                : 'Alarme sonoro desta câmera: SILENCIADO (Não emitirá som nesta câmera)'
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

          {/* AI Audit Action */}
          {onAnalyzeAI && (
            <button
              onClick={() => {
                const frame = captureFrameSnapshot();
                if (frame) onAnalyzeAI(camera, frame);
              }}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-purple-950/80 hover:bg-purple-900 text-purple-300 font-medium transition-colors border border-purple-800/80 shadow"
              title="Auditar segurança deste frame com IA (Gemini)"
            >
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              <span className="hidden sm:inline">Auditoria IA</span>
            </button>
          )}
        </div>

        {/* Right Actions: Test Threat Alert, Night Vision, PTZ, Focus */}
        <div className="flex items-center gap-1.5">
          {/* Test High Threat Alert Button */}
          <button
            onClick={() => triggerAIThreatAlert(92, 'Teste de invasão suspeita no caixa')}
            className="flex items-center gap-1 px-2 py-1 rounded bg-neutral-800/80 hover:bg-red-950/60 hover:text-red-300 text-neutral-400 text-[11px] border border-neutral-700/60 transition-colors"
            title="Testar sirene de Ameaça Alta da IA nesta câmera"
          >
            <ShieldAlert className="w-3 h-3 text-red-400" />
            <span className="hidden sm:inline">Testar Ameaça IA</span>
          </button>

          {/* Simulated motion button for simulated feeds */}
          {camera.type === 'simulated' && (
            <button
              onClick={handleSimulateMotion}
              className="flex items-center gap-1 px-2 py-1 rounded bg-neutral-800/80 hover:bg-neutral-700 text-amber-300 text-[11px] border border-neutral-700/60"
              title="Testar sensor: Simular pessoa/carro passando na câmera"
            >
              <Activity className="w-3 h-3 text-amber-400" />
              <span className="hidden sm:inline">Movimento</span>
            </button>
          )}

          {/* Night Vision Toggle */}
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

          {/* PTZ Zoom/Pan Toggle */}
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

          {/* Focus / Maximize */}
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
