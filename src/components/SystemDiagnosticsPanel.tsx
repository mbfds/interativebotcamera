import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Activity,
  Cpu,
  HardDrive,
  Wifi,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Zap,
  TrendingUp,
  Download,
  AlertCircle,
  Info,
  Play,
  Pause,
} from 'lucide-react';
import { CameraConfig, CameraStreamTelemetry, SystemBottleneckAlert, UserRole } from '../types/camera';
import { probeSingleCameraIp } from '../utils/networkDiscovery';

interface SystemDiagnosticsPanelProps {
  cameras: CameraConfig[];
  onClose?: () => void;
  isCompactMode?: boolean;
  onUpdateCamera?: (camera: CameraConfig) => void;
  currentUserRole?: UserRole;
}

interface PerformanceMemory {
  usedJSHeapSize?: number;
  totalJSHeapSize?: number;
}

export const SystemDiagnosticsPanel: React.FC<SystemDiagnosticsPanelProps> = ({
  cameras,
  onClose,
  onUpdateCamera,
  currentUserRole = 'admin',
}) => {
  const [filterMode, setFilterMode] = useState<'all' | 'bottleneck' | 'high_latency' | 'high_cpu'>('all');
  const [refreshInterval, setRefreshInterval] = useState<number>(3000);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [optimizingCameraId, setOptimizingCameraId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [activeAlertsDismissed, setActiveAlertsDismissed] = useState<Record<string, boolean>>({});

  const [telemetryData, setTelemetryData] = useState<Record<string, CameraStreamTelemetry>>({});
  const historyMapRef = useRef<Record<string, number[]>>({});
  const lastProbeMapRef = useRef<Record<string, { latencyMs: number; reachable: boolean }>>({});

  // Measure real network TCP latency for IP cameras and real browser resource footprint
  useEffect(() => {
    let cancelled = false;

    const sampleMetrics = async () => {
      if (isPaused || cameras.length === 0) return;

      const now = Date.now();
      const perfMem = (performance as unknown as { memory?: PerformanceMemory }).memory;
      const heapMb = perfMem?.usedJSHeapSize
        ? Math.round(perfMem.usedJSHeapSize / (1024 * 1024))
        : 48;
      const perCameraRam = Math.max(18, Math.round(heapMb / Math.max(1, cameras.length)));

      // Probe IP cameras in parallel for real TCP RTT
      await Promise.all(
        cameras.map(async (cam) => {
          if (cam.ipHost) {
            try {
              const probe = await probeSingleCameraIp(cam.ipHost, cam.ipPort || 554, []);
              lastProbeMapRef.current[cam.id] = {
                reachable: probe.reachable,
                latencyMs: probe.device?.latencyMs ?? (probe.reachable ? 15 : 999),
              };
            } catch {
              lastProbeMapRef.current[cam.id] = { reachable: false, latencyMs: 999 };
            }
          }
        })
      );

      if (cancelled) return;

      const updated: Record<string, CameraStreamTelemetry> = {};

      cameras.forEach((cam) => {
        const resolution = cam.resolution || '1080p';
        const targetFps = cam.fps || 30;
        const probeInfo = lastProbeMapRef.current[cam.id];

        const currentLatency =
          cam.type === 'webcam'
            ? 2
            : probeInfo
            ? probeInfo.latencyMs
            : 0;

        const isUnreachableIp = Boolean(cam.ipHost && probeInfo && !probeInfo.reachable);

        const baseCpu =
          cam.type === 'webcam'
            ? resolution === '1080p'
              ? 4.8
              : 3.1
            : isUnreachableIp
            ? 0.4
            : resolution === '1080p'
            ? 5.6
            : 3.4;

        const baseBitrate =
          isUnreachableIp
            ? 0
            : resolution === '1080p'
            ? 2400
            : resolution === '720p'
            ? 1400
            : 700;

        const prevHist = historyMapRef.current[cam.id] || [];
        const hist = [...prevHist, currentLatency].slice(-12);
        historyMapRef.current[cam.id] = hist;

        const jitterMs =
          hist.length >= 2
            ? Math.round(
                hist.slice(1).reduce((acc, v, i) => acc + Math.abs(v - hist[i]), 0) /
                  (hist.length - 1)
              )
            : 0;

        let status: 'optimal' | 'moderate' | 'bottleneck' = 'optimal';
        let bottleneckType: 'none' | 'network_latency' | 'cpu_overload' | 'memory_pressure' | 'packet_loss' =
          'none';
        let bottleneckMessage =
          cam.type === 'webcam'
            ? 'Dispositivo local conectado com baixa latência'
            : isUnreachableIp
            ? 'Sem resposta TCP/RTSP do endereço IP'
            : 'Conectividade RTSP estável';

        if (isUnreachableIp) {
          status = 'bottleneck';
          bottleneckType = 'packet_loss';
          bottleneckMessage = `Host ${cam.ipHost}:${cam.ipPort || 554} inacessível na rede.`;
        } else if (currentLatency > 90) {
          status = 'bottleneck';
          bottleneckType = 'network_latency';
          bottleneckMessage = 'Latência de rede elevada (>90ms). Verifique enlace Wi-Fi/switch.';
        } else if (baseCpu > 22.0) {
          status = 'bottleneck';
          bottleneckType = 'cpu_overload';
          bottleneckMessage = 'Carga de decodificação elevada.';
        } else if (perCameraRam > 160) {
          status = 'bottleneck';
          bottleneckType = 'memory_pressure';
          bottleneckMessage = 'Uso elevado de memória no navegador.';
        } else if (currentLatency > 45) {
          status = 'moderate';
          bottleneckMessage = 'Latência moderada na rede local.';
        }

        updated[cam.id] = {
          cameraId: cam.id,
          cameraName: cam.name,
          location: cam.location,
          latencyMs: currentLatency,
          cpuPercent: Number(baseCpu.toFixed(1)),
          ramMb: perCameraRam,
          bitrateKbps: baseBitrate,
          fps: isUnreachableIp ? 0 : targetFps,
          targetFps,
          packetLossPercent: isUnreachableIp ? 100 : 0,
          jitterMs,
          status,
          bottleneckType,
          bottleneckMessage,
          pingHistory: hist,
          lastUpdated: now,
        };
      });

      setTelemetryData(updated);
    };

    sampleMetrics();
    const interval = setInterval(sampleMetrics, refreshInterval);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [cameras, refreshInterval, isPaused]);

  const systemSummary = useMemo(() => {
    const list = Object.values(telemetryData);
    if (list.length === 0) {
      return {
        avgLatency: 0,
        totalCpu: 0,
        totalRam: 0,
        totalBitrateMbps: 0,
        bottlenecksCount: 0,
        activeCamerasCount: 0,
        systemHealth: 'optimal' as const,
      };
    }

    const reachableList = list.filter((item) => item.latencyMs < 999);
    const avgLatency =
      reachableList.length > 0
        ? Math.round(reachableList.reduce((acc, curr) => acc + curr.latencyMs, 0) / reachableList.length)
        : 0;
    const totalCpu = Number(list.reduce((acc, curr) => acc + curr.cpuPercent, 0).toFixed(1));
    const totalRam = list.reduce((acc, curr) => acc + curr.ramMb, 0);
    const totalBitrateMbps = Number(
      (list.reduce((acc, curr) => acc + curr.bitrateKbps, 0) / 1000).toFixed(2)
    );
    const bottlenecksCount = list.filter((item) => item.status === 'bottleneck').length;

    let systemHealth: 'optimal' | 'moderate' | 'critical' = 'optimal';
    if (bottlenecksCount > 0 || totalCpu > 60 || avgLatency > 75) {
      systemHealth = 'critical';
    } else if (avgLatency > 40 || totalCpu > 35) {
      systemHealth = 'moderate';
    }

    return {
      avgLatency,
      totalCpu,
      totalRam,
      totalBitrateMbps,
      bottlenecksCount,
      activeCamerasCount: list.length,
      systemHealth,
    };
  }, [telemetryData]);

  const filteredTelemetries = useMemo(() => {
    const list = Object.values(telemetryData);
    if (filterMode === 'bottleneck') {
      return list.filter((t) => t.status === 'bottleneck');
    }
    if (filterMode === 'high_latency') {
      return [...list].sort((a, b) => b.latencyMs - a.latencyMs);
    }
    if (filterMode === 'high_cpu') {
      return [...list].sort((a, b) => b.cpuPercent - a.cpuPercent);
    }
    return list;
  }, [telemetryData, filterMode]);

  const activeAlerts: SystemBottleneckAlert[] = useMemo(() => {
    return Object.values(telemetryData)
      .filter((t) => t.status === 'bottleneck' && !activeAlertsDismissed[t.cameraId])
      .map((t) => ({
        id: `alert-${t.cameraId}-${t.bottleneckType}`,
        cameraId: t.cameraId,
        cameraName: t.cameraName,
        severity: t.latencyMs > 110 || t.packetLossPercent > 0 ? 'critical' : 'warning',
        title:
          t.bottleneckType === 'network_latency'
            ? 'Latência de Rede Elevada'
            : t.bottleneckType === 'cpu_overload'
            ? 'Sobrecarga de CPU no Feed'
            : t.bottleneckType === 'packet_loss'
            ? 'Câmera Inacessível na Rede'
            : 'Pressão de Memória no Navegador',
        description: t.bottleneckMessage || 'Degradação detectada no enlace da câmera.',
        metric:
          t.bottleneckType === 'network_latency'
            ? 'latency'
            : t.bottleneckType === 'cpu_overload'
            ? 'cpu'
            : t.bottleneckType === 'packet_loss'
            ? 'packets'
            : 'ram',
        value:
          t.bottleneckType === 'network_latency'
            ? `${t.latencyMs} ms`
            : t.bottleneckType === 'cpu_overload'
            ? `${t.cpuPercent}%`
            : t.bottleneckType === 'packet_loss'
            ? 'Offline'
            : `${t.ramMb} MB`,
        recommendation:
          t.bottleneckType === 'packet_loss'
            ? 'Verifique alimentação elétrica, cabo de rede ou porta RTSP do equipamento.'
            : t.bottleneckType === 'network_latency'
            ? 'Reduzir resolução do sub-stream para 720p ou verificar sinal Wi-Fi.'
            : 'Ajustar FPS para 15 quadros/seg para aliviar decodificação.',
        timestamp: t.lastUpdated,
      }));
  }, [telemetryData, activeAlertsDismissed]);

  const handleOptimizeCamera = (cameraId: string) => {
    setOptimizingCameraId(cameraId);
    const targetCam = cameras.find((c) => c.id === cameraId);
    if (targetCam && onUpdateCamera) {
      onUpdateCamera({
        ...targetCam,
        resolution: '720p',
        fps: 15,
      });
    }
    setTimeout(() => setOptimizingCameraId(null), 500);
  };

  const handleExportDiagnostics = () => {
    setIsExporting(true);
    try {
      const exportPayload = {
        exportedAt: new Date().toISOString(),
        systemSummary,
        camerasCount: cameras.length,
        telemetry: Object.values(telemetryData),
        alerts: activeAlerts,
      };

      const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sentinela-diagnostico-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setTimeout(() => setIsExporting(false), 600);
    }
  };

  return (
    <div className="bg-neutral-900/90 border border-neutral-800 rounded-2xl p-4 sm:p-5 shadow-2xl backdrop-blur-md space-y-4 transition-all">
      {/* Top Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-neutral-800">
        <div className="flex items-center gap-3">
          <div
            className={`p-2.5 rounded-xl border flex items-center justify-center ${
              systemSummary.systemHealth === 'critical'
                ? 'bg-rose-950/80 border-rose-800 text-rose-400'
                : systemSummary.systemHealth === 'moderate'
                ? 'bg-amber-950/80 border-amber-800 text-amber-400'
                : 'bg-emerald-950/80 border-emerald-800 text-emerald-400'
            }`}
          >
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-neutral-100 tracking-tight">
                Diagnóstico de Rede &amp; Recursos
              </h3>
              <span
                className={`text-[10px] uppercase font-mono px-2 py-0.5 rounded font-semibold border ${
                  systemSummary.systemHealth === 'critical'
                    ? 'bg-rose-950 text-rose-300 border-rose-800'
                    : systemSummary.systemHealth === 'moderate'
                    ? 'bg-amber-950 text-amber-300 border-amber-800'
                    : 'bg-emerald-950 text-emerald-300 border-emerald-800'
                }`}
              >
                {systemSummary.systemHealth === 'critical'
                  ? 'Atenção Requerida'
                  : systemSummary.systemHealth === 'moderate'
                  ? 'Carga Moderada'
                  : 'Estável'}
              </span>
            </div>
            <p className="text-xs text-neutral-400 mt-0.5">
              Latência TCP real (ms) para câmeras IP e uso de recursos do cliente para streams ativos.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
          <button
            onClick={() => setIsPaused(!isPaused)}
            className={`p-1.5 rounded-lg border text-xs transition-colors ${
              isPaused
                ? 'bg-amber-950 text-amber-300 border-amber-800'
                : 'bg-neutral-800 text-neutral-300 border-neutral-700 hover:bg-neutral-700'
            }`}
            title={isPaused ? 'Retomar amostragem' : 'Pausar amostragem'}
          >
            {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
          </button>

          <select
            value={refreshInterval}
            onChange={(e) => setRefreshInterval(Number(e.target.value))}
            className="bg-neutral-800 border border-neutral-700 text-neutral-300 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-blue-500"
          >
            <option value={2000}>Atualizar a cada 2.0s</option>
            <option value={3000}>Atualizar a cada 3.0s</option>
            <option value={5000}>Atualizar a cada 5.0s</option>
          </select>

          <button
            onClick={handleExportDiagnostics}
            disabled={isExporting || cameras.length === 0}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border border-neutral-700 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Exportar Log</span>
          </button>

          {onClose && (
            <button
              onClick={onClose}
              className="px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-neutral-200 text-xs font-medium border border-neutral-700 transition-colors whitespace-nowrap shrink-0"
            >
              Fechar
            </button>
          )}
        </div>
      </div>

      {/* Aggregate Metrics Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
        <div className="p-3 rounded-xl bg-neutral-950/70 border border-neutral-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-neutral-400 mb-1">
            <span className="text-[11px] font-medium flex items-center gap-1.5">
              <Wifi className="w-3.5 h-3.5 text-cyan-400" />
              Latência Média RTT
            </span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-bold font-mono tabular-nums text-neutral-100">
              {systemSummary.avgLatency}
            </span>
            <span className="text-xs text-neutral-400 font-mono">ms</span>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-neutral-950/70 border border-neutral-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-neutral-400 mb-1">
            <span className="text-[11px] font-medium flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-blue-400" />
              CPU Estimada
            </span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-bold font-mono tabular-nums text-neutral-100">
              {systemSummary.totalCpu}
            </span>
            <span className="text-xs text-neutral-400 font-mono">%</span>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-neutral-950/70 border border-neutral-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-neutral-400 mb-1">
            <span className="text-[11px] font-medium flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5 text-indigo-400" />
              Heap / RAM JS
            </span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-bold font-mono tabular-nums text-neutral-100">
              {systemSummary.totalRam}
            </span>
            <span className="text-xs text-neutral-400 font-mono">MB</span>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-neutral-950/70 border border-neutral-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-neutral-400 mb-1">
            <span className="text-[11px] font-medium flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
              Banda Estimada
            </span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-bold font-mono tabular-nums text-neutral-100">
              {systemSummary.totalBitrateMbps}
            </span>
            <span className="text-xs text-neutral-400 font-mono">Mbps</span>
          </div>
        </div>

        <div
          className={`p-3 rounded-xl border flex flex-col justify-between col-span-2 sm:col-span-4 lg:col-span-1 ${
            systemSummary.bottlenecksCount > 0
              ? 'bg-rose-950/40 border-rose-800 text-rose-300'
              : 'bg-neutral-950/70 border-neutral-800 text-neutral-300'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-medium flex items-center gap-1.5">
              <AlertTriangle
                className={`w-3.5 h-3.5 ${
                  systemSummary.bottlenecksCount > 0 ? 'text-rose-400' : 'text-emerald-400'
                }`}
              />
              Gargalos
            </span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span
              className={`text-xl font-bold font-mono tabular-nums ${
                systemSummary.bottlenecksCount > 0 ? 'text-rose-400' : 'text-neutral-100'
              }`}
            >
              {systemSummary.bottlenecksCount}
            </span>
            <span className="text-xs text-neutral-400 font-mono">
              {systemSummary.bottlenecksCount === 1 ? 'alerta' : 'alertas'}
            </span>
          </div>
        </div>
      </div>

      {/* Bottleneck Alerts */}
      {activeAlerts.length > 0 && (
        <div className="space-y-2">
          {activeAlerts.map((alert) => (
            <div
              key={alert.id}
              className="p-3.5 rounded-xl bg-rose-950/70 border border-rose-800 text-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-rose-900/80 border border-rose-700 text-rose-300 shrink-0 mt-0.5">
                  <AlertCircle className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-xs text-rose-100">{alert.title}</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-rose-900 text-rose-200 border border-rose-700">
                      {alert.cameraName} ({alert.value})
                    </span>
                  </div>
                  <p className="text-xs text-rose-300/90 mt-0.5">{alert.description}</p>
                  <p className="text-[11px] text-neutral-300 mt-1">
                    <strong className="text-rose-200">Recomendação:</strong> {alert.recommendation}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                {currentUserRole === 'admin' && (
                  <button
                    onClick={() => handleOptimizeCamera(alert.cameraId)}
                    disabled={optimizingCameraId === alert.cameraId}
                    className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-medium text-xs transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    {optimizingCameraId === alert.cameraId ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Zap className="w-3.5 h-3.5" />
                    )}
                    <span>Ajustar p/ 720p 15fps</span>
                  </button>
                )}
                <button
                  onClick={() =>
                    setActiveAlertsDismissed((prev) => ({ ...prev, [alert.cameraId]: true }))
                  }
                  className="px-2 py-1.5 rounded-lg bg-neutral-900/80 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 text-xs transition-colors border border-neutral-700"
                >
                  Dispensar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div className="flex flex-wrap items-center gap-1 bg-neutral-950 p-1 rounded-xl border border-neutral-800 text-xs">
          <button
            onClick={() => setFilterMode('all')}
            className={`px-3 py-1 rounded-lg transition-colors whitespace-nowrap shrink-0 ${
              filterMode === 'all'
                ? 'bg-neutral-800 text-neutral-100 font-semibold'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Todas ({cameras.length})
          </button>
          <button
            onClick={() => setFilterMode('bottleneck')}
            className={`px-3 py-1 rounded-lg transition-colors whitespace-nowrap shrink-0 ${
              filterMode === 'bottleneck'
                ? 'bg-rose-900/70 text-rose-200 font-semibold border border-rose-800'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Com Gargalo ({systemSummary.bottlenecksCount})
          </button>
          <button
            onClick={() => setFilterMode('high_latency')}
            className={`px-3 py-1 rounded-lg transition-colors whitespace-nowrap shrink-0 ${
              filterMode === 'high_latency'
                ? 'bg-neutral-800 text-neutral-100 font-semibold'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Maior Latência (ms)
          </button>
          <button
            onClick={() => setFilterMode('high_cpu')}
            className={`px-3 py-1 rounded-lg transition-colors whitespace-nowrap shrink-0 ${
              filterMode === 'high_cpu'
                ? 'bg-neutral-800 text-neutral-100 font-semibold'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Maior CPU (%)
          </button>
        </div>

        <span className="text-[11px] text-neutral-500 font-mono tabular-nums">
          {filteredTelemetries.length} de {cameras.length} canais
        </span>
      </div>

      {/* Camera Telemetry Cards */}
      {cameras.length === 0 ? (
        <div className="p-8 text-center bg-neutral-950/50 rounded-xl border border-neutral-800 space-y-2">
          <Info className="w-6 h-6 text-neutral-500 mx-auto" />
          <h4 className="text-xs font-semibold text-neutral-200">
            Nenhuma câmera ativa para diagnosticar
          </h4>
          <p className="text-[11px] text-neutral-400">
            Adicione câmeras reais à unidade ativa para monitorar latência e consumo.
          </p>
        </div>
      ) : filteredTelemetries.length === 0 ? (
        <div className="p-8 text-center bg-neutral-950/50 rounded-xl border border-neutral-800 space-y-2">
          <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto" />
          <h4 className="text-xs font-semibold text-neutral-200">
            Nenhuma câmera encontrada para o filtro selecionado
          </h4>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredTelemetries.map((item) => {
            const isBottleneck = item.status === 'bottleneck';
            const latencyLabel = item.latencyMs >= 999 ? 'Offline' : `${item.latencyMs}`;
            const latencyColor =
              item.latencyMs > 80
                ? 'text-rose-400'
                : item.latencyMs > 35
                ? 'text-amber-400'
                : 'text-emerald-400';

            const cpuColor =
              item.cpuPercent > 20
                ? 'text-rose-400'
                : item.cpuPercent > 12
                ? 'text-amber-400'
                : 'text-blue-400';

            return (
              <div
                key={item.cameraId}
                className={`p-3.5 rounded-xl border transition-all ${
                  isBottleneck
                    ? 'bg-rose-950/20 border-rose-800/80'
                    : 'bg-neutral-950/80 border-neutral-800/90 hover:border-neutral-700'
                }`}
              >
                <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-neutral-800/80">
                  <div className="truncate">
                    <span className="font-semibold text-xs text-neutral-100 truncate block">
                      {item.cameraName}
                    </span>
                    <p className="text-[11px] text-neutral-400 truncate mt-0.5">
                      {item.location || 'Área Monitorada'}
                    </p>
                  </div>

                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded font-medium border shrink-0 ${
                      item.status === 'bottleneck'
                        ? 'bg-rose-950 text-rose-300 border-rose-800'
                        : item.status === 'moderate'
                        ? 'bg-amber-950 text-amber-300 border-amber-800'
                        : 'bg-emerald-950 text-emerald-300 border-emerald-800'
                    }`}
                  >
                    {item.status === 'bottleneck'
                      ? 'Gargalo'
                      : item.status === 'moderate'
                      ? 'Moderado'
                      : 'Estável'}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 py-3 text-center">
                  <div className="bg-neutral-900/70 p-2 rounded-lg border border-neutral-800">
                    <span className="text-[10px] text-neutral-400 font-medium block">Latência</span>
                    <div className="flex items-baseline justify-center gap-0.5 mt-0.5">
                      <span className={`text-base font-bold font-mono tabular-nums ${latencyColor}`}>
                        {latencyLabel}
                      </span>
                      {item.latencyMs < 999 && (
                        <span className="text-[10px] text-neutral-400 font-mono">ms</span>
                      )}
                    </div>
                  </div>

                  <div className="bg-neutral-900/70 p-2 rounded-lg border border-neutral-800">
                    <span className="text-[10px] text-neutral-400 font-medium block">Uso CPU</span>
                    <div className="flex items-baseline justify-center gap-0.5 mt-0.5">
                      <span className={`text-base font-bold font-mono tabular-nums ${cpuColor}`}>
                        {item.cpuPercent}
                      </span>
                      <span className="text-[10px] text-neutral-400 font-mono">%</span>
                    </div>
                  </div>

                  <div className="bg-neutral-900/70 p-2 rounded-lg border border-neutral-800">
                    <span className="text-[10px] text-neutral-400 font-medium block">RAM JS</span>
                    <div className="flex items-baseline justify-center gap-0.5 mt-0.5">
                      <span className="text-base font-bold font-mono tabular-nums text-neutral-100">
                        {item.ramMb}
                      </span>
                      <span className="text-[10px] text-neutral-400 font-mono">MB</span>
                    </div>
                  </div>
                </div>

                <div className="pt-1 pb-2 text-[11px] text-neutral-400 grid grid-cols-2 gap-y-1.5 border-t border-neutral-800/60 font-mono tabular-nums">
                  <div className="flex items-center justify-between pr-2">
                    <span className="text-neutral-500">FPS Alvo:</span>
                    <span className="text-neutral-300">
                      {item.fps} / {item.targetFps}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pl-2">
                    <span className="text-neutral-500">Jitter:</span>
                    <span className="text-neutral-300">{item.jitterMs} ms</span>
                  </div>
                </div>

                <div
                  className={`mt-2 p-2 rounded-lg text-[11px] flex items-center justify-between gap-2 ${
                    isBottleneck
                      ? 'bg-rose-950/50 border border-rose-800 text-rose-300'
                      : 'bg-neutral-900/50 text-neutral-400'
                  }`}
                >
                  <div className="flex items-center gap-1.5 truncate">
                    {isBottleneck ? (
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    )}
                    <span className="truncate">{item.bottleneckMessage}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
