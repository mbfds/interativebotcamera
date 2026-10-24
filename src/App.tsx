import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield,
  Video,
  Grid2X2,
  Maximize,
  HardDrive,
  Plus,
  Bell,
  CheckCircle2,
  Film,
  Camera,
  Layers,
  Sparkles,
  Cloud,
  Building2,
  Wifi,
} from 'lucide-react';
import { User } from 'firebase/auth';
import {
  CameraConfig,
  RecordingItem,
  MotionEvent,
  GridViewMode,
  CloudStorageDestination,
  ClientBusiness,
  AISecurityAnalysis,
  AIDailyReport,
} from './types/camera';
import {
  getStoredBusinesses,
  saveBusinessToDB,
  deleteBusinessFromDB,
  getStoredCameras,
  saveCameraToDB,
  deleteCameraFromDB,
  getStoredRecordings,
  saveRecordingToDB,
  deleteRecordingFromDB,
  clearAllRecordingsFromDB,
  getStoredEvents,
  clearAllEventsFromDB,
  getStorageStats,
  DEFAULT_BUSINESS_ID,
} from './services/db';
import {
  initAuth,
  googleSignIn,
  uploadRecordingToDrive,
  deleteRecordingFromDrive,
} from './services/googleDrive';
import { Navbar } from './components/Navbar';
import { CameraFeed } from './components/CameraFeed';
import { AddCameraModal } from './components/AddCameraModal';
import { RecordingsGallery } from './components/RecordingsGallery';
import { CameraManagerModal } from './components/CameraManagerModal';
import { MotionLogPanel } from './components/MotionLogPanel';
import { CloudStorageModal } from './components/CloudStorageModal';
import { ClientBusinessModal } from './components/ClientBusinessModal';
import { AISecurityInspectorModal } from './components/AISecurityInspectorModal';

