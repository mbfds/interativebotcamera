import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Video,
  Globe,
  Settings,
  Server,
  Plus,
  Check,
  Building,
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
  SimulationPreset,
  ClientBusiness,
  DiscoveredDevice,
} from '../types/camera';
import {
  COMMERCIAL_BRANDS,
  CameraBrand,
  buildCommercialRTSPUrl,
} from '../utils/commercialCameras';
import { scanLocalNetworkCameras } from '../utils/networkDiscovery';

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
  // Navigation mode: Auto-Discovery (easiest) or Manual Setup (advanced)
  const [activeTab, setActiveTab] = useState<'auto_discovery' | 'manual'>('auto_discovery');

  // ----------------------------------------------------
  // AUTO-DISCOVERY STATE
  // ----------------------------------------------------
  const [selectedSubnet, setSelectedSubnet] = useState<string>('192.168.1.0/24');
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanProgress, setScanProgress] = useState<number>(0);
  const [discoveredDevices, setDiscoveredDevices] = useState<DiscoveredDevice[]>([]);
  const [hasScanned, setHasScanned] = useState<boolean>(false);
  const [expandedPasswordId, setExpandedPasswordId] = useState<string | null>(null);
  const [customPasswords, setCustomPasswords] = useState<Record<string, string>>({});
  const [customLocations, setCustomLocations] = useState<Record<string, string>>({});
  const [addedDeviceIds, setAddedDeviceIds] = useState<Set<string>>(new Set());

  // ----------------------------------------------------
  // MANUAL CONFIGURATION STATE
  // ----------------------------------------------------
  const [sourceType, setSourceType] = useState<CameraSourceType>('commercial_ip');
  const [selectedBrand, setSelectedBrand] = useState<CameraBrand>('intelbras');
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');

  // Commercial camera inputs
  const [ipHost, setIpHost] = useState('192.168.1.100');
  const [ipPort, setIpPort] = useState(554);
  const [ipUser, setIpUser] = useState('admin');
  const [ipPass, setIpPass] = useState('');
  const [ipChannel, setIpChannel] = useState(1);
  const [ipSubtype, setIpSubtype] = useState(0);

  // Other types
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [streamUrl, setStreamUrl] = useState('');
  const [simulationPreset, setSimulationPreset] = useState<SimulationPreset>('entrance');
  const [enableAudio, setEnableAudio] = useState(false);
  const [soundAlarmEnabled, setSoundAlarmEnabled] = useState(true);
  const [motionDetectionEnabled, setMotionDetectionEnabled] = useState(true);
  const [motionSensitivity, setMotionSensitivity] = useState(42);
  const [autoRecordOnMotion, setAutoRecordOnMotion] = useState(true);
  const [autoRecordDuration, setAutoRecordDuration] = useState(15);
  const [copiedUrl, setCopiedUrl] = useState(false);

  // Trigger Network Discovery Scan
  const handlePerformScan = useCallback(
    async (subnetToScan: string = selectedSubnet) => {
      setIsScanning(true);
      setScanProgress(15);

      const progressTimer = setInterval(() => {
        setScanProgress((prev) => {
          if (prev >= 90) return prev;
          return prev + 15;
        });
      }, 120);

      try {
        const result = await scanLocalNetworkCameras({
          subnet: subnetToScan,
          existingCameras,
        });

        clearInterval(progressTimer);
        setScanProgress(100);

        setTimeout(() => {
          setDiscoveredDevices(result.devices);
          setIsScanning(false);
          setHasScanned(true);
        }, 200);
      } catch (err) {
        clearInterval(progressTimer);
        setIsScanning(false);
        setHasScanned(true);
        console.error('Scan error:', err);
      }
    },
    [selectedSubnet, existingCameras]
  );

  // Auto-scan on modal open when in auto-discovery tab
  useEffect(() => {
    if (isOpen && activeTab === 'auto_discovery' && !hasScanned) {
      handlePerformScan();
    }
  }, [isOpen, activeTab, hasScanned, handlePerformScan]);

  // Reset scan state on reopen
  useEffect(() => {
    if (!isOpen) {
      setHasScanned(false);
      setAddedDeviceIds(new Set());
    }
  }, [isOpen]);

  // Auto-generate name when switching brand in manual tab
  useEffect(() => {
    const brandInfo = COMMERCIAL_BRANDS.find((b) => b.id === selectedBrand);
    if (sourceType === 'commercial_ip' && brandInfo) {
      setName(`${brandInfo.name} - Frente de Loja`);
      setLocation('Balcão / Caixa');
      setIpPort(brandInfo.defaultPort);
      setIpUser(brandInfo.defaultUser);
    } else if (sourceType === 'webcam') {
      setName('Webcam do Computador');
      setLocation('Terminal Local');
    } else if (sourceType === 'ip_stream') {
      setName('Câmera IP Stream');
      setLocation('Área Geral');
    }
  }, [sourceType, selectedBrand]);

  // Enumerate user camera devices when manual webcam is selected
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

  // 1-CLICK ADD CAMERA FROM DISCOVERY
  const handleAddDiscoveredDevice = (dev: DiscoveredDevice) => {
    const assignedLocation = customLocations[dev.id] || dev.locationSuggestion || 'Área Geral';
    const effectivePass = customPasswords[dev.id] ?? dev.defaultPass;

    let finalConfig: CameraConfig;

    if (dev.isLocalHardware && dev.deviceId) {
      // Physical local webcam
      finalConfig = {
        id: `cam-${Date.now()}`,
        tenantId: activeBusiness?.id || 'biz-demo-1',
        name: dev.name,
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
        digitalZoom: 1,
        pan: 0,
        tilt: 0,
        dateAdded: Date.now(),
      };
    } else {
      // Commercial IP / ONVIF camera discovered on network
      const commercialBrand = dev.brand !== 'webcam' ? dev.brand : 'generic_onvif';
      const rtspUrl = buildCommercialRTSPUrl(
        commercialBrand,
        dev.ip,
        dev.port,
        dev.defaultUser,
        effectivePass
      );

      finalConfig = {
        id: `cam-${Date.now()}`,
        tenantId: activeBusiness?.id || 'biz-demo-1',
        name: dev.name,
        location: assignedLocation,
        type: 'commercial_ip',
        brand: commercialBrand,
        ipHost: dev.ip,
        ipPort: dev.port,
        ipUser: dev.defaultUser,
        ipPass: effectivePass,
        ipChannel: 1,
        streamUrl: rtspUrl,
        simulationPreset: dev.simulationPreset || 'entrance',
        enableAudio: false,
        soundAlarmEnabled: true,
        aiThreatAlertEnabled: true,
        nightVision: false,
        motionDetectionEnabled: true,
        motionSensitivity: 42,
        autoRecordOnMotion: true,
        autoRecordDuration: 15,
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

  // Manual Form Submission
  const generatedRTSP = buildCommercialRTSPUrl(
    selectedBrand,
    ipHost,
    ipPort,
    ipUser,
    ipPass,
    ipChannel,
    ipSubtype
  );

  const handleCopyRTSP = () => {
    navigator.clipboard.writeText(generatedRTSP);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const handleSubmitManual = (e: React.FormEvent) => {
    e.preventDefault();

    const newCam: CameraConfig = {
      id: `cam-${Date.now()}`,
      tenantId: activeBusiness?.id || 'biz-demo-1',
      name: name.trim() || 'Nova Câmera',
      location: location.trim() || 'Área Geral',
      type: sourceType,
      brand: sourceType === 'commercial_ip' ? selectedBrand : undefined,
      ipHost: sourceType === 'commercial_ip' ? ipHost : undefined,
      ipPort: sourceType === 'commercial_ip' ? ipPort : undefined,
      ipUser: sourceType === 'commercial_ip' ? ipUser : undefined,
      ipPass: sourceType === 'commercial_ip' ? ipPass : undefined,
      ipChannel: sourceType === 'commercial_ip' ? ipChannel : undefined,
      deviceId: sourceType === 'webcam' ? selectedDeviceId : undefined,
      streamUrl: sourceType === 'ip_stream' ? streamUrl.trim() : generatedRTSP,
      simulationPreset:
        sourceType === 'commercial_ip' || sourceType === 'simulated' ? simulationPreset : undefined,
      enableAudio,
      soundAlarmEnabled,
      aiThreatAlertEnabled: true,
      nightVision: false,
      motionDetectionEnabled,
      motionSensitivity,
      autoRecordOnMotion,
      autoRecordDuration,
      digitalZoom: 1,
      pan: 0,
      tilt: 0,
      dateAdded: Date.now(),
    };

    onAddCamera(newCam);
    onClose();
  };

  const getBrandBadge = (brand: string) => {
    switch (brand) {
      case 'intelbras':
        return {
          bg: 'bg-emerald-950/80 text-emerald-300 border-emerald-700/80',
          label: 'Intelbras',
        };
      case 'tapo':
        return {
          bg: 'bg-cyan-950/80 text-cyan-300 border-cyan-700/80',
          label: 'TP-Link Tapo',
        };
      case 'hikvision':
        return {
          bg: 'bg-rose-950/80 text-rose-300 border-rose-700/80',
          label: 'Hikvision',
        };
      case 'dahua':
        return {
          bg: 'bg-orange-950/80 text-orange-300 border-orange-700/80',
          label: 'Dahua / IMOU',
        };
      case 'yoosee':
        return {
          bg: 'bg-amber-950/80 text-amber-300 border-amber-700/80',
          label: 'Yoosee Wi-Fi',
        };
      case 'webcam':
        return {
          bg: 'bg-purple-950/80 text-purple-300 border-purple-700/80',
          label: 'Webcam / USB',
        };
      default:
        return {
          bg: 'bg-blue-950/80 text-blue-300 border-blue-700/80',
          label: 'ONVIF IP',
        };
    }
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
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-neutral-100">
                  Adicionar Câmera de Segurança
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 border border-emerald-800 text-emerald-400 font-semibold">
                  1-CLIQUE
                </span>
              </div>
              <p className="text-xs text-neutral-400">
                Conectando ao comércio:{' '}
                <strong className="text-neutral-200">{activeBusiness?.name || 'Comércio Ativo'}</strong>
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
            className={`pb-2.5 px-2 font-medium transition-all flex items-center gap-2 border-b-2 ${
              activeTab === 'auto_discovery'
                ? 'border-blue-500 text-blue-400 font-semibold'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            <span>Descoberta na Rede (Mais Fácil)</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-950 text-blue-300 border border-blue-800">
              Recomendado
            </span>
          </button>

          <button
            onClick={() => setActiveTab('manual')}
            className={`pb-2.5 px-2 font-medium transition-all flex items-center gap-2 border-b-2 ${
              activeTab === 'manual'
                ? 'border-blue-500 text-blue-400 font-semibold'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Configuração Manual (Avançado)</span>
          </button>
        </div>

        {/* ======================================================== */}
        {/* TAB 1: AUTO-DISCOVERY SCANNER (1-CLICK USER EXPERIENCE)  */}
        {/* ======================================================== */}
        {activeTab === 'auto_discovery' && (
          <div className="p-6 overflow-y-auto space-y-5 text-xs text-neutral-300 flex-1">
            {/* Network Subnet Selector & Scan Action */}
            <div className="p-4 bg-neutral-950/70 rounded-xl border border-neutral-800 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-neutral-100 text-sm flex items-center gap-2">
                    <Radio className="w-4 h-4 text-blue-400" />
                    <span>Varredura de Câmeras na Mesma Rede Local</span>
                  </h3>
                  <p className="text-[11px] text-neutral-400 mt-0.5">
                    Pesquisa automática de câmeras Intelbras, Tapo, Hikvision, Dahua, Yoosee e Webcams conectadas ao seu Wi-Fi/rede cabeada.
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <select
                    value={selectedSubnet}
                    onChange={(e) => {
                      setSelectedSubnet(e.target.value);
                      handlePerformScan(e.target.value);
                    }}
                    disabled={isScanning}
                    className="bg-neutral-900 border border-neutral-700 text-neutral-200 rounded-lg px-2.5 py-1.5 text-xs font-mono focus:border-blue-500 focus:outline-none"
                  >
                    <option value="192.168.1.0/24">192.168.1.x (Padrão)</option>
                    <option value="192.168.0.0/24">192.168.0.x (Claro/Net)</option>
                    <option value="192.168.15.0/24">192.168.15.x (Vivo)</option>
                    <option value="10.0.0.0/24">10.0.0.x (Empresarial)</option>
                  </select>

                  <button
                    onClick={() => handlePerformScan(selectedSubnet)}
                    disabled={isScanning}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium transition-all shadow-md shadow-blue-900/30"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
                    <span>{isScanning ? 'Varrendo...' : 'Pesquisar'}</span>
                  </button>
                </div>
              </div>

              {/* Progress Bar during Scanning */}
              {isScanning && (
                <div className="space-y-1.5 pt-1 animate-fade-in">
                  <div className="flex items-center justify-between text-[11px] text-neutral-400 font-mono">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
                      Consultando broadcast ONVIF, portas 554, 8000, 37777, 8899 e webcams...
                    </span>
                    <span>{scanProgress}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-600 to-cyan-400 transition-all duration-200"
                      style={{ width: `${scanProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Discovered Cameras List */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-neutral-200 tracking-wide uppercase">
                  Dispositivos Encontrados ({discoveredDevices.length})
                </span>
                <span className="text-[11px] text-neutral-400">
                  Clique em <strong>Adicionar com 1 Clique</strong> para conectar imediatamente ao comércio
                </span>
              </div>

              {discoveredDevices.length === 0 && !isScanning ? (
                <div className="p-10 text-center rounded-xl bg-neutral-950/40 border border-neutral-800 space-y-2">
                  <Server className="w-8 h-8 text-neutral-500 mx-auto" />
                  <p className="text-sm font-medium text-neutral-300">
                    Nenhuma câmera encontrada na sub-rede {selectedSubnet}
                  </p>
                  <p className="text-xs text-neutral-400 max-w-sm mx-auto">
                    Certifique-se de que as câmeras estão ligadas e na mesma rede Wi-Fi, ou altere a faixa de IP acima.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {discoveredDevices.map((dev) => {
                    const badge = getBrandBadge(dev.brand);
                    const isAlreadyAdded =
                      dev.status === 'connected' || addedDeviceIds.has(dev.id);
                    const isExpandedPassword = expandedPasswordId === dev.id;

                    return (
                      <div
                        key={dev.id}
                        className={`p-4 rounded-xl border transition-all ${
                          isAlreadyAdded
                            ? 'bg-neutral-950/40 border-neutral-800 opacity-80'
                            : 'bg-neutral-900 border-neutral-800 hover:border-neutral-700 hover:shadow-lg'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          {/* Left: Brand, Model, Details */}
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded border uppercase ${badge.bg}`}
                              >
                                {badge.label}
                              </span>
                              <h4 className="font-semibold text-neutral-100 text-sm">
                                {dev.name}
                              </h4>
                              {dev.isLocalHardware && (
                                <span className="text-[10px] text-purple-300 flex items-center gap-1">
                                  <Laptop className="w-3 h-3" />
                                  <span>Hardware Local</span>
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-3 text-[11px] text-neutral-400 font-mono flex-wrap">
                              <span>IP: <strong className="text-neutral-300">{dev.ip}</strong></span>
                              {dev.port > 0 && <span>Porta: {dev.port}</span>}
                              <span>Protocolo: <strong className="text-neutral-300">{dev.protocol}</strong></span>
                              {dev.latencyMs && (
                                <span className="text-emerald-400">Ping: {dev.latencyMs}ms</span>
                              )}
                              {dev.macAddress && (
                                <span className="text-neutral-500">MAC: {dev.macAddress}</span>
                              )}
                            </div>

                            {/* Location suggestion / in-place label */}
                            <div className="flex items-center gap-2 pt-1">
                              <MapPin className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                              <span className="text-[11px] text-neutral-400">Local na Loja:</span>
                              <input
                                type="text"
                                placeholder={dev.locationSuggestion}
                                defaultValue={dev.locationSuggestion}
                                onChange={(e) =>
                                  setCustomLocations((prev) => ({
                                    ...prev,
                                    [dev.id]: e.target.value,
                                  }))
                                }
                                className="bg-neutral-950 border border-neutral-800 rounded px-2 py-0.5 text-[11px] text-neutral-200 focus:border-blue-500 focus:outline-none max-w-[200px]"
                              />
                            </div>
                          </div>

                          {/* Right: Actions */}
                          <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
                            {!dev.isLocalHardware && (
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedPasswordId(isExpandedPassword ? null : dev.id)
                                }
                                className="px-2.5 py-1.5 rounded-lg border border-neutral-700/80 hover:border-neutral-600 text-neutral-400 hover:text-neutral-200 text-xs flex items-center gap-1 transition-colors"
                                title="Editar senha da câmera se diferente da padrão de fábrica"
                              >
                                <KeyRound className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">Senha</span>
                              </button>
                            )}

                            {isAlreadyAdded ? (
                              <div className="px-3 py-1.5 rounded-lg bg-emerald-950/80 border border-emerald-800 text-emerald-400 font-semibold text-xs flex items-center gap-1.5">
                                <Check className="w-4 h-4" />
                                <span>Já Adicionada</span>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleAddDiscoveredDevice(dev)}
                                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs flex items-center gap-1.5 transition-all shadow-md shadow-blue-900/30 hover:shadow-blue-800/50"
                              >
                                <Plus className="w-4 h-4" />
                                <span>Adicionar com 1 Clique</span>
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Optional Custom Password Drawer */}
                        {isExpandedPassword && !dev.isLocalHardware && (
                          <div className="mt-3 pt-3 border-t border-neutral-800/80 flex items-center gap-3 animate-fade-in bg-neutral-950/60 p-2.5 rounded-lg">
                            <span className="text-[11px] text-neutral-400">
                              Senha da Câmera (padrão: <code>{dev.defaultPass}</code>):
                            </span>
                            <input
                              type="password"
                              placeholder={dev.defaultPass}
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
                              className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-medium"
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

            {/* Quick helper tip */}
            <div className="p-3 bg-neutral-950/40 rounded-xl border border-neutral-800 text-[11px] text-neutral-400 flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-neutral-300">Como funciona a Descoberta Automática:</strong> O Sentinela NVR envia uma requisição de detecção às portas padrões (ONVIF 554, 8000, 37777, 8899) e mapeia os modelos comerciais compatíveis com seu roteador local. Ao clicar em <em>Adicionar com 1 Clique</em>, todos os parâmetros técnicos de gravação e inteligência artificial são configurados automaticamente.
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 2: MANUAL CONFIGURATION (ADVANCED / TECHNICAL USERS)  */}
        {/* ======================================================== */}
        {activeTab === 'manual' && (
          <form
            onSubmit={handleSubmitManual}
            className="p-6 overflow-y-auto space-y-5 text-xs text-neutral-300 flex-1"
          >
            {/* Source Type Selector */}
            <div>
              <label className="block text-xs font-semibold text-neutral-200 mb-2">
                Tipo de Conexão Manual
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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
                  <span className="font-semibold text-neutral-100 text-[11px]">Câmera Comercial</span>
                  <span className="text-[10px] text-neutral-400">Intelbras, Hikvision, Tapo</span>
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
                  <span className="text-[10px] text-neutral-400">Link direto HLS / MJPEG</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSourceType('simulated')}
                  className={`p-3 rounded-xl border text-left transition-all flex flex-col gap-1 ${
                    sourceType === 'simulated'
                      ? 'border-blue-500 bg-blue-950/40 text-blue-200 shadow-sm'
                      : 'border-neutral-800 bg-neutral-950/60 text-neutral-400 hover:border-neutral-700'
                  }`}
                >
                  <Settings className="w-4 h-4 text-blue-400" />
                  <span className="font-semibold text-neutral-100 text-[11px]">CCTV Simulado</span>
                  <span className="text-[10px] text-neutral-400">Fluxo de teste</span>
                </button>
              </div>
            </div>

            {/* General Fields: Name and Location */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">
                  Nome Identificador da Câmera
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Câmera Caixa 01"
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-neutral-100 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">
                  Localização no Estabelecimento
                </label>
                <input
                  type="text"
                  required
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Ex: Balcão Principal, Estacionamento"
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-neutral-100 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Commercial IP Camera specifics */}
            {sourceType === 'commercial_ip' && (
              <div className="p-4 bg-neutral-950/60 rounded-xl border border-neutral-800 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                    Marca do Fabricante
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
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
                        <span className="text-[10px] text-neutral-400 line-clamp-1">{b.popularModels}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="col-span-2">
                    <label className="block text-[11px] text-neutral-400 mb-1">IP Local da Câmera</label>
                    <input
                      type="text"
                      value={ipHost}
                      onChange={(e) => setIpHost(e.target.value)}
                      placeholder="192.168.1.100"
                      className="w-full px-2.5 py-1.5 bg-neutral-900 border border-neutral-700 rounded text-neutral-100 font-mono text-xs focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-neutral-400 mb-1">Porta RTSP</label>
                    <input
                      type="number"
                      value={ipPort}
                      onChange={(e) => setIpPort(parseInt(e.target.value) || 554)}
                      className="w-full px-2.5 py-1.5 bg-neutral-900 border border-neutral-700 rounded text-neutral-100 font-mono text-xs focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-neutral-400 mb-1">Canal</label>
                    <input
                      type="number"
                      min="1"
                      value={ipChannel}
                      onChange={(e) => setIpChannel(parseInt(e.target.value) || 1)}
                      className="w-full px-2.5 py-1.5 bg-neutral-900 border border-neutral-700 rounded text-neutral-100 font-mono text-xs focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-neutral-400 mb-1">Usuário</label>
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
                      placeholder="Senha ou Chave de Verificação"
                      className="w-full px-2.5 py-1.5 bg-neutral-900 border border-neutral-700 rounded text-neutral-100 text-xs focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Generated RTSP URL Preview */}
                <div className="pt-2 border-t border-neutral-800">
                  <div className="flex items-center justify-between text-[11px] text-neutral-400 mb-1">
                    <span>URL RTSP Gerada Automaticamente:</span>
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
              </div>
            )}

            {/* Webcam Selector */}
            {sourceType === 'webcam' && (
              <div className="p-4 bg-neutral-950/60 rounded-xl border border-neutral-800 space-y-3">
                <label className="block text-xs font-medium text-neutral-300">
                  Selecione o Dispositivo de Câmera Local
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
                  URL Direta do Stream (HLS, MJPEG, RTSP-HTTP ou MP4)
                </label>
                <input
                  type="text"
                  required
                  value={streamUrl}
                  onChange={(e) => setStreamUrl(e.target.value)}
                  placeholder="https://meu-dvr.ddns.net:8080/live.mjpg"
                  className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-neutral-100 font-mono text-xs focus:border-blue-500 focus:outline-none"
                />
              </div>
            )}

            {/* Simulated Preset */}
            {sourceType === 'simulated' && (
              <div className="p-4 bg-neutral-950/60 rounded-xl border border-neutral-800 space-y-3">
                <label className="block text-xs font-medium text-neutral-300">
                  Cenário de Vigilância Comercial
                </label>
                <select
                  value={simulationPreset}
                  onChange={(e) => setSimulationPreset(e.target.value as SimulationPreset)}
                  className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-neutral-100 text-xs focus:border-blue-500 focus:outline-none"
                >
                  <option value="entrance">Entrada Principal / Portaria da Loja</option>
                  <option value="parking">Estacionamento / Pátio de Clientes</option>
                  <option value="hallway">Corredor de Produtos &amp; Prateleiras</option>
                  <option value="perimeter">Perímetro Externo &amp; Retaguarda</option>
                </select>
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
                      onChange={(e) => setMotionSensitivity(parseInt(e.target.value))}
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
                </>
              )}

              {/* Sound alert setting */}
              <div className="flex items-center justify-between pt-2 border-t border-neutral-800/80">
                <div className="flex items-center gap-2">
                  <Volume2 className="w-3.5 h-3.5 text-blue-400" />
                  <div>
                    <span className="text-xs text-neutral-200">Alarme Sonoro &amp; Sirene de Ameaça IA</span>
                    <p className="text-[10px] text-neutral-400">
                      Ativa sirene de emergência quando a IA identificar Ameaça Alta nesta câmera
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
            </div>

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
                className="px-5 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors shadow-lg shadow-blue-900/30"
              >
                Adicionar Câmera Manualmente
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
