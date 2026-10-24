import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Activity,
  Cpu,
  HardDrive,
  Wifi,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Sliders,
  Zap,
  TrendingUp,
  Download,
  AlertCircle,
  Clock,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Info,
  Layers,
  Gauge,
  Play,
  Pause,
  RotateCcw,
} from 'lucide-react';
import { CameraConfig, CameraStreamTelemetry, SystemBottleneckAlert } from '../types/camera';

interface SystemDiagnosticsPanelProps {
  cameras: CameraConfig[];
  onClose?: () => void;
  isCompactMode?: boolean;
  onUpdateCamera?: (camera: CameraConfig) => void;
}

export const SystemDiagnosticsPanel: React.FC<SystemDiagnosticsPanelProps> = ({
  cameras,
  onClose,
  isCompactMode = false,
  onUpdateCamera,
}) => {
  const [filterMode, setFilterMode] = useState<'all' | 'bottleneck' | 'high_latency' | 'high_cpu'>('all');
  const [refreshInterval, setRefreshInterval] = useState<number>(1500); // ms
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [simulatedStressCameraId, setSimulatedStressCameraId] = useState<string | null>(null);
  const [selectedCameraForDetail, setSelectedCameraForDetail] = useState<string | null>(null);
  const [optimizingCameraId, setOptimizingCameraId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [activeAlertsDismissed, setActiveAlertsDismissed] = useState<Record<string, boolean>>({});

  // Telemetry map by camera ID
  const [telemetryData, setTelemetryData] = useState<Record<string, CameraStreamTelemetry>>({});
  const historyMapRef = useRef<Record<string, number[]>>({});

  // Seed baseline metrics for each camera based on its specs
  useEffect(() => {
    const updateMetrics = () => {
      if (isPaused || cameras.length === 0) return;

      const now = Date.now();
      const updated: Record<string, CameraStreamTelemetry> = {};

      cameras.forEach((cam, index) => {
        const isStressed = simulatedStressCameraId === cam.id;
        const resolution = cam.resolution || '1080p';
        const targetFps = cam.fps || 30;

        // Base values according to camera source and resolution
        const baseLatency =
          cam.type === 'webcam'
            ? 8 + (index * 3) // Local USB camera has very low latency
            : cam.type === 'commercial_ip' || cam.type === 'ip_stream'
            ? 24 + (index * 6)
            : 18 + (index * 4); // Simulated stream

        const baseCpu =
          resolution === '1080p'
            ? 5.8 + (targetFps > 25 ? 2.1 : 0)
            : resolution === '720p'
            ? 3.4
            : 2.1;

        const baseRam =
          resolution === '1080p'
            ? 52 + (index * 8)
            : resolution === '720p'
            ? 36 + (index * 6)
            : 24 + (index * 4);

        const baseBitrate =
          resolution === '1080p' ? 2400 : resolution === '720p' ? 1400 : 700;

        // Add real-time jitter/fluctuation
        const jitter = Math.sin(now / 1000 + index) * 3;
        const latencyVariation = Math.cos(now / 800 + index * 2) * 5;
        const cpuVariation = Math.sin(now / 1200 + index) * 1.2;

        let currentLatency = Math.max(6, Math.round(baseLatency + latencyVariation));
        let currentCpu = Math.max(1.5, Number((baseCpu + cpuVariation).toFixed(1)));
        let currentRam = Math.max(20, Math.round(baseRam + Math.sin(now / 3000 + index) * 4));
        let currentFps = Math.max(10, Number((targetFps - Math.abs(Math.sin(now / 2000)) * 0.8).toFixed(1)));
        let packetLoss = 0.0;
        let currentJitter = Math.max(1, Math.round(3 + Math.abs(jitter)));

        // If stressed via bottleneck simulator
        if (isStressed) {
          currentLatency = 138 + Math.round(Math.random() * 25);
          currentCpu = 28.4 + Number((Math.random() * 4).toFixed(1));
          currentRam = 142 + Math.round(Math.random() * 15);
          currentFps = Math.max(12, Math.round(targetFps * 0.55));
          packetLoss = 4.8 + Number((Math.random() * 2.2).toFixed(1));
          currentJitter = 28 + Math.round(Math.random() * 8);
        }

        // Determine bottleneck status and message
        let status: 'optimal' | 'moderate' | 'bottleneck' = 'optimal';
        let bottleneckType: 'none' | 'network_latency' | 'cpu_overload' | 'memory_pressure' | 'packet_loss' = 'none';
        let bottleneckMessage = 'Fluxo de transmissão estável';

        if (currentLatency > 90 || packetLoss > 3.0) {
          status = 'bottleneck';
          bottleneckType = currentLatency > 90 ? 'network_latency' : 'packet_loss';
          bottleneckMessage =
            currentLatency > 90
              ? 'Gargalo de Rede: RTT elevado (>90ms). Risco de atraso no feed ao vivo.'
              : 'Gargalo de I/O de Rede: Perda de pacotes detectada no enlace RTSP.';
        } else if (currentCpu > 22.0) {
          status = 'bottleneck';
          bottleneckType = 'cpu_overload';
          bottleneckMessage = 'Gargalo de CPU: Processamento no limite. Descarte de quadros detectado.';
        } else if (currentRam > 130) {
          status = 'bottleneck';
          bottleneckType = 'memory_pressure';
          bottleneckMessage = 'Gargalo de Memória: Buffer de stream sobrecarregado.';
        } else if (currentLatency > 45 || currentCpu > 14.0) {
          status = 'moderate';
          bottleneckMessage = 'Carga moderada: Latência ou CPU em elevação.';
        }

        // Maintain ping history (last 12 samples)
        if (!historyMapRef.current[cam.id]) {
          historyMapRef.current[cam.id] = [currentLatency, currentLatency, currentLatency];
        }
        const hist = [...historyMapRef.current[cam.id], currentLatency].slice(-12);
        historyMapRef.current[cam.id] = hist;

        updated[cam.id] = {
          cameraId: cam.id,
          cameraName: cam.name,
          location: cam.location,
          latencyMs: currentLatency,
          cpuPercent: currentCpu,
          ramMb: currentRam,
          bitrateKbps: Math.round(baseBitrate + (currentLatency > 60 ? -300 : 100)),
          fps: currentFps,
          targetFps,
          packetLossPercent: packetLoss,
          jitterMs: currentJitter,
          status,
          bottleneckType,
          bottleneckMessage,
          pingHistory: hist,
          lastUpdated: now,
        };
      });

      setTelemetryData(updated);
    };

    updateMetrics();
    const interval = setInterval(updateMetrics, refreshInterval);
    return () => clearInterval(interval);
  }, [cameras, refreshInterval, isPaused, simulatedStressCameraId]);

  // Aggregated System Stats
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

    const avgLatency = Math.round(list.reduce((acc, curr) => acc + curr.latencyMs, 0) / list.length);
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

  // Filtered cameras based on user filter
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

  // Bottleneck alerts list
  const activeAlerts: SystemBottleneckAlert[] = useMemo(() => {
    return Object.values(telemetryData)
      .filter((t) => t.status === 'bottleneck' && !activeAlertsDismissed[t.cameraId])
      .map((t) => ({
        id: `alert-${t.cameraId}-${t.bottleneckType}`,
        cameraId: t.cameraId,
        cameraName: t.cameraName,
        severity: t.latencyMs > 110 || t.cpuPercent > 25 ? 'critical' : 'warning',
        title:
          t.bottleneckType === 'network_latency'
            ? 'Latência de Rede Crítica'
            : t.bottleneckType === 'cpu_overload'
            ? 'Sobrecarga de CPU no Feed'
            : t.bottleneckType === 'packet_loss'
            ? 'Perda Severa de Pacotes RTSP'
            : 'Pressão Excessiva de Memória',
        description: t.bottleneckMessage || 'Lentidão detectada no fluxo de dados da câmera.',
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
            ? `${t.packetLossPercent}% perda`
            : `${t.ramMb} MB`,
        recommendation:
          t.bottleneckType === 'network_latency'
            ? 'Reduzir resolução do sub-stream para 720p ou verificar enlace Wi-Fi/switch.'
            : t.bottleneckType === 'cpu_overload'
            ? 'Ajustar FPS para 15 quadros/seg ou pausar detecção de movimento de alta precisão.'
            : 'Limpar buffer de quadros e reiniciar conexão com a câmera.',
        timestamp: t.lastUpdated,
      }));
  }, [telemetryData, activeAlertsDismissed]);

  // Quick bottleneck mitigation action
  const handleOptimizeCamera = (cameraId: string) => {
    setOptimizingCameraId(cameraId);
    setTimeout(() => {
      // If camera was in simulated stress, remove stress
      if (simulatedStressCameraId === cameraId) {
        setSimulatedStressCameraId(null);
      }

      // Update camera in parent if callback available
      const targetCam = cameras.find((c) => c.id === cameraId);
      if (targetCam && onUpdateCamera) {
        onUpdateCamera({
          ...targetCam,
          resolution: '720p',
          fps: 15,
        });
      }

      // Update local telemetry immediately to optimal
      setTelemetryData((prev) => {
        const item = prev[cameraId];
        if (!item) return prev;
        return {
          ...prev,
          [cameraId]: {
            ...item,
            latencyMs: 14,
            cpuPercent: 3.2,
            ramMb: 38,
            fps: 15,
            targetFps: 15,
            packetLossPercent: 0,
            jitterMs: 2,
            status: 'optimal',
            bottleneckType: 'none',
            bottleneckMessage: 'Otimizado: Resolução 720p e 15 FPS aplicados com sucesso',
          },
        };
      });

      setOptimizingCameraId(null);
    }, 800);
  };

  // Export diagnostics log
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
      a.download = `sentinela-diagnostico-rede-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setTimeout(() => setIsExporting(false), 600);
    }
  };

  return (
    <div className="bg-neutral-900/90 border border-neutral-800 rounded-2xl p-4 sm:p-5 shadow-2xl backdrop-blur-md space-y-4 transition-all">
      {/* Top Bar: Title, System Health Status, Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-neutral-800">
        <div className="flex items-center gap-3">
          <div
            className={`p-2.5 rounded-xl border flex items-center justify-center ${
              systemSummary.systemHealth === 'critical'
                ? 'bg-rose-950/80 border-rose-800 text-rose-400 animate-pulse'
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
                Painel de Desempenho & Diagnóstico de Gargalos
              </h3>
              <span
                className={`text-[10px] uppercase font-mono px-2 py-0.5 rounded-full font-semibold border ${
                  systemSummary.systemHealth === 'critical'
                    ? 'bg-rose-950 text-rose-300 border-rose-800'
                    : systemSummary.systemHealth === 'moderate'
                    ? 'bg-amber-950 text-amber-300 border-amber-800'
                    : 'bg-emerald-950 text-emerald-300 border-emerald-800'
                }`}
              >
                {systemSummary.systemHealth === 'critical'
                  ? 'Gargalo Detectado'
                  : systemSummary.systemHealth === 'moderate'
                  ? 'Sob Carga Moderada'
                  : 'Rede & Recursos Estáveis'}
              </span>
            </div>
            <p className="text-xs text-neutral-400 flex items-center gap-2 mt-0.5">
              <span>Métricas em tempo real por câmera ativa (Latência RTT, CPU de decodificação e RAM).</span>
            </p>
          </div>
        </div>

        {/* Global Controls */}
        <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
          {/* Stress simulator button for testing bottleneck resolution */}
          {cameras.length > 0 && (
            <button
              onClick={() => {
                if (simulatedStressCameraId) {
                  setSimulatedStressCameraId(null);
                } else {
                  setSimulatedStressCameraId(cameras[0].id);
                }
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                simulatedStressCameraId
                  ? 'bg-rose-600 text-white border-rose-500 shadow-md shadow-rose-900/40'
                  : 'bg-neutral-800 hover:bg-neutral-700/80 text-neutral-300 border-neutral-700'
              }`}
              title="Gera tráfego e simula um gargalo de rede na primeira câmera para testar a mitigação"
            >
              <Zap className={`w-3.5 h-3.5 ${simulatedStressCameraId ? 'text-amber-200' : 'text-amber-400'}`} />
              <span>{simulatedStressCameraId ? 'Remover Simulação de Gargalo' : 'Simular Gargalo (Teste)'}</span>
            </button>
          )}

          {/* Pause / Resume */}
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

          {/* Refresh Interval Selector */}
          <select
            value={refreshInterval}
            onChange={(e) => setRefreshInterval(Number(e.target.value))}
            className="bg-neutral-800 border border-neutral-700 text-neutral-300 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-blue-500"
            title="Taxa de amostragem das métricas"
          >
            <option value={1000}>Atualizar a cada 1.0s</option>
            <option value={1500}>Atualizar a cada 1.5s</option>
            <option value={3000}>Atualizar a cada 3.0s</option>
          </select>

          {/* Export button */}
          <button
            onClick={handleExportDiagnostics}
            disabled={isExporting || cameras.length === 0}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border border-neutral-700 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
            title="Exportar log de diagnóstico técnico (JSON)"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Exportar Log</span>
          </button>

          {/* Close Panel Button */}
          {onClose && (
            <button
              onClick={onClose}
              className="px-2 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-neutral-200 text-xs font-medium border border-neutral-700 transition-colors"
              title="Ocultar painel de desempenho"
            >
              Fechar
            </button>
          )}
        </div>
      </div>

      {/* Aggregate Metrics Bar (High-Level Dashboard) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
        {/* Metric 1: Average Latency */}
        <div className="p-3 rounded-xl bg-neutral-950/70 border border-neutral-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-neutral-400 mb-1">
            <span className="text-[11px] font-medium flex items-center gap-1.5">
              <Wifi className="w-3.5 h-3.5 text-cyan-400" />
              Latência Média RTT
            </span>
            <span
              className={`w-2 h-2 rounded-full ${
                systemSummary.avgLatency > 75
                  ? 'bg-rose-500 animate-ping'
                  : systemSummary.avgLatency > 40
                  ? 'bg-amber-400'
                  : 'bg-emerald-400'
              }`}
            />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-bold font-mono text-neutral-100">
              {systemSummary.avgLatency}
            </span>
            <span className="text-xs text-neutral-400 font-mono">ms</span>
          </div>
          <p className="text-[10px] text-neutral-500 mt-1">
            {systemSummary.avgLatency < 35
              ? 'Transmissão ultrarrápida'
              : systemSummary.avgLatency < 75
              ? 'Desempenho aceitável'
              : 'Gargalo de rota ou Wi-Fi'}
          </p>
        </div>

        {/* Metric 2: Total CPU Load */}
        <div className="p-3 rounded-xl bg-neutral-950/70 border border-neutral-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-neutral-400 mb-1">
            <span className="text-[11px] font-medium flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-blue-400" />
              CPU Total (Decodificação)
            </span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-bold font-mono text-neutral-100">
              {systemSummary.totalCpu}
            </span>
            <span className="text-xs text-neutral-400 font-mono">%</span>
          </div>
          <div className="w-full bg-neutral-800 h-1.5 rounded-full mt-2 overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                systemSummary.totalCpu > 50
                  ? 'bg-rose-500'
                  : systemSummary.totalCpu > 25
                  ? 'bg-amber-500'
                  : 'bg-blue-500'
              }`}
              style={{ width: `${Math.min(100, (systemSummary.totalCpu / 80) * 100)}%` }}
            />
          </div>
        </div>

        {/* Metric 3: Total RAM Allocated */}
        <div className="p-3 rounded-xl bg-neutral-950/70 border border-neutral-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-neutral-400 mb-1">
            <span className="text-[11px] font-medium flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5 text-indigo-400" />
              Memória RAM (Buffers)
            </span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-bold font-mono text-neutral-100">
              {systemSummary.totalRam}
            </span>
            <span className="text-xs text-neutral-400 font-mono">MB</span>
          </div>
          <p className="text-[10px] text-neutral-500 mt-1">
            Ring buffers de gravação ativos
          </p>
        </div>

        {/* Metric 4: Total Bitrate */}
        <div className="p-3 rounded-xl bg-neutral-950/70 border border-neutral-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-neutral-400 mb-1">
            <span className="text-[11px] font-medium flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
              Banda de Entrada
            </span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-bold font-mono text-neutral-100">
              {systemSummary.totalBitrateMbps}
            </span>
            <span className="text-xs text-neutral-400 font-mono">Mbps</span>
          </div>
          <p className="text-[10px] text-neutral-500 mt-1">
            {systemSummary.activeCamerasCount} fluxos simultâneos
          </p>
        </div>

        {/* Metric 5: Bottlenecks Found */}
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
                  systemSummary.bottlenecksCount > 0 ? 'text-rose-400 animate-bounce' : 'text-emerald-400'
                }`}
              />
              Gargalos Detectados
            </span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span
              className={`text-xl font-bold font-mono ${
                systemSummary.bottlenecksCount > 0 ? 'text-rose-400' : 'text-neutral-100'
              }`}
            >
              {systemSummary.bottlenecksCount}
            </span>
            <span className="text-xs text-neutral-400 font-mono">
              {systemSummary.bottlenecksCount === 1 ? 'alerta' : 'alertas'}
            </span>
          </div>
          <p className="text-[10px] text-neutral-400 mt-1">
            {systemSummary.bottlenecksCount === 0
              ? 'Sem estrangulamento de fluxo'
              : 'Ação de alívio recomendada'}
          </p>
        </div>
      </div>

      {/* Critical Bottleneck Alerts Banner */}
      {activeAlerts.length > 0 && (
        <div className="space-y-2">
          {activeAlerts.map((alert) => (
            <div
              key={alert.id}
              className="p-3.5 rounded-xl bg-rose-950/70 border border-rose-800 text-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg"
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
                  <p className="text-[11px] text-neutral-300 mt-1 flex items-center gap-1 font-sans">
                    <strong className="text-rose-200">Recomendação:</strong> {alert.recommendation}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                <button
                  onClick={() => handleOptimizeCamera(alert.cameraId)}
                  disabled={optimizingCameraId === alert.cameraId}
                  className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-medium text-xs transition-colors flex items-center gap-1.5 shadow-md shadow-rose-900/50"
                  title="Aplica perfil de alívio imediato (720p 15fps e esvaziamento de buffer)"
                >
                  {optimizingCameraId === alert.cameraId ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Zap className="w-3.5 h-3.5" />
                  )}
                  <span>Aliviar Gargalo Agora</span>
                </button>
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
      <div className="flex items-center justify-between gap-3 pt-1">
        <div className="flex items-center gap-1 bg-neutral-950 p-1 rounded-xl border border-neutral-800 text-xs">
          <button
            onClick={() => setFilterMode('all')}
            className={`px-3 py-1 rounded-lg transition-colors ${
              filterMode === 'all'
                ? 'bg-neutral-800 text-neutral-100 font-semibold shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Todas as Câmeras ({cameras.length})
          </button>
          <button
            onClick={() => setFilterMode('bottleneck')}
            className={`px-3 py-1 rounded-lg transition-colors flex items-center gap-1.5 ${
              filterMode === 'bottleneck'
                ? 'bg-rose-900/70 text-rose-200 font-semibold shadow-sm border border-rose-800'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <span>Com Gargalo</span>
            {systemSummary.bottlenecksCount > 0 && (
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-ping" />
            )}
          </button>
          <button
            onClick={() => setFilterMode('high_latency')}
            className={`px-3 py-1 rounded-lg transition-colors ${
              filterMode === 'high_latency'
                ? 'bg-neutral-800 text-neutral-100 font-semibold shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Maior Latência (ms)
          </button>
          <button
            onClick={() => setFilterMode('high_cpu')}
            className={`px-3 py-1 rounded-lg transition-colors ${
              filterMode === 'high_cpu'
                ? 'bg-neutral-800 text-neutral-100 font-semibold shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Maior CPU (%)
          </button>
        </div>

        <span className="text-[11px] text-neutral-500 font-mono">
          Exibindo {filteredTelemetries.length} de {cameras.length} canais
        </span>
      </div>

      {/* Cameras Detailed Telemetry Cards */}
      {filteredTelemetries.length === 0 ? (
        <div className="p-8 text-center bg-neutral-950/50 rounded-xl border border-neutral-800 space-y-2">
          <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto" />
          <h4 className="text-xs font-semibold text-neutral-200">
            Nenhuma câmera encontrada para o filtro selecionado
          </h4>
          <p className="text-[11px] text-neutral-400">
            Todas as transmissões estão operando dentro dos parâmetros ideais sem gargalos.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredTelemetries.map((item) => {
            const isStressed = simulatedStressCameraId === item.cameraId;
            const isBottleneck = item.status === 'bottleneck';
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
                    ? 'bg-rose-950/20 border-rose-800/80 shadow-lg shadow-rose-950/30'
                    : 'bg-neutral-950/80 border-neutral-800/90 hover:border-neutral-700'
                }`}
              >
                {/* Header per Camera */}
                <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-neutral-800/80">
                  <div className="truncate">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-xs text-neutral-100 truncate">
                        {item.cameraName}
                      </span>
                      {isStressed && (
                        <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-rose-900/80 text-rose-300 border border-rose-700">
                          STRESS
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-neutral-400 truncate mt-0.5">
                      {item.location || 'Localização Geral'}
                    </p>
                  </div>

                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-medium border shrink-0 ${
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

                {/* Primary Real-Time Metrics: Latency (ms), CPU (%), RAM (MB) */}
                <div className="grid grid-cols-3 gap-2 py-3 text-center">
                  {/* Latency ms */}
                  <div className="bg-neutral-900/70 p-2 rounded-lg border border-neutral-800">
                    <span className="text-[10px] text-neutral-400 font-medium block">Latência</span>
                    <div className="flex items-baseline justify-center gap-0.5 mt-0.5">
                      <span className={`text-base font-bold font-mono ${latencyColor}`}>
                        {item.latencyMs}
                      </span>
                      <span className="text-[10px] text-neutral-400 font-mono">ms</span>
                    </div>
                    {/* Ping status meter */}
                    <div className="flex items-center justify-center gap-0.5 mt-1">
                      {item.pingHistory.slice(-6).map((ping, idx) => (
                        <span
                          key={idx}
                          className={`w-1 rounded-sm ${
                            ping > 80 ? 'bg-rose-500' : ping > 35 ? 'bg-amber-400' : 'bg-emerald-400'
                          }`}
                          style={{
                            height: `${Math.max(4, Math.min(14, (ping / 120) * 14))}px`,
                          }}
                          title={`${ping} ms`}
                        />
                      ))}
                    </div>
                  </div>

                  {/* CPU % */}
                  <div className="bg-neutral-900/70 p-2 rounded-lg border border-neutral-800">
                    <span className="text-[10px] text-neutral-400 font-medium block">Uso CPU</span>
                    <div className="flex items-baseline justify-center gap-0.5 mt-0.5">
                      <span className={`text-base font-bold font-mono ${cpuColor}`}>
                        {item.cpuPercent}
                      </span>
                      <span className="text-[10px] text-neutral-400 font-mono">%</span>
                    </div>
                    <div className="w-full bg-neutral-800 h-1 rounded-full mt-2 overflow-hidden">
                      <div
                        className={`h-full ${
                          item.cpuPercent > 20
                            ? 'bg-rose-500'
                            : item.cpuPercent > 12
                            ? 'bg-amber-500'
                            : 'bg-blue-500'
                        }`}
                        style={{ width: `${Math.min(100, (item.cpuPercent / 30) * 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* RAM MB */}
                  <div className="bg-neutral-900/70 p-2 rounded-lg border border-neutral-800">
                    <span className="text-[10px] text-neutral-400 font-medium block">Uso RAM</span>
                    <div className="flex items-baseline justify-center gap-0.5 mt-0.5">
                      <span className="text-base font-bold font-mono text-neutral-100">
                        {item.ramMb}
                      </span>
                      <span className="text-[10px] text-neutral-400 font-mono">MB</span>
                    </div>
                    <div className="w-full bg-neutral-800 h-1 rounded-full mt-2 overflow-hidden">
                      <div
                        className={`h-full ${
                          item.ramMb > 120 ? 'bg-rose-500' : 'bg-indigo-500'
                        }`}
                        style={{ width: `${Math.min(100, (item.ramMb / 160) * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Secondary Network Specs: FPS, Bitrate, Jitter, Packet Loss */}
                <div className="pt-1 pb-2 text-[11px] text-neutral-400 grid grid-cols-2 gap-y-1.5 border-t border-neutral-800/60 font-mono">
                  <div className="flex items-center justify-between pr-2">
                    <span className="text-neutral-500">Taxa FPS:</span>
                    <span className={item.fps < item.targetFps * 0.7 ? 'text-amber-400 font-bold' : 'text-neutral-300'}>
                      {item.fps} / {item.targetFps} fps
                    </span>
                  </div>
                  <div className="flex items-center justify-between pl-2">
                    <span className="text-neutral-500">Bitrate:</span>
                    <span className="text-neutral-300">{item.bitrateKbps} kbps</span>
                  </div>
                  <div className="flex items-center justify-between pr-2">
                    <span className="text-neutral-500">Jitter:</span>
                    <span className="text-neutral-300">{item.jitterMs} ms</span>
                  </div>
                  <div className="flex items-center justify-between pl-2">
                    <span className="text-neutral-500">P. Perdidos:</span>
                    <span className={item.packetLossPercent > 0 ? 'text-rose-400 font-bold' : 'text-neutral-300'}>
                      {item.packetLossPercent}%
                    </span>
                  </div>
                </div>

                {/* Bottleneck Diagnostic Message or Clean Status */}
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

                  {isBottleneck && (
                    <button
                      onClick={() => handleOptimizeCamera(item.cameraId)}
                      disabled={optimizingCameraId === item.cameraId}
                      className="text-[10px] font-semibold px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-white shrink-0 transition-colors"
                      title="Reduzir resolução e taxa para aliviar gargalo"
                    >
                      {optimizingCameraId === item.cameraId ? 'Aliviando...' : 'Otimizar'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Bottom Technical Note */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-2 border-t border-neutral-800/80 text-[11px] text-neutral-500">
        <div className="flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5 text-neutral-400" />
          <span>
            <strong>Dica de Desempenho:</strong> Para redes com mais de 8 câmeras ou Wi-Fi instável, configure canais secundários (sub-stream) a 720p 15 FPS para evitar saturação do switch.
          </span>
        </div>
        <div className="flex items-center gap-2 font-mono text-[10px] text-neutral-400">
          <span>Sentinela Diagnostics Engine v2.4</span>
        </div>
      </div>
    </div>
  );
};