export default function App() {
  const [currentTab, setCurrentTab] = useState<'monitor' | 'recordings'>('monitor');
  const [businesses, setBusinesses] = useState<ClientBusiness[]>([]);
  const [activeBusinessId, setActiveBusinessId] = useState<string>(() => {
    return localStorage.getItem('nvr_active_biz') || DEFAULT_BUSINESS_ID;
  });

  const [cameras, setCameras] = useState<CameraConfig[]>([]);
  const [recordings, setRecordings] = useState<RecordingItem[]>([]);
  const [motionEvents, setMotionEvents] = useState<MotionEvent[]>([]);
  const [gridView, setGridView] = useState<GridViewMode>('2x2');
  const [focusedCameraId, setFocusedCameraId] = useState<string | null>(null);

  // Sound Alarm toggle
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  // Cloud & Google Drive State
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [cloudDestination, setCloudDestination] = useState<CloudStorageDestination>(() => {
    return (localStorage.getItem('nvr_cloud_dest') as CloudStorageDestination) || 'local';
  });
  const [autoSyncToCloud, setAutoSyncToCloud] = useState<boolean>(() => {
    return localStorage.getItem('nvr_auto_sync') !== 'false';
  });
  const [isUploadingId, setIsUploadingId] = useState<string | null>(null);

  // AI Security Analysis State
  const [aiAnalysis, setAiAnalysis] = useState<AISecurityAnalysis | null>(null);
  const [aiSnapshotUrl, setAiSnapshotUrl] = useState<string | null>(null);
  const [aiSelectedCamera, setAiSelectedCamera] = useState<CameraConfig | null>(null);
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false);
  const [dailyReport, setDailyReport] = useState<AIDailyReport | null>(null);
  const [isDailyReportLoading, setIsDailyReportLoading] = useState<boolean>(false);
  const [cameraThreats, setCameraThreats] = useState<
    Record<
      string,
      {
        level: 'alto' | 'medio' | 'baixo';
        score: number;
        reason?: string;
        timestamp: number;
      }
    >
  >({});

  // Modals & Drawers
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [isManagerModalOpen, setIsManagerModalOpen] = useState<boolean>(false);
  const [isMotionLogOpen, setIsMotionLogOpen] = useState<boolean>(false);
  const [isCloudModalOpen, setIsCloudModalOpen] = useState<boolean>(false);
  const [isBusinessModalOpen, setIsBusinessModalOpen] = useState<boolean>(false);
  const [isAiInspectorOpen, setIsAiInspectorOpen] = useState<boolean>(false);

  // Storage Stats & Toast
  const [storageUsageBytes, setStorageUsageBytes] = useState<number>(0);
  const [toastMessage, setToastMessage] = useState<{ title: string; subtitle?: string } | null>(null);

  const activeBusiness = businesses.find((b) => b.id === activeBusinessId) || businesses[0] || null;

  // Save cloud preferences
  const handleChangeCloudDestination = (dest: CloudStorageDestination) => {
    setCloudDestination(dest);
    localStorage.setItem('nvr_cloud_dest', dest);
  };

  const handleToggleAutoSync = (enabled: boolean) => {
    setAutoSyncToCloud(enabled);
    localStorage.setItem('nvr_auto_sync', enabled ? 'true' : 'false');
  };

  const handleSelectBusiness = (id: string) => {
    setActiveBusinessId(id);
    localStorage.setItem('nvr_active_biz', id);
    setFocusedCameraId(null);
  };

  // Toast auto-dismiss
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  // Initialize Firebase Auth listener
  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser, token) => {
        setUser(currentUser);
        setAccessToken(token);

        // If user email matches any client business, select that business
        if (currentUser?.email) {
          getStoredBusinesses().then((bizList) => {
            const matched = bizList.find((b) => b.ownerEmail.toLowerCase() === currentUser.email?.toLowerCase());
            if (matched) {
              setActiveBusinessId(matched.id);
              localStorage.setItem('nvr_active_biz', matched.id);
            }
          });
        }
      },
      () => {
        setUser(null);
        setAccessToken(null);
      }
    );
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  // Load Data for Active Business
  const refreshRecordings = useCallback(async () => {
    try {
      const recs = await getStoredRecordings(activeBusinessId);
      setRecordings(recs);
      const stats = await getStorageStats(activeBusinessId);
      setStorageUsageBytes(stats.totalBytes);
      return recs;
    } catch (err) {
      console.error('Failed to load recordings:', err);
      return [];
    }
  }, [activeBusinessId]);

  const refreshEvents = useCallback(async () => {
    try {
      const evts = await getStoredEvents(activeBusinessId);
      setMotionEvents(evts);
    } catch (err) {
      console.error('Failed to load events:', err);
    }
  }, [activeBusinessId]);

  const refreshCameras = useCallback(async () => {
    try {
      const storedCams = await getStoredCameras(activeBusinessId);
      setCameras(storedCams);
    } catch (err) {
      console.error('Failed to load cameras:', err);
    }
  }, [activeBusinessId]);

  useEffect(() => {
    const initData = async () => {
      try {
        const storedBusinesses = await getStoredBusinesses();
        setBusinesses(storedBusinesses);
        await refreshCameras();
        await refreshRecordings();
        await refreshEvents();
      } catch (err) {
        console.error('Initialization error:', err);
      }
    };
    initData();
  }, [activeBusinessId, refreshCameras, refreshRecordings, refreshEvents]);

  // Business Handlers
  const handleAddBusiness = async (biz: ClientBusiness) => {
    await saveBusinessToDB(biz);
    setBusinesses((prev) => [...prev, biz]);
    setActiveBusinessId(biz.id);
    localStorage.setItem('nvr_active_biz', biz.id);
    setToastMessage({
      title: 'Comércio Cadastrado',
      subtitle: `${biz.name} agora possui ambiente isolado de CFTV.`,
    });
  };

  const handleDeleteBusiness = async (id: string) => {
    await deleteBusinessFromDB(id);
    const updated = businesses.filter((b) => b.id !== id);
    setBusinesses(updated);
    if (activeBusinessId === id && updated.length > 0) {
      setActiveBusinessId(updated[0].id);
      localStorage.setItem('nvr_active_biz', updated[0].id);
    }
  };

  // Upload single recording to Google Drive
  const handleUploadToDrive = async (recording: RecordingItem) => {
    let token = accessToken;
    if (!token) {
      try {
        const res = await googleSignIn();
        if (res) {
          setUser(res.user);
          setAccessToken(res.accessToken);
          token = res.accessToken;
          setCloudDestination('google_drive');
        } else {
          return;
        }
      } catch (err) {
        alert('Não foi possível autenticar com o Google Drive.');
        return;
      }
    }

    if (!token) return;

    setIsUploadingId(recording.id);
    try {
      const { fileId, webViewLink } = await uploadRecordingToDrive(recording, token);
      const updatedRec: RecordingItem = {
        ...recording,
        driveFileId: fileId,
        driveViewLink: webViewLink,
        syncStatus: 'synced',
      };
      await saveRecordingToDB(updatedRec);
      await refreshRecordings();
      setToastMessage({
        title: 'Vídeo Salvo no Google Drive!',
        subtitle: `Arquivo salvo na pasta "Sentinela NVR - Gravações".`,
      });
    } catch (err: unknown) {
      const error = err as Error;
      alert(`Erro ao enviar para Google Drive: ${error.message}`);
    } finally {
      setIsUploadingId(null);
    }
  };

  // AI Frame Analysis Handler
  const handleAnalyzeWithAI = async (camera: CameraConfig, frameBase64: string) => {
    setAiSnapshotUrl(frameBase64);
    setAiSelectedCamera(camera);
    setIsAiInspectorOpen(true);
    setIsAiLoading(true);

    try {
      const currentHour = new Date().getHours();
      const isAfterHours = currentHour < 7 || currentHour >= 21;

      const response = await fetch('/api/ai/analyze-frame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: frameBase64,
          cameraName: camera.name,
          location: camera.location,
          businessName: activeBusiness?.name,
          businessType: activeBusiness?.businessType,
          isAfterHours,
        }),
      });

      if (!response.ok) {
        throw new Error(`Falha na API: ${response.statusText}`);
      }

      const data = await response.json();
      const newAnalysis: AISecurityAnalysis = {
        threatLevel: data.threatLevel || 'baixo',
        threatScore: data.threatScore || 15,
        summary: data.summary || 'Ambiente monitorado sem intercorrências.',
        detectedElements: data.detectedElements || ['Ambiente comercial'],
        securityConcerns: data.securityConcerns || [],
        recommendations: data.recommendations || ['Manter rotina padrão'],
        occupancyEstimate: data.occupancyEstimate || 0,
        timestamp: Date.now(),
        cameraName: camera.name,
      };
      setAiAnalysis(newAnalysis);

      // If Threat Level is 'alto' (or threatScore >= 70), activate the camera threat alert
      if (data.threatLevel === 'alto' || (data.threatScore && data.threatScore >= 70)) {
        const topReason =
          data.securityConcerns?.[0] || data.summary || 'Ameaça de segurança alta detectada pela IA';
        setCameraThreats((prev) => ({
          ...prev,
          [camera.id]: {
            level: 'alto',
            score: data.threatScore || 85,
            reason: topReason,
            timestamp: Date.now(),
          },
        }));

        setToastMessage({
          title: `🚨 Alerta IA: Ameaça Alta em ${camera.name}!`,
          subtitle: `Nível crítico (${data.threatScore || 85}/100): ${topReason}`,
        });
      }
    } catch (err: unknown) {
      const error = err as Error;
      console.error('AI analysis error:', error);
      setAiAnalysis({
        threatLevel: 'baixo',
        threatScore: 10,
        summary: 'Análise de segurança padrão concluída. ' + error.message,
        detectedElements: ['Câmera em operação normal'],
        securityConcerns: [],
        recommendations: ['Monitorar movimentação periódica'],
        occupancyEstimate: 0,
        timestamp: Date.now(),
        cameraName: camera.name,
      });
    } finally {
      setIsAiLoading(false);
    }
  };

  // AI Daily Report Generator
  const handleGenerateDailyReport = async () => {
    setIsDailyReportLoading(true);
    try {
      const response = await fetch('/api/ai/daily-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName: activeBusiness?.name,
          events: motionEvents,
          totalRecordings: recordings.length,
          cameraCount: cameras.length,
        }),
      });

      if (!response.ok) {
        throw new Error('Falha ao gerar relatório');
      }

      const data = await response.json();
      setDailyReport(data);
    } catch (err) {
      console.error('Daily report generation error:', err);
    } finally {
      setIsDailyReportLoading(false);
    }
  };

  // Add Camera Handler
  const handleAddCamera = async (newCam: CameraConfig) => {
    const camWithTenant = { ...newCam, tenantId: activeBusinessId };
    await saveCameraToDB(camWithTenant);
    setCameras((prev) => [...prev, camWithTenant]);
    setToastMessage({
      title: 'Câmera Adicionada',
      subtitle: `${newCam.name} conectada ao ${activeBusiness?.name}.`,
    });
  };

  // Update Camera Handler
  const handleUpdateCamera = async (updatedCam: CameraConfig) => {
    await saveCameraToDB(updatedCam);
    setCameras((prev) => prev.map((c) => (c.id === updatedCam.id ? updatedCam : c)));
  };

  // Delete Camera Handler
  const handleDeleteCamera = async (id: string) => {
    await deleteCameraFromDB(id);
    setCameras((prev) => prev.filter((c) => c.id !== id));
    if (focusedCameraId === id) setFocusedCameraId(null);
  };

  // Recording Saved Notification & Auto-upload to Drive if enabled
  const handleRecordingSaved = async () => {
    const updatedRecs = await refreshRecordings();

    // Check if auto-sync to Google Drive is active
    if (cloudDestination === 'google_drive' && autoSyncToCloud && accessToken && updatedRecs.length > 0) {
      const latestRec = updatedRecs[0];
      if (latestRec && !latestRec.driveFileId) {
        try {
          setIsUploadingId(latestRec.id);
          const { fileId, webViewLink } = await uploadRecordingToDrive(latestRec, accessToken);
          const syncedRec: RecordingItem = {
            ...latestRec,
            driveFileId: fileId,
            driveViewLink: webViewLink,
            syncStatus: 'synced',
          };
          await saveRecordingToDB(syncedRec);
          await refreshRecordings();

          setToastMessage({
            title: 'Gravação Salva e Enviada!',
            subtitle: `Sincronizada no Google Drive do ${activeBusiness?.name}.`,
          });
          return;
        } catch (err) {
          console.error('Auto upload to Drive failed:', err);
        } finally {
          setIsUploadingId(null);
        }
      }
    }

    setToastMessage({
      title: 'Gravação Salva com Sucesso!',
      subtitle: 'O vídeo foi armazenado no banco de dados local.',
    });
  };

  // Delete Recording Handler (with Drive deletion if exists)
  const handleDeleteRecording = async (id: string) => {
    const recToDelete = recordings.find((r) => r.id === id);
    if (recToDelete?.driveFileId && accessToken) {
      try {
        await deleteRecordingFromDrive(recToDelete.driveFileId, accessToken);
      } catch (err) {
        console.warn('Could not delete file from Google Drive:', err);
      }
    }
    await deleteRecordingFromDB(id);
    await refreshRecordings();
  };

  // Clear All Recordings Handler
  const handleClearAllRecordings = async () => {
    await clearAllRecordingsFromDB(activeBusinessId);
    await refreshRecordings();
    setToastMessage({
      title: 'Gravações Limpas',
      subtitle: `As gravações do comércio foram liberadas.`,
    });
  };

  // Motion Event Logged
  const handleMotionEventLogged = (event: MotionEvent) => {
    setMotionEvents((prev) => [event, ...prev.slice(0, 49)]);
  };

  // Clear Events
  const handleClearEvents = async () => {
    await clearAllEventsFromDB(activeBusinessId);
    setMotionEvents([]);
  };

  // Grid layout column classes
  const getGridClasses = () => {
    if (focusedCameraId) return 'grid-cols-1';
    switch (gridView) {
      case '1x1':
        return 'grid-cols-1';
      case '3x3':
        return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';
      case 'list':
        return 'grid-cols-1 max-w-4xl mx-auto';
      case '2x2':
      default:
        return 'grid-cols-1 lg:grid-cols-2';
    }
  };

  const formatFileSize = (bytes: number) => {
    if (!bytes) return '0 KB';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="min-h-screen bg-[#0b0f17] text-neutral-200 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      {/* 3-Zone Top Bar */}
      <Navbar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        recordingCount={recordings.length}
        motionEventCount={motionEvents.length}
        soundEnabled={soundEnabled}
        onToggleSound={() => setSoundEnabled(!soundEnabled)}
        onOpenAddModal={() => setIsAddModalOpen(true)}
        onOpenManagerModal={() => setIsManagerModalOpen(true)}
        onOpenMotionLog={() => setIsMotionLogOpen(true)}
        onOpenCloudModal={() => setIsCloudModalOpen(true)}
        onOpenBusinessModal={() => setIsBusinessModalOpen(true)}
        onOpenAIModal={() => {
          if (cameras.length > 0) {
            // Trigger inspection on first camera
            setAiSelectedCamera(cameras[0]);
            setIsAiInspectorOpen(true);
          } else {
            setIsAiInspectorOpen(true);
          }
        }}
        activeBusiness={activeBusiness}
        cloudDestination={cloudDestination}
        isGoogleConnected={!!user}
        gridView={gridView}
        onChangeGridView={setGridView}
      />

      {/* Main Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        {/* Floating Notification Toast */}
        {toastMessage && (
          <div className="fixed bottom-6 right-6 z-50 p-4 bg-neutral-900 border border-neutral-700/80 rounded-2xl shadow-2xl flex items-center gap-3 animate-slide-up max-w-md">
            <div className="p-2 rounded-xl bg-emerald-950 text-emerald-400 border border-emerald-800">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <h4 className="text-xs font-semibold text-neutral-100">{toastMessage.title}</h4>
              {toastMessage.subtitle && (
                <p className="text-[11px] text-neutral-400 mt-0.5">{toastMessage.subtitle}</p>
              )}
            </div>
            {currentTab !== 'recordings' && (
              <button
                onClick={() => {
                  setCurrentTab('recordings');
                  setToastMessage(null);
                }}
                className="px-2.5 py-1 text-xs text-blue-400 hover:text-blue-300 font-medium"
              >
                Ver
              </button>
            )}
          </div>
        )}

        {/* Tab 1: Live Monitoring */}
        {currentTab === 'monitor' && (
          <div className="space-y-4">
            {/* Monitor Sub-Header: Store Info, Grid Selector & AI Quick Button */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-2 border-b border-neutral-800/80">
              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => setIsBusinessModalOpen(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-xs text-neutral-200 transition-colors"
                  title="Trocar comércio cliente"
                >
                  <Building2 className="w-3.5 h-3.5 text-blue-400" />
                  <span className="font-semibold">{activeBusiness?.name}</span>
                </button>
                <span className="text-neutral-500">·</span>
                <span className="font-mono tabular-nums text-xs text-neutral-400">
                  {cameras.length} {cameras.length === 1 ? 'câmera ativa' : 'câmeras ativas'}
                </span>
                {focusedCameraId && (
                  <button
                    onClick={() => setFocusedCameraId(null)}
                    className="text-xs text-blue-400 hover:underline"
                  >
                    (Voltar à grade completa)
                  </button>
                )}
              </div>

              {/* Grid Layout Switcher & Cloud Indicator */}
              <div className="flex items-center gap-2.5">
                {/* AI Security Inspection Shortcut */}
                <button
                  onClick={() => {
                    if (cameras.length > 0) {
                      setAiSelectedCamera(cameras[0]);
                      setIsAiInspectorOpen(true);
                    } else {
                      setIsAddModalOpen(true);
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-950/70 hover:bg-purple-900/80 border border-purple-800/80 text-xs text-purple-300 font-medium transition-colors shadow-sm"
                  title="Abrir auditoria de segurança com IA para este comércio"
                >
                  <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                  <span>Auditar com IA</span>
                </button>

                <button
                  onClick={() => setIsCloudModalOpen(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-xs text-neutral-300 transition-colors"
                >
                  <Cloud className={`w-3.5 h-3.5 ${user ? 'text-emerald-400' : 'text-neutral-400'}`} />
                  <span className="text-[11px]">
                    Destino: <strong className="text-neutral-200">{cloudDestination === 'google_drive' ? 'Drive' : 'Local'}</strong>
                  </span>
                </button>

                <div className="flex items-center gap-1 bg-neutral-900 p-1 rounded-xl border border-neutral-800">
                  <button
                    onClick={() => {
                      setFocusedCameraId(null);
                      setGridView('1x1');
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono transition-colors ${
                      gridView === '1x1' && !focusedCameraId
                        ? 'bg-neutral-800 text-white font-semibold'
                        : 'text-neutral-400 hover:text-neutral-200'
                    }`}
                    title="Foco em 1 Câmera"
                  >
                    1x1
                  </button>
                  <button
                    onClick={() => {
                      setFocusedCameraId(null);
                      setGridView('2x2');
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono transition-colors ${
                      gridView === '2x2' && !focusedCameraId
                        ? 'bg-neutral-800 text-white font-semibold'
                        : 'text-neutral-400 hover:text-neutral-200'
                    }`}
                    title="Grade 2x2"
                  >
                    2x2
                  </button>
                  <button
                    onClick={() => {
                      setFocusedCameraId(null);
                      setGridView('3x3');
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono transition-colors ${
                      gridView === '3x3' && !focusedCameraId
                        ? 'bg-neutral-800 text-white font-semibold'
                        : 'text-neutral-400 hover:text-neutral-200'
                    }`}
                    title="Grade 3x3"
                  >
                    3x3
                  </button>
                </div>
              </div>
            </div>

            {/* Empty Cameras Fallback */}
            {cameras.length === 0 ? (
              <div className="p-16 text-center rounded-2xl bg-neutral-900/60 border border-neutral-800 space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-blue-950/60 text-blue-400 border border-blue-800 flex items-center justify-center mx-auto">
                  <Video className="w-7 h-7" />
                </div>
                <h3 className="text-base font-semibold text-neutral-100">
                  Nenhuma câmera cadastrada para {activeBusiness?.name}
                </h3>
                <p className="text-xs text-neutral-400 max-w-md mx-auto">
                  Localize e conecte automaticamente câmeras do seu comércio (Intelbras, Tapo, Hikvision, Dahua, Yoosee ou Webcams) conectadas à sua rede local com 1 clique.
                </p>
                <div className="pt-2 flex flex-wrap justify-center gap-3">
                  <button
                    onClick={() => setIsAddModalOpen(true)}
                    className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition-all shadow-lg shadow-blue-900/30 hover:scale-[1.02]"
                  >
                    <Wifi className="w-4 h-4 text-cyan-300" />
                    <span>Buscar Câmeras na Minha Rede (1-Clique)</span>
                  </button>
                </div>
              </div>
            ) : (
              /* Grid of Cameras */
              <div className={`grid gap-4 ${getGridClasses()}`}>
                {(focusedCameraId
                  ? cameras.filter((c) => c.id === focusedCameraId)
                  : cameras
                ).map((camera) => (
                  <CameraFeed
                    key={camera.id}
                    camera={camera}
                    onUpdateCamera={handleUpdateCamera}
                    onRecordingSaved={handleRecordingSaved}
                    onMotionEventLogged={handleMotionEventLogged}
                    soundEnabled={soundEnabled}
                    isFocused={focusedCameraId === camera.id}
                    onToggleFocus={() =>
                      setFocusedCameraId(focusedCameraId === camera.id ? null : camera.id)
                    }
                    onAnalyzeAI={handleAnalyzeWithAI}
                    externalThreatAlert={cameraThreats[camera.id] || null}
                    onDismissThreatAlert={() => {
                      setCameraThreats((prev) => {
                        const copy = { ...prev };
                        delete copy[camera.id];
                        return copy;
                      });
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Saved Recordings */}
        {currentTab === 'recordings' && (
          <RecordingsGallery
            recordings={recordings}
            cameras={cameras}
            user={user}
            accessToken={accessToken}
            cloudDestination={cloudDestination}
            onDeleteRecording={handleDeleteRecording}
            onClearAllRecordings={handleClearAllRecordings}
            onNavigateToMonitor={() => setCurrentTab('monitor')}
            onUploadToDrive={handleUploadToDrive}
            isUploadingId={isUploadingId}
            onOpenCloudModal={() => setIsCloudModalOpen(true)}
          />
        )}
      </main>

      {/* Storage & Information Footer */}
      <footer className="border-t border-neutral-800/80 bg-neutral-950 py-4 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-neutral-500">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-neutral-400">{activeBusiness?.name}</span>
            <span>·</span>
            <span>Administração Inteligente com IA &amp; Armazenamento Isolado</span>
          </div>

          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 font-mono tabular-nums">
              <HardDrive className="w-3.5 h-3.5 text-neutral-400" />
              <span>Espaço: {formatFileSize(storageUsageBytes)}</span>
            </span>
            <span>·</span>
            <button
              onClick={() => setIsCloudModalOpen(true)}
              className="flex items-center gap-1 text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              <Cloud className="w-3.5 h-3.5" />
              <span>Drive: {user ? 'Conectado' : 'Local'}</span>
            </button>
            <span>·</span>
            <button
              onClick={() => setIsBusinessModalOpen(true)}
              className="hover:text-neutral-300 transition-colors flex items-center gap-1"
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Trocar Comércio</span>
            </button>
          </div>
        </div>
      </footer>

      {/* Modals and Drawers */}
      <AddCameraModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAddCamera={handleAddCamera}
        activeBusiness={activeBusiness}
        existingCameras={cameras}
      />

      <CameraManagerModal
        isOpen={isManagerModalOpen}
        onClose={() => setIsManagerModalOpen(false)}
        cameras={cameras}
        onUpdateCamera={handleUpdateCamera}
        onDeleteCamera={handleDeleteCamera}
        onOpenAddModal={() => setIsAddModalOpen(true)}
      />

      <MotionLogPanel
        isOpen={isMotionLogOpen}
        onClose={() => setIsMotionLogOpen(false)}
        events={motionEvents}
        onClearEvents={handleClearEvents}
        onNavigateToRecordings={() => setCurrentTab('recordings')}
      />

      <CloudStorageModal
        isOpen={isCloudModalOpen}
        onClose={() => setIsCloudModalOpen(false)}
        user={user}
        accessToken={accessToken}
        onAuthChange={(u, token) => {
          setUser(u);
          setAccessToken(token);
        }}
        cloudDestination={cloudDestination}
        onChangeCloudDestination={handleChangeCloudDestination}
        autoSyncToCloud={autoSyncToCloud}
        onToggleAutoSync={handleToggleAutoSync}
        recordings={recordings}
        onRecordingsUpdated={refreshRecordings}
      />

      <ClientBusinessModal
        isOpen={isBusinessModalOpen}
        onClose={() => setIsBusinessModalOpen(false)}
        businesses={businesses}
        activeBusinessId={activeBusinessId}
        onSelectBusiness={handleSelectBusiness}
        onAddBusiness={handleAddBusiness}
        onDeleteBusiness={handleDeleteBusiness}
      />

      <AISecurityInspectorModal
        isOpen={isAiInspectorOpen}
        onClose={() => setIsAiInspectorOpen(false)}
        analysis={aiAnalysis}
        snapshotUrl={aiSnapshotUrl}
        camera={aiSelectedCamera}
        business={activeBusiness}
        isLoading={isAiLoading}
        onReanalyze={() => {
          if (aiSelectedCamera && aiSnapshotUrl) {
            handleAnalyzeWithAI(aiSelectedCamera, aiSnapshotUrl);
          }
        }}
        onGenerateDailyReport={handleGenerateDailyReport}
        dailyReport={dailyReport}
        isLoadingDailyReport={isDailyReportLoading}
      />
    </div>
  );
}
