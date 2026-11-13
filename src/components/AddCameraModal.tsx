import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Video,
  Globe,
  Server,
  Plus,
  Check,
  Volume2,
  Search,
  RefreshCw,
  Wifi,
  ShieldCheck,
  KeyRound,
  MapPin,
  Laptop,
  Radio,
  SlidersHorizontal,
} from 'lucide-react';
import {
  CameraConfig,
  CameraSourceType,
  ClientBusiness,
  DiscoveredDevice,
  RecordingSchedule,
} from '../types/camera';
import {
  COMMERCIAL_BRANDS,
  CameraBrand,
  buildCommercialRTSPUrl,
} from '../utils/commercialCameras';
import {
  scanLocalNetworkCameras,
  fetchLocalNetworkSubnets,
  probeSingleCameraIp,
  LocalSubnetInfo,
} from '../utils/networkDiscovery';
import { DEFAULT_RECORDING_SCHEDULE } from '../utils/recordingSchedule';
import { DEFAULT_UNIT_ID } from '../services/db';
import { CameraScheduleEditor } from './CameraScheduleEditor';

interface AddCameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddCamera: (camera: CameraConfig) => void;
  activeBusiness: ClientBusiness | null;
  existingCameras?: CameraConfig[];
}

export const AddCameraModal: React.FC<AddCameraModalProps> = ({
  isOpen,
  onClose,
  onAddCamera,
  activeBusiness,
  existingCameras = [],
}) => {
  const [activeTab, setActiveTab] = useState<'auto_discovery' | 'manual'>('auto_discovery');

  // Auto-Discovery state
  const [selectedSubnet, setSelectedSubnet] = useState<string>('192.168.1.0/24');
  const [customSubnetInput, setCustomSubnetInput] = useState<string>('');
  const [detectedLocalSubnets, setDetectedLocalSubnets] = useState<LocalSubnetInfo[]>([]);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanProgress, setScanProgress] = useState<number>(0);
  const [scanStats, setScanStats] = useState<{
    scannedCount: number;
    rtspVerifiedCount: number;
    durationMs: number;
    message: string;
  } | null>(null);
  const [discoveredDevices, setDiscoveredDevices] = useState<DiscoveredDevice[]>([]);
  const [hasScanned, setHasScanned] = useState<boolean>(false);
  const [expandedPasswordId, setExpandedPasswordId] = useState<string | null>(null);
  const [customPasswords, setCustomPasswords] = useState<Record<string, string>>({});
  const [customLocations, setCustomLocations] = useState<Record<string, string>>({});
  const [customNames, setCustomNames] = useState<Record<string, string>>({});
  const [addedDeviceIds, setAddedDeviceIds] = useState<Set<string>>(new Set());

  // Direct single-IP RTSP probe state
  const [directProbeIp, setDirectProbeIp] = useState<string>('');
  const [directProbePort, setDirectProbePort] = useState<number>(554);
  const [isProbingSingle, setIsProbingSingle] = useState<boolean>(false);
  const [directProbeFeedback, setDirectProbeFeedback] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  // Manual configuration state (no pre-filled camera names or store locations)
  const [sourceType, setSourceType] = useState<CameraSourceType>('commercial_ip');
  const [selectedBrand, setSelectedBrand] = useState<CameraBrand>('generic_onvif');
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');

  // RTSP/ONVIF IP camera inputs
  const [ipHost, setIpHost] = useState('');
  const [ipPort, setIpPort] = useState(554);
  const [ipUser, setIpUser] = useState('admin');
  const [ipPass, setIpPass] = useState('');
  const [ipChannel, setIpChannel] = useState(1);
  const [ipSubtype, setIpSubtype] = useState(0);

  // Other sources
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [streamUrl, setStreamUrl] = useState('');
  const [enableAudio, setEnableAudio] = useState(false);
  const [soundAlarmEnabled, setSoundAlarmEnabled] = useState(true);
  const [motionDetectionEnabled, setMotionDetectionEnabled] = useState(true);
  const [motionSensitivity, setMotionSensitivity] = useState(42);
  const [autoRecordOnMotion, setAutoRecordOnMotion] = useState(true);
  const [autoRecordDuration, setAutoRecordDuration] = useState(15);
  const [recordingSchedule, setRecordingSchedule] = useState<RecordingSchedule>(DEFAULT_RECORDING_SCHEDULE);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const handlePerformScan = useCallback(
    async (subnetToScan: string = selectedSubnet) => {
      const effectiveSubnet =
        subnetToScan === 'custom' && customSubnetInput.trim()
          ? customSubnetInput.trim()
          : subnetToScan === 'custom'
          ? '192.168.1.0/24'
          : subnetToScan;

      setIsScanning(true);
      setScanProgress(12);
      setDirectProbeFeedback(null);

      const progressTimer = setInterval(() => {
        setScanProgress((prev) => {
          if (prev >= 90) return prev;
          return prev + 12;
        });
      }, 150);

      try {
        const result = await scanLocalNetworkCameras({
          subnet: effectiveSubnet,
          existingCameras,
        });

        clearInterval(progressTimer);
        setScanProgress(100);

        setTimeout(() => {
          setDiscoveredDevices(result.devices);
          setDetectedLocalSubnets(result.detectedLocalSubnets);
          setScanStats({
            scannedCount: result.scannedCount,
            rtspVerifiedCount: result.rtspVerifiedCount,
            durationMs: result.durationMs,
            message: result.message,
          });
          setIsScanning(false);
          setHasScanned(true);
        }, 160);
      } catch (err) {
        clearInterval(progressTimer);
        setIsScanning(false);
        setHasScanned(true);
        console.error('Scan error:', err);
      }
    },
    [selectedSubnet, customSubnetInput, existingCameras]
  );

  const handleProbeSingleIp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!directProbeIp.trim()) return;

    setIsProbingSingle(true);
    setDirectProbeFeedback(null);
    try {
      const res = await probeSingleCameraIp(directProbeIp.trim(), directProbePort, existingCameras);
      if (res.reachable && res.device) {
        setDiscoveredDevices((prev) => {
          const filtered = prev.filter((d) => d.ip !== res.device!.ip);
          return [res.device!, ...filtered];
        });
        setDirectProbeFeedback({ type: 'success', text: res.message });
      } else {
        setDirectProbeFeedback({ type: 'info', text: res.message });
      }
    } catch (err: unknown) {
      const error = err as Error;
      setDirectProbeFeedback({ type: 'error', text: error.message });
    } finally {
      setIsProbingSingle(false);
    }
  };

  const handleCustomizeInManual = (dev: DiscoveredDevice) => {
    const profile: CameraBrand = dev.brand !== 'webcam' ? dev.brand : 'generic_onvif';
    setActiveTab('manual');
    setSourceType('commercial_ip');
    setSelectedBrand(profile);
    setName(customNames[dev.id] || dev.name);
    setLocation(customLocations[dev.id] || dev.locationSuggestion || '');
    setIpHost(dev.ip);
    setIpPort(dev.port || 554);
    setIpUser(dev.defaultUser || 'admin');
    setIpPass(customPasswords[dev.id] || dev.defaultPass || '');
  };

  useEffect(() => {
    if (isOpen && activeTab === 'auto_discovery' && !hasScanned) {
      fetchLocalNetworkSubnets().then((subs) => {
        if (subs.length > 0) {
          setDetectedLocalSubnets(subs);
        }
      });
      handlePerformScan();
    }
  }, [isOpen, activeTab, hasScanned, handlePerformScan]);

  useEffect(() => {
    if (!isOpen) {
      setHasScanned(false);
      setAddedDeviceIds(new Set());
      setDirectProbeFeedback(null);
    }
  }, [isOpen]);

  // Sync default port/user when switching RTSP profile without overwriting user-entered names
  useEffect(() => {
    const profileInfo = COMMERCIAL_BRANDS.find((b) => b.id === selectedBrand);
    if (sourceType === 'commercial_ip' && profileInfo) {
      setIpPort(profileInfo.defaultPort);
      setIpUser(profileInfo.defaultUser);
    }
  }, [sourceType, selectedBrand]);

  useEffect(() => {
    if (isOpen && sourceType === 'webcam') {
      navigator.mediaDevices
        ?.enumerateDevices()
        .then((allDevices) => {
          const videoDevs = allDevices.filter((d) => d.kind === 'videoinput');
          setDevices(videoDevs);
          if (videoDevs.length > 0 && !selectedDeviceId) {
            setSelectedDeviceId(videoDevs[0].deviceId);
          }
        })
        .catch(() => {});
    }
  }, [isOpen, sourceType, selectedDeviceId]);

  if (!isOpen) return null;

  const handleAddDiscoveredDevice = (dev: DiscoveredDevice) => {
    const assignedName = (customNames[dev.id] || dev.name).trim() || dev.ip;
    const assignedLocation = (customLocations[dev.id] || dev.locationSuggestion || '').trim() || 'Área Monitorada';
    const effectivePass = customPasswords[dev.id] ?? dev.defaultPass;
    const unitId = activeBusiness?.id || DEFAULT_UNIT_ID;

    let finalConfig: CameraConfig;

    if (dev.isLocalHardware && dev.deviceId) {
      finalConfig = {
        id: `cam-${Date.now()}`,
        tenantId: unitId,
        name: assignedName,
        location: assignedLocation,
        type: 'webcam',
        deviceId: dev.deviceId,
        enableAudio: true,
        soundAlarmEnabled: true,
        aiThreatAlertEnabled: true,
        nightVision: false,
        motionDetectionEnabled: true,
        motionSensitivity: 40,
        autoRecordOnMotion: true,
        autoRecordDuration: 15,
        recordingSchedule,
        digitalZoom: 1,
        pan: 0,
        tilt: 0,
        dateAdded: Date.now(),
      };
    } else {
      const profile = dev.brand !== 'webcam' ? dev.brand : 'generic_onvif';
      const rtspUrl = buildCommercialRTSPUrl(
        profile,
        dev.ip,
        dev.port,
        dev.defaultUser,
        effectivePass
      );

      finalConfig = {
        id: `cam-${Date.now()}`,
        tenantId: unitId,
        name: assignedName,
        location: assignedLocation,
        type: 'commercial_ip',
        brand: profile,
        ipHost: dev.ip,
        ipPort: dev.port,
        ipUser: dev.defaultUser,
        ipPass: effectivePass,
        ipChannel: 1,
        streamUrl: rtspUrl,
        enableAudio: false,
        soundAlarmEnabled: true,
        aiThreatAlertEnabled: true,
        nightVision: false,
        motionDetectionEnabled: true,
        motionSensitivity: 42,
        autoRecordOnMotion: true,
        autoRecordDuration: 15,
        recordingSchedule,
        digitalZoom: 1,
        pan: 0,
        tilt: 0,
        dateAdded: Date.now(),
      };
    }

    setAddedDeviceIds((prev) => new Set(prev).add(dev.id));
    onAddCamera(finalConfig);
    onClose();
  };

  const generatedRTSP = ipHost.trim()
    ? buildCommercialRTSPUrl(
        selectedBrand,
        ipHost,
        ipPort,
        ipUser,
        ipPass,
        ipChannel,
        ipSubtype
      )
    : '';

  const handleCopyRTSP = () => {
    if (!generatedRTSP) return;
    navigator.clipboard.writeText(generatedRTSP);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const handleSubmitManual = (e: React.FormEvent) => {
    e.preventDefault();
    const unitId = activeBusiness?.id || DEFAULT_UNIT_ID;

    const newCam: CameraConfig = {
      id: `cam-${Date.now()}`,
      tenantId: unitId,
      name: name.trim(),
      location: location.trim(),
      type: sourceType,
      brand: sourceType === 'commercial_ip' ? selectedBrand : undefined,
      ipHost: sourceType === 'commercial_ip' ? ipHost.trim() : undefined,
      ipPort: sourceType === 'commercial_ip' ? ipPort : undefined,
      ipUser: sourceType === 'commercial_ip' ? ipUser.trim() : undefined,
      ipPass: sourceType === 'commercial_ip' ? ipPass : undefined,
      ipChannel: sourceType === 'commercial_ip' ? ipChannel : undefined,
      deviceId: sourceType === 'webcam' ? selectedDeviceId : undefined,
      streamUrl: sourceType === 'ip_stream' ? streamUrl.trim() : generatedRTSP || undefined,
      enableAudio,
      soundAlarmEnabled,
      aiThreatAlertEnabled: true,
      nightVision: false,
      motionDetectionEnabled,
      motionSensitivity,
      autoRecordOnMotion,
      autoRecordDuration,
      recordingSchedule,
      digitalZoom: 1,
      pan: 0,
      tilt: 0,
      dateAdded: Date.now(),
    };

    onAddCamera(newCam);
    onClose();
  };

  const getDeviceBadge = (brand: string) => {
    if (brand === 'webcam') {
      return {
        bg: 'bg-purple-950/80 text-purple-300 border-purple-700/80',
        label: 'Webcam / USB',
      };
    }
    return {
      bg: 'bg-blue-950/80 text-blue-300 border-blue-700/80',
      label: 'RTSP / ONVIF',
    };
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-3xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-800 flex items-center justify-between bg-neutral-950/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-950 text-blue-400 border border-blue-800 shadow-sm">
              <Wifi className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-neutral-100">
                Adicionar Câmera de Segurança
              </h2>
              <p className="text-xs text-neutral-400">
                Unidade ativa:{' '}
                <strong className="text-neutral-200">{activeBusiness?.name || 'Unidade Principal'}</strong>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-neutral-100 rounded-lg hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Selector Tabs */}
        <div className="px-6 pt-2 flex items-center gap-4 border-b border-neutral-800 bg-neutral-950/30 text-xs">
          <button
            onClick={() => setActiveTab('auto_discovery')}
            className={`pb-2.5 px-2 font-medium transition-all flex items-center gap-2 border-b-2 whitespace-nowrap shrink-0 ${
              activeTab === 'auto_discovery'
                ? 'border-blue-500 text-blue-400 font-semibold'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            <span>Descoberta na Rede</span>
          </button>

          <button
            onClick={() => setActiveTab('manual')}
            className={`pb-2.5 px-2 font-medium transition-all flex items-center gap-2 border-b-2 whitespace-nowrap shrink-0 ${
              activeTab === 'manual'
                ? 'border-blue-500 text-blue-400 font-semibold'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Configuração Manual</span>
          </button>
        </div>

        {/* TAB 1: AUTO-DISCOVERY SCANNER (REAL TCP/RTSP/ONVIF PROBE) */}
        {activeTab === 'auto_discovery' && (
          <div className="p-6 overflow-y-auto space-y-5 text-xs text-neutral-300 flex-1">
            <div className="p-4 bg-neutral-950/70 rounded-xl border border-neutral-800 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-neutral-100 text-sm flex items-center gap-2">
                    <Radio className="w-4 h-4 text-blue-400" />
                    <span>Scanner de Rede Local (RTSP &amp; ONVIF)</span>
                  </h3>
                  <p className="text-[11px] text-neutral-400 mt-0.5">
                    Testa IPs da sub-rede nas portas 554, 8554, 8000, 37777 e 8899 com handshake RTSP para detectar apenas dispositivos reais ativos.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <select
                    value={selectedSubnet}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSelectedSubnet(val);
                      if (val !== 'custom') {
                        handlePerformScan(val);
                      }
                    }}
                    disabled={isScanning}
                    className="bg-neutral-900 border border-neutral-700 text-neutral-200 rounded-lg px-2.5 py-1.5 text-xs font-mono focus:border-blue-500 focus:outline-none"
                  >
                    {detectedLocalSubnets.map((sub) => (
                      <option key={sub.subnet} value={sub.subnet}>
                        {sub.subnet.replace('.0/24', '.x')} ({sub.iface})
                      </option>
                    ))}
                    <option value="192.168.1.0/24">192.168.1.x</option>
                    <option value="192.168.0.0/24">192.168.0.x</option>
                    <option value="192.168.15.0/24">192.168.15.x</option>
                    <option value="10.0.0.0/24">10.0.0.x</option>
                    <option value="all_common">Todas as faixas comuns</option>
                    <option value="custom">Faixa personalizada...</option>
                  </select>

                  <button
                    type="button"
                    onClick={() => handlePerformScan(selectedSubnet)}
                    disabled={isScanning}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium transition-all whitespace-nowrap shrink-0"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
                    <span>{isScanning ? 'Varrendo...' : 'Varrer Rede'}</span>
                  </button>
                </div>
              </div>

              {selectedSubnet === 'custom' && (
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
                  <input
                    type="text"
                    value={customSubnetInput}
                    onChange={(e) => setCustomSubnetInput(e.target.value)}
                    placeholder="192.168.2.0/24 ou 192.168.1.50-192.168.1.150"
                    className="flex-1 bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs font-mono text-neutral-100 focus:border-blue-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => handlePerformScan('custom')}
                    disabled={isScanning || !customSubnetInput.trim()}
                    className="px-3.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs font-medium text-neutral-100 disabled:opacity-50 whitespace-nowrap shrink-0"
                  >
                    Varrer Faixa
                  </button>
                </div>
              )}

              {isScanning && (
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-[11px] text-neutral-400 font-mono tabular-nums">
                    <span>
                      Sondando IPs na sub-rede {selectedSubnet === 'custom' ? customSubnetInput : selectedSubnet}...
                    </span>
                    <span>{scanProgress}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 transition-all duration-200"
                      style={{ width: `${scanProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {!isScanning && scanStats && (
                <div className="pt-2 border-t border-neutral-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px] text-neutral-400">
                  <div className="flex flex-wrap items-center gap-2 font-mono tabular-nums">
                    <span className="text-neutral-300">{scanStats.scannedCount} IPs sondados</span>
                    <span aria-hidden="true">·</span>
                    <span className={scanStats.rtspVerifiedCount > 0 ? 'text-emerald-400 font-medium' : 'text-neutral-400'}>
                      {scanStats.rtspVerifiedCount} streams RTSP verificados
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{scanStats.durationMs}ms</span>
                  </div>
                  <span className="text-neutral-500">{scanStats.message}</span>
                </div>
              )}
            </div>

            {/* Direct Single-IP RTSP Probe Bar */}
            <form
              onSubmit={handleProbeSingleIp}
              className="p-3.5 bg-neutral-950/50 rounded-xl border border-neutral-800 flex flex-col sm:flex-row sm:items-center gap-2.5"
            >
              <div className="flex-1 min-w-0">
                <label className="block text-[11px] font-medium text-neutral-300 mb-1">
                  Testar IP específico na rede local (Ping TCP + Handshake RTSP)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={directProbeIp}
                    onChange={(e) => setDirectProbeIp(e.target.value)}
                    placeholder="Endereço IP da câmera"
                    className="flex-1 bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs font-mono text-neutral-100 focus:border-blue-500 focus:outline-none"
                  />
                  <input
                    type="number"
                    value={directProbePort}
                    onChange={(e) => setDirectProbePort(parseInt(e.target.value, 10) || 554)}
                    className="w-20 bg-neutral-900 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-xs font-mono tabular-nums text-neutral-100 focus:border-blue-500 focus:outline-none"
                    title="Porta RTSP"
                  />
                  <button
                    type="submit"
                    disabled={isProbingSingle || !directProbeIp.trim()}
                    className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs font-medium text-neutral-100 disabled:opacity-50 whitespace-nowrap shrink-0 transition-colors"
                  >
                    {isProbingSingle ? 'Testando...' : 'Testar IP'}
                  </button>
                </div>
                {directProbeFeedback && (
                  <p
                    className={`mt-1.5 text-[11px] ${
                      directProbeFeedback.type === 'success'
                        ? 'text-emerald-400'
                        : directProbeFeedback.type === 'error'
                        ? 'text-red-400'
                        : 'text-neutral-400'
                    }`}
                  >
                    {directProbeFeedback.text}
                  </p>
                )}
              </div>
            </form>

            {/* Discovered Cameras List */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-neutral-200">
                  Dispositivos Detectados ({discoveredDevices.length})
                </span>
                <span className="text-[11px] text-neutral-400">
                  Somente equipamentos reais detectados na rede ou USB
                </span>
              </div>

              {discoveredDevices.length === 0 && !isScanning ? (
                <div className="p-8 text-center rounded-xl bg-neutral-950/40 border border-neutral-800 space-y-3">
                  <Server className="w-8 h-8 text-neutral-500 mx-auto" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-neutral-200">
                      Nenhum stream RTSP ou câmera USB detectado em {selectedSubnet === 'custom' ? customSubnetInput : selectedSubnet}
                    </p>
                    <p className="text-xs text-neutral-400 max-w-md mx-auto">
                      Verifique se a câmera está ligada com RTSP/ONVIF habilitado na mesma rede do servidor, teste outra sub-rede ou informe o IP diretamente acima.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handlePerformScan('all_common')}
                      className="px-3.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs font-medium text-neutral-200 transition-colors"
                    >
                      Varrer Todas as Faixas Comuns
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('manual')}
                      className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-medium text-white transition-colors"
                    >
                      Configurar Manualmente
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {discoveredDevices.map((dev) => {
                    const badge = getDeviceBadge(dev.brand);
                    const isAlreadyAdded =
                      dev.status === 'connected' || addedDeviceIds.has(dev.id);
                    const isExpandedPassword = expandedPasswordId === dev.id;

                    return (
                      <div
                        key={dev.id}
                        className={`p-4 rounded-xl border transition-all ${
                          isAlreadyAdded
                            ? 'bg-neutral-950/40 border-neutral-800 opacity-80'
                            : 'bg-neutral-900 border-neutral-800 hover:border-neutral-700'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="space-y-1.5 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded border uppercase ${badge.bg}`}
                              >
                                {badge.label}
                              </span>
                              <h4 className="font-semibold text-neutral-100 text-sm truncate">
                                {dev.name}
                              </h4>
                              {dev.rtspVerified && (
                                <span className="text-[11px] font-medium text-emerald-400">
                                  · RTSP Ativo
                                </span>
                              )}
                              {dev.isLocalHardware && (
                                <span className="text-[11px] text-purple-300 flex items-center gap-1">
                                  <Laptop className="w-3 h-3" />
                                  <span>Hardware Local</span>
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2 text-[11px] text-neutral-400 font-mono tabular-nums flex-wrap">
                              <span>IP: <strong className="text-neutral-200">{dev.ip}</strong></span>
                              {dev.port > 0 && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span>Porta: {dev.port}</span>
                                </>
                              )}
                              <span aria-hidden="true">·</span>
                              <span>Protocolo: <strong className="text-neutral-200">{dev.protocol}</strong></span>
                              {typeof dev.latencyMs === 'number' && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="text-emerald-400">Ping: {dev.latencyMs}ms</span>
                                </>
                              )}
                              {dev.openPorts && dev.openPorts.length > 0 && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span>Portas: {dev.openPorts.join(', ')}</span>
                                </>
                              )}
                            </div>

                            {!dev.isLocalHardware && (
                              <div className="text-[11px] font-mono text-neutral-400 truncate">
                                Stream: <span className="text-neutral-300">{dev.rtspTemplate}</span>
                              </div>
                            )}

                            <div className="flex flex-wrap items-center gap-3 pt-1">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] text-neutral-400">Nome:</span>
                                <input
                                  type="text"
                                  defaultValue={dev.name}
                                  onChange={(e) =>
                                    setCustomNames((prev) => ({
                                      ...prev,
                                      [dev.id]: e.target.value,
                                    }))
                                  }
                                  className="bg-neutral-950 border border-neutral-800 rounded px-2 py-0.5 text-[11px] text-neutral-200 focus:border-blue-500 focus:outline-none max-w-[180px]"
                                />
                              </div>

                              <div className="flex items-center gap-1.5">
                                <MapPin className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                                <span className="text-[11px] text-neutral-400">Local:</span>
                                <input
                                  type="text"
                                  placeholder="Setor / Ambiente"
                                  defaultValue={dev.locationSuggestion}
                                  onChange={(e) =>
                                    setCustomLocations((prev) => ({
                                      ...prev,
                                      [dev.id]: e.target.value,
                                    }))
                                  }
                                  className="bg-neutral-950 border border-neutral-800 rounded px-2 py-0.5 text-[11px] text-neutral-200 focus:border-blue-500 focus:outline-none max-w-[180px]"
                                />
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
                            {!dev.isLocalHardware && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleCustomizeInManual(dev)}
                                  className="px-2.5 py-1.5 rounded-lg border border-neutral-700/80 hover:border-neutral-600 text-neutral-300 hover:text-white text-xs transition-colors whitespace-nowrap shrink-0"
                                >
                                  Personalizar
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedPasswordId(isExpandedPassword ? null : dev.id)
                                  }
                                  className="px-2.5 py-1.5 rounded-lg border border-neutral-700/80 hover:border-neutral-600 text-neutral-400 hover:text-neutral-200 text-xs flex items-center gap-1 transition-colors whitespace-nowrap shrink-0"
                                >
                                  <KeyRound className="w-3.5 h-3.5" />
                                  <span className="hidden sm:inline">Senha</span>
                                </button>
                              </>
                            )}

                            {isAlreadyAdded ? (
                              <div className="px-3 py-1.5 rounded-lg bg-emerald-950/80 border border-emerald-800 text-emerald-400 font-semibold text-xs flex items-center gap-1.5 whitespace-nowrap shrink-0">
                                <Check className="w-4 h-4" />
                                <span>Já Adicionada</span>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleAddDiscoveredDevice(dev)}
                                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0"
                              >
                                <Plus className="w-4 h-4" />
                                <span>Adicionar</span>
                              </button>
                            )}
                          </div>
                        </div>

                        {isExpandedPassword && !dev.isLocalHardware && (
                          <div className="mt-3 pt-3 border-t border-neutral-800/80 flex items-center gap-3 bg-neutral-950/60 p-2.5 rounded-lg">
                            <span className="text-[11px] text-neutral-400">
                              Senha RTSP da Câmera:
                            </span>
                            <input
                              type="password"
                              placeholder="Digite a senha da câmera"
                              value={customPasswords[dev.id] || ''}
                              onChange={(e) =>
                                setCustomPasswords((prev) => ({
                                  ...prev,
                                  [dev.id]: e.target.value,
                                }))
                              }
                              className="bg-neutral-900 border border-neutral-700 rounded px-2.5 py-1 text-xs text-neutral-100 focus:border-blue-500 focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => handleAddDiscoveredDevice(dev)}
                              className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-medium whitespace-nowrap shrink-0"
                            >
                              Salvar e Conectar
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="p-3 bg-neutral-950/40 rounded-xl border border-neutral-800 text-[11px] text-neutral-400 flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-neutral-300">Varredura Real TCP/RTSP &amp; ONVIF:</strong> O servidor sonda IPs ativos na rede escolhida e verifica respostas RTSP/ONVIF reais.
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: MANUAL CONFIGURATION */}
        {activeTab === 'manual' && (
          <form
            onSubmit={handleSubmitManual}
            className="p-6 overflow-y-auto space-y-5 text-xs text-neutral-300 flex-1"
          >
            {/* Source Type Selector */}
            <div>
              <label className="block text-xs font-semibold text-neutral-200 mb-2">
                Tipo de Conexão
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setSourceType('commercial_ip')}
                  className={`p-3 rounded-xl border text-left transition-all flex flex-col gap-1 ${
                    sourceType === 'commercial_ip'
                      ? 'border-blue-500 bg-blue-950/40 text-blue-200 shadow-sm'
                      : 'border-neutral-800 bg-neutral-950/60 text-neutral-400 hover:border-neutral-700'
                  }`}
                >
                  <Server className="w-4 h-4 text-blue-400" />
                  <span className="font-semibold text-neutral-100 text-[11px]">Câmera IP (RTSP/ONVIF)</span>
                  <span className="text-[10px] text-neutral-400">Conexão direta por IP</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSourceType('webcam')}
                  className={`p-3 rounded-xl border text-left transition-all flex flex-col gap-1 ${
                    sourceType === 'webcam'
                      ? 'border-blue-500 bg-blue-950/40 text-blue-200 shadow-sm'
                      : 'border-neutral-800 bg-neutral-950/60 text-neutral-400 hover:border-neutral-700'
                  }`}
                >
                  <Video className="w-4 h-4 text-blue-400" />
                  <span className="font-semibold text-neutral-100 text-[11px]">Webcam / USB</span>
                  <span className="text-[10px] text-neutral-400">Câmera física local</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSourceType('ip_stream')}
                  className={`p-3 rounded-xl border text-left transition-all flex flex-col gap-1 ${
                    sourceType === 'ip_stream'
                      ? 'border-blue-500 bg-blue-950/40 text-blue-200 shadow-sm'
                      : 'border-neutral-800 bg-neutral-950/60 text-neutral-400 hover:border-neutral-700'
                  }`}
                >
                  <Globe className="w-4 h-4 text-blue-400" />
                  <span className="font-semibold text-neutral-100 text-[11px]">Stream URL IP</span>
                  <span className="text-[10px] text-neutral-400">Link direto HLS / MJPEG / MP4</span>
                </button>
              </div>
            </div>

            {/* General Fields: Name and Location */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">
                  Nome da Câmera
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Digite o nome de identificação"
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-neutral-100 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">
                  Localização / Setor
                </label>
                <input
                  type="text"
                  required
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Informe o ambiente ou ponto instalado"
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-neutral-100 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* RTSP Profile Configuration */}
            {sourceType === 'commercial_ip' && (
              <div className="p-4 bg-neutral-950/60 rounded-xl border border-neutral-800 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                    Perfil de Protocolo RTSP / ONVIF
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {COMMERCIAL_BRANDS.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => setSelectedBrand(b.id)}
                        className={`p-2.5 rounded-lg border text-left transition-colors ${
                          selectedBrand === b.id
                            ? 'border-blue-500 bg-blue-950/40 text-blue-200'
                            : 'border-neutral-800 bg-neutral-900 text-neutral-400 hover:border-neutral-700'
                        }`}
                      >
                        <span className="font-semibold block text-neutral-100">{b.name}</span>
                        <span className="text-[10px] text-neutral-400 line-clamp-1">
                          {b.protocolDescription}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="col-span-2">
                    <label className="block text-[11px] text-neutral-400 mb-1">IP Local da Câmera</label>
                    <input
                      type="text"
                      required
                      value={ipHost}
                      onChange={(e) => setIpHost(e.target.value)}
                      placeholder="192.168.1.x"
                      className="w-full px-2.5 py-1.5 bg-neutral-900 border border-neutral-700 rounded text-neutral-100 font-mono text-xs focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-neutral-400 mb-1">Porta RTSP</label>
                    <input
                      type="number"
                      value={ipPort}
                      onChange={(e) => setIpPort(parseInt(e.target.value, 10) || 554)}
                      className="w-full px-2.5 py-1.5 bg-neutral-900 border border-neutral-700 rounded text-neutral-100 font-mono text-xs focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-neutral-400 mb-1">Canal</label>
                    <input
                      type="number"
                      min="1"
                      value={ipChannel}
                      onChange={(e) => setIpChannel(parseInt(e.target.value, 10) || 1)}
                      className="w-full px-2.5 py-1.5 bg-neutral-900 border border-neutral-700 rounded text-neutral-100 font-mono text-xs focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] text-neutral-400 mb-1">Usuário RTSP</label>
                    <input
                      type="text"
                      value={ipUser}
                      onChange={(e) => setIpUser(e.target.value)}
                      placeholder="admin"
                      className="w-full px-2.5 py-1.5 bg-neutral-900 border border-neutral-700 rounded text-neutral-100 text-xs focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-neutral-400 mb-1">Senha da Câmera</label>
                    <input
                      type="password"
                      value={ipPass}
                      onChange={(e) => setIpPass(e.target.value)}
                      placeholder="Senha RTSP"
                      className="w-full px-2.5 py-1.5 bg-neutral-900 border border-neutral-700 rounded text-neutral-100 text-xs focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-neutral-400 mb-1">Sub-stream</label>
                    <select
                      value={ipSubtype}
                      onChange={(e) => setIpSubtype(parseInt(e.target.value, 10) || 0)}
                      className="w-full px-2.5 py-1.5 bg-neutral-900 border border-neutral-700 rounded text-neutral-100 text-xs focus:border-blue-500 focus:outline-none"
                    >
                      <option value={0}>Principal (HD/Full HD)</option>
                      <option value={1}>Secundário (Sub-stream)</option>
                    </select>
                  </div>
                </div>

                {generatedRTSP && (
                  <div className="pt-2 border-t border-neutral-800">
                    <div className="flex items-center justify-between text-[11px] text-neutral-400 mb-1">
                      <span>URL RTSP Montada:</span>
                      <button
                        type="button"
                        onClick={handleCopyRTSP}
                        className="text-blue-400 hover:underline flex items-center gap-1"
                      >
                        {copiedUrl ? <Check className="w-3 h-3" /> : null}
                        <span>{copiedUrl ? 'Copiado!' : 'Copiar URL'}</span>
                      </button>
                    </div>
                    <div className="p-2 bg-neutral-900 rounded border border-neutral-800 font-mono text-[11px] text-neutral-300 break-all">
                      {generatedRTSP}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Webcam Selector */}
            {sourceType === 'webcam' && (
              <div className="p-4 bg-neutral-950/60 rounded-xl border border-neutral-800 space-y-3">
                <label className="block text-xs font-medium text-neutral-300">
                  Dispositivo de Câmera Local
                </label>
                {devices.length > 0 ? (
                  <select
                    value={selectedDeviceId}
                    onChange={(e) => setSelectedDeviceId(e.target.value)}
                    className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-neutral-100 text-xs focus:border-blue-500 focus:outline-none"
                  >
                    {devices.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || `Câmera ${d.deviceId.slice(0, 8)}`}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-neutral-400 text-xs">
                    Nenhuma câmera física detectada. Permita o acesso à câmera no navegador.
                  </p>
                )}
              </div>
            )}

            {/* IP Stream Direct URL */}
            {sourceType === 'ip_stream' && (
              <div className="p-4 bg-neutral-950/60 rounded-xl border border-neutral-800 space-y-3">
                <label className="block text-xs font-medium text-neutral-300">
                  URL Direta do Stream (HTTPS / HLS / MJPEG / MP4)
                </label>
                <input
                  type="text"
                  required
                  value={streamUrl}
                  onChange={(e) => setStreamUrl(e.target.value)}
                  placeholder="https://servidor-local:8080/live/stream.m3u8"
                  className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-neutral-100 font-mono text-xs focus:border-blue-500 focus:outline-none"
                />
              </div>
            )}

            {/* Smart Detection & Alarm Settings */}
            <div className="p-4 bg-neutral-950/60 rounded-xl border border-neutral-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-blue-400" />
                  <span className="font-semibold text-neutral-200">Detecção de Movimento</span>
                </div>
                <input
                  type="checkbox"
                  checked={motionDetectionEnabled}
                  onChange={(e) => setMotionDetectionEnabled(e.target.checked)}
                  className="rounded bg-neutral-800 border-neutral-700 text-blue-600 focus:ring-0"
                />
              </div>

              {motionDetectionEnabled && (
                <>
                  <div>
                    <div className="flex justify-between items-center text-xs text-neutral-400 mb-1">
                      <span>Sensibilidade do Sensor de Movimento</span>
                      <span className="font-mono tabular-nums">{motionSensitivity}%</span>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="90"
                      value={motionSensitivity}
                      onChange={(e) => setMotionSensitivity(parseInt(e.target.value, 10))}
                      className="w-full accent-blue-500 h-1 bg-neutral-700 rounded-lg cursor-pointer"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-neutral-800/80">
                    <span className="text-xs text-neutral-300">
                      Gravar automaticamente ao detectar movimento
                    </span>
                    <input
                      type="checkbox"
                      checked={autoRecordOnMotion}
                      onChange={(e) => setAutoRecordOnMotion(e.target.checked)}
                      className="rounded bg-neutral-800 border-neutral-700 text-blue-600 focus:ring-0"
                    />
                  </div>

                  {autoRecordOnMotion && (
                    <div className="flex items-center justify-between pt-1 border-t border-neutral-800/80">
                      <span className="text-xs text-neutral-300">Duração por evento (segundos)</span>
                      <input
                        type="number"
                        min={5}
                        max={120}
                        value={autoRecordDuration}
                        onChange={(e) => setAutoRecordDuration(parseInt(e.target.value, 10) || 15)}
                        className="w-20 bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-xs font-mono text-neutral-100"
                      />
                    </div>
                  )}
                </>
              )}

              <div className="flex items-center justify-between pt-2 border-t border-neutral-800/80">
                <div className="flex items-center gap-2">
                  <Volume2 className="w-3.5 h-3.5 text-blue-400" />
                  <div>
                    <span className="text-xs text-neutral-200">Alarme Sonoro &amp; Sirene de Ameaça IA</span>
                    <p className="text-[10px] text-neutral-400">
                      Ativa sirene quando a IA identificar Ameaça Alta nesta câmera
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={soundAlarmEnabled}
                  onChange={(e) => setSoundAlarmEnabled(e.target.checked)}
                  className="rounded bg-neutral-800 border-neutral-700 text-blue-600 focus:ring-0"
                />
              </div>

              {sourceType === 'webcam' && (
                <div className="flex items-center justify-between pt-2 border-t border-neutral-800/80">
                  <span className="text-xs text-neutral-300">Capturar áudio do microfone local</span>
                  <input
                    type="checkbox"
                    checked={enableAudio}
                    onChange={(e) => setEnableAudio(e.target.checked)}
                    className="rounded bg-neutral-800 border-neutral-700 text-blue-600 focus:ring-0"
                  />
                </div>
              )}
            </div>

            {/* Recording Schedule */}
            <CameraScheduleEditor
              schedule={recordingSchedule}
              onChange={setRecordingSchedule}
              compact
            />

            {/* Footer Submit */}
            <div className="pt-2 flex items-center justify-end gap-3 border-t border-neutral-800">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-neutral-400 hover:text-neutral-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-5 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors shadow-lg shadow-blue-900/30 whitespace-nowrap shrink-0"
              >
                Adicionar Câmera
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
