import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield,
  Video,
  HardDrive,
  CheckCircle2,
  Sparkles,
  Cloud,
  Building2,
  Wifi,
  Activity,
  ShieldCheck,
  Users,
  LogOut,
  Plus,
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
  DetectedObjectTag,
  UserRole,
  AuthUser,
} from './types/camera';
import {
  purgeAllLegacyDemoData,
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
  DEFAULT_UNIT_ID,
} from './services/db';
import {
  initAuth,
  googleSignIn,
  uploadRecordingToDrive,
  deleteRecordingFromDrive,
} from './services/googleDrive';
import {
  fetchAuthStatus,
  logoutSession,
  getAuthHeaders,
  setAuthToken,
} from './services/auth';
import { LoginScreen } from './components/LoginScreen';
import { Navbar } from './components/Navbar';
import { CameraFeed } from './components/CameraFeed';
import { AddCameraModal } from './components/AddCameraModal';
import { RecordingsGallery } from './components/RecordingsGallery';
import { CameraManagerModal } from './components/CameraManagerModal';
import { MotionLogPanel } from './components/MotionLogPanel';
import { CloudStorageModal } from './components/CloudStorageModal';
import { ClientBusinessModal } from './components/ClientBusinessModal';
import { AISecurityInspectorModal } from './components/AISecurityInspectorModal';
import { SystemDiagnosticsPanel } from './components/SystemDiagnosticsPanel';
import { UserRoleModal } from './components/UserRoleModal';
import { sendHighThreatBrowserNotification } from './utils/browserNotifications';
import { extractDetectedObjectTags } from './utils/detectedObjects';

export default function App() {
  // Authentication gate state
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [needsSetup, setNeedsSetup] = useState<boolean>(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);

  const [currentTab, setCurrentTab] = useState<'monitor' | 'recordings'>('monitor');
  const [businesses, setBusinesses] = useState<ClientBusiness[]>([]);
  const [activeBusinessId, setActiveBusinessId] = useState<string>(() => {
    return localStorage.getItem('nvr_active_biz') || DEFAULT_UNIT_ID;
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
  const [cameraLatestAiTags, setCameraLatestAiTags] = useState<
    Record<
      string,
      {
        detectedObjects: DetectedObjectTag[];
        detectedElements: string[];
        summary?: string;
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
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState<boolean>(false);
  const [isRoleModalOpen, setIsRoleModalOpen] = useState<boolean>(false);

  // Storage Stats & Toast
  const [storageUsageBytes, setStorageUsageBytes] = useState<number>(0);
  const [toastMessage, setToastMessage] = useState<{ title: string; subtitle?: string } | null>(null);

  // Clean up any legacy role cache key from pre-auth builds
  useEffect(() => {
    localStorage.removeItem('sentinela_user_role');
  }, []);

  // Check session authentication on boot
  useEffect(() => {
    let active = true;
    const bootstrapAuth = async () => {
      try {
        await purgeAllLegacyDemoData();
        const status = await fetchAuthStatus();
        if (!active) return;
        setNeedsSetup(status.needsSetup);
        setAuthUser(status.user);
      } catch (err) {
        console.error('Auth bootstrap error:', err);
      } finally {
        if (active) setAuthLoading(false);
      }
    };
    bootstrapAuth();
    return () => {
      active = false;
    };
  }, []);

  const handleAuthenticated = async (loggedUser: AuthUser, initialUnitName?: string) => {
    setAuthUser(loggedUser);
    setNeedsSetup(false);
    await purgeAllLegacyDemoData();

    const existingUnits = await getStoredBusinesses();
    if (existingUnits.length === 0 && initialUnitName?.trim()) {
      const unit: ClientBusiness = {
        id: DEFAULT_UNIT_ID,
        name: initialUnitName.trim(),
        ownerEmail: loggedUser.email || '',
        businessType: 'general',
        address: '',
        dateCreated: Date.now(),
      };
      await saveBusinessToDB(unit);
      setBusinesses([unit]);
      setActiveBusinessId(unit.id);
      localStorage.setItem('nvr_active_biz', unit.id);
    } else if (existingUnits.length > 0) {
      setBusinesses(existingUnits);
      const validActive = existingUnits.some((u) => u.id === activeBusinessId)
        ? activeBusinessId
        : existingUnits[0].id;
      setActiveBusinessId(validActive);
      localStorage.setItem('nvr_active_biz', validActive);
    }

    setToastMessage({
      title: `Bem-vindo, ${loggedUser.name}`,
      subtitle:
        loggedUser.role === 'admin'
          ? 'Sessão autenticada com perfil Administrador.'
          : 'Sessão autenticada com perfil Operador.',
    });
  };

  const handleLogout = async () => {
    await logoutSession();
    setAuthToken(null);
    setAuthUser(null);
    setIsRoleModalOpen(false);
    setIsAddModalOpen(false);
    setIsManagerModalOpen(false);
    setIsBusinessModalOpen(false);
    setIsCloudModalOpen(false);
    setIsAiInspectorOpen(false);
  };

  const currentUserRole: UserRole = authUser?.role || 'operador';
  const activeBusiness = businesses.find((b) => b.id === activeBusinessId) || businesses[0] || null;

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

  // Initialize Firebase Google Drive OAuth listener
  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser, token) => {
        setUser(currentUser);
        setAccessToken(token);
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

  // Load Data for Active Unit
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
    if (!authUser) return;
    const initData = async () => {
      try {
        await purgeAllLegacyDemoData();
        const storedUnits = await getStoredBusinesses();
        setBusinesses(storedUnits);
        if (storedUnits.length > 0 && !storedUnits.some((u) => u.id === activeBusinessId)) {
          setActiveBusinessId(storedUnits[0].id);
          localStorage.setItem('nvr_active_biz', storedUnits[0].id);
        }
        await refreshCameras();
        await refreshRecordings();
        await refreshEvents();
      } catch (err) {
        console.error('Initialization error:', err);
      }
    };
    initData();
  }, [authUser, activeBusinessId, refreshCameras, refreshRecordings, refreshEvents]);

  // Unit Handlers (Admin only)
  const handleAddBusiness = async (unit: ClientBusiness) => {
    if (currentUserRole !== 'admin') return;
    await saveBusinessToDB(unit);
    setBusinesses((prev) => [...prev, unit]);
    setActiveBusinessId(unit.id);
    localStorage.setItem('nvr_active_biz', unit.id);
    setToastMessage({
      title: 'Unidade Cadastrada',
      subtitle: `${unit.name} ativada no ambiente de monitoramento.`,
    });
  };

  const handleDeleteBusiness = async (id: string) => {
    if (currentUserRole !== 'admin') return;
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
      } catch {
        setToastMessage({
          title: 'Autenticação Google Drive',
          subtitle: 'Não foi possível autenticar com o Google Drive.',
        });
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
        title: 'Vídeo Salvo no Google Drive',
        subtitle: `Arquivo salvo na pasta "Sentinela NVR - Gravações".`,
      });
    } catch (err: unknown) {
      const error = err as Error;
      setToastMessage({
        title: 'Erro no Upload',
        subtitle: error.message,
      });
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
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          imageBase64: frameBase64,
          cameraName: camera.name,
          location: camera.location,
          businessName: activeBusiness?.name,
          businessType: activeBusiness?.businessType,
          isAfterHours,
        }),
      });

      if (response.status === 401) {
        await handleLogout();
        return;
      }

      if (!response.ok) {
        throw new Error(`Falha na API: ${response.statusText}`);
      }

      const data = await response.json();
      const detectedElements: string[] = data.detectedElements || ['Ambiente monitorado'];
      const detectedObjects = extractDetectedObjectTags({
        explicitTags: data.detectedObjects,
        detectedElements,
        texts: [data.summary, ...(data.securityConcerns || [])],
      });

      const newAnalysis: AISecurityAnalysis = {
        threatLevel: data.threatLevel || 'baixo',
        threatScore: data.threatScore || 15,
        summary: data.summary || 'Ambiente monitorado sem intercorrências.',
        detectedElements,
        detectedObjects,
        securityConcerns: data.securityConcerns || [],
        recommendations: data.recommendations || ['Manter rotina padrão'],
        occupancyEstimate: data.occupancyEstimate || 0,
        timestamp: Date.now(),
        cameraName: camera.name,
      };
      setAiAnalysis(newAnalysis);

      setCameraLatestAiTags((prev) => ({
        ...prev,
        [camera.id]: {
          detectedObjects,
          detectedElements,
          summary: newAnalysis.summary,
        },
      }));

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
          title: `Alerta IA: Ameaça Alta em ${camera.name}`,
          subtitle: `Nível crítico (${data.threatScore || 85}/100): ${topReason}`,
        });

        sendHighThreatBrowserNotification({
          cameraName: camera.name,
          threatScore: data.threatScore || 85,
          reason: topReason,
          location: camera.location,
          businessName: activeBusiness?.name,
        });
      }
    } catch (err: unknown) {
      const error = err as Error;
      console.error('AI analysis error:', error);
      setAiAnalysis({
        threatLevel: 'baixo',
        threatScore: 10,
        summary: 'Análise padrão concluída. ' + error.message,
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
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          businessName: activeBusiness?.name,
          events: motionEvents,
          totalRecordings: recordings.length,
          cameraCount: cameras.length,
        }),
      });

      if (response.status === 401) {
        await handleLogout();
        return;
      }

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

  // Camera CRUD
  const handleAddCamera = async (newCam: CameraConfig) => {
    if (currentUserRole !== 'admin') return;
    let targetUnitId = activeBusinessId;
    if (businesses.length === 0) {
      const firstUnit: ClientBusiness = {
        id: DEFAULT_UNIT_ID,
        name: 'Unidade Principal',
        ownerEmail: authUser?.email || '',
        businessType: 'general',
        address: '',
        dateCreated: Date.now(),
      };
      await saveBusinessToDB(firstUnit);
      setBusinesses([firstUnit]);
      targetUnitId = firstUnit.id;
      setActiveBusinessId(targetUnitId);
      localStorage.setItem('nvr_active_biz', targetUnitId);
    }

    const camWithTenant = { ...newCam, tenantId: targetUnitId };
    await saveCameraToDB(camWithTenant);
    setCameras((prev) => [...prev, camWithTenant]);
    setToastMessage({
      title: 'Câmera Adicionada',
      subtitle: `${newCam.name} conectada à unidade ${activeBusiness?.name || 'Unidade Principal'}.`,
    });
  };

  const handleUpdateCamera = async (updatedCam: CameraConfig) => {
    await saveCameraToDB(updatedCam);
    setCameras((prev) => prev.map((c) => (c.id === updatedCam.id ? updatedCam : c)));
  };

  const handleDeleteCamera = async (id: string) => {
    if (currentUserRole !== 'admin') return;
    await deleteCameraFromDB(id);
    setCameras((prev) => prev.filter((c) => c.id !== id));
    if (focusedCameraId === id) setFocusedCameraId(null);
  };

  const handleRecordingSaved = async () => {
    const updatedRecs = await refreshRecordings();

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
            title: 'Gravação Salva e Enviada',
            subtitle: `Sincronizada no Google Drive (${activeBusiness?.name || 'Unidade'}).`,
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
      title: 'Gravação Salva',
      subtitle: 'O vídeo foi armazenado no banco de dados local.',
    });
  };

  const handleDeleteRecording = async (id: string) => {
    if (currentUserRole !== 'admin') return;
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

  const handleClearAllRecordings = async () => {
    if (currentUserRole !== 'admin') return;
    await clearAllRecordingsFromDB(activeBusinessId);
    await refreshRecordings();
    setToastMessage({
      title: 'Gravações Limpas',
      subtitle: `As gravações desta unidade foram removidas.`,
    });
  };

  const handleMotionEventLogged = (event: MotionEvent) => {
    setMotionEvents((prev) => [event, ...prev.slice(0, 49)]);
  };

  const handleClearEvents = async () => {
    await clearAllEventsFromDB(activeBusinessId);
    setMotionEvents([]);
  };

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

  // Loading gate
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0b0f17] text-neutral-300 flex flex-col items-center justify-center gap-3">
        <div className="w-7 h-7 border-2 border-neutral-700 border-t-blue-500 rounded-full animate-spin" />
        <span className="text-xs text-neutral-400">Verificando sessão...</span>
      </div>
    );
  }

  // Mandatory Login / Initial Admin Setup gate
  if (!authUser) {
    return <LoginScreen needsSetup={needsSetup} onAuthenticated={handleAuthenticated} />;
  }

  return (
    <div className="min-h-screen bg-[#0b0f17] text-neutral-200 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      <Navbar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        recordingCount={recordings.length}
        motionEventCount={motionEvents.length}
        soundEnabled={soundEnabled}
        onToggleSound={() => setSoundEnabled(!soundEnabled)}
        onOpenAddModal={() => {
          if (currentUserRole !== 'admin') {
            setToastMessage({
              title: 'Acesso Restrito ao Administrador',
              subtitle: 'Apenas administradores podem adicionar novas câmeras.',
            });
            return;
          }
          setIsAddModalOpen(true);
        }}
        onOpenManagerModal={() => setIsManagerModalOpen(true)}
        onOpenMotionLog={() => setIsMotionLogOpen(true)}
        onOpenCloudModal={() => setIsCloudModalOpen(true)}
        onOpenBusinessModal={() => setIsBusinessModalOpen(true)}
        onOpenDiagnostics={() => {
          setCurrentTab('monitor');
          setIsDiagnosticsOpen((prev) => !prev);
        }}
        onOpenRoleModal={() => setIsRoleModalOpen(true)}
        currentUser={authUser}
        onOpenAIModal={() => {
          if (cameras.length > 0) {
            setAiSelectedCamera(cameras[0]);
          }
          setIsAiInspectorOpen(true);
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
            {/* Authenticated Role & Operational Security Bar */}
            <div
              className={`p-3.5 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg ${
                currentUserRole === 'admin'
                  ? 'bg-amber-950/20 border-amber-800/80 text-amber-200'
                  : 'bg-neutral-900/90 border-neutral-800 text-neutral-300'
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`p-2 rounded-xl border flex items-center justify-center shrink-0 ${
                    currentUserRole === 'admin'
                      ? 'bg-amber-900/60 border-amber-600/80 text-amber-300'
                      : 'bg-emerald-950 border-emerald-700/80 text-emerald-400'
                  }`}
                >
                  {currentUserRole === 'admin' ? (
                    <ShieldCheck className="w-5 h-5 text-amber-400" />
                  ) : (
                    <Shield className="w-5 h-5 text-emerald-400" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-xs font-bold text-neutral-100 uppercase tracking-wide">
                      {authUser.name} ·{' '}
                      {currentUserRole === 'admin' ? 'Administrador' : 'Operador'}
                    </h4>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold border ${
                        currentUserRole === 'admin'
                          ? 'bg-amber-950 text-amber-300 border-amber-700'
                          : 'bg-emerald-950 text-emerald-300 border-emerald-800'
                      }`}
                    >
                      {currentUserRole === 'admin' ? 'ACESSO TOTAL' : 'OPERAÇÃO SEGURA'}
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-400 mt-0.5">
                    {currentUserRole === 'admin'
                      ? 'Gerenciamento completo de usuários, configurações de rede RTSP e exclusão de câmeras.'
                      : 'Modo Operador ativo: parâmetros críticos de rede e exclusão de câmeras/gravações estão protegidos.'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                <button
                  onClick={() => setIsRoleModalOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-xs text-neutral-200 font-medium transition-colors whitespace-nowrap shrink-0"
                >
                  <Users className="w-3.5 h-3.5 text-blue-400" />
                  <span>{currentUserRole === 'admin' ? 'Conta & Usuários' : 'Minha Conta'}</span>
                </button>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-900 hover:bg-red-950/70 hover:text-red-300 border border-neutral-700 hover:border-red-800 text-xs text-neutral-300 font-medium transition-colors whitespace-nowrap shrink-0"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sair</span>
                </button>
              </div>
            </div>

            {/* Monitor Sub-Header: Unit Info, Grid Selector & Quick Tools */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-2 border-b border-neutral-800/80">
              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => setIsBusinessModalOpen(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-xs text-neutral-200 transition-colors"
                  title="Selecionar ou gerenciar unidades"
                >
                  <Building2 className="w-3.5 h-3.5 text-blue-400" />
                  <span className="font-semibold">{activeBusiness?.name || 'Sem Unidade Ativa'}</span>
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

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setIsDiagnosticsOpen((prev) => !prev)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all shadow-sm whitespace-nowrap shrink-0 ${
                    isDiagnosticsOpen
                      ? 'bg-cyan-600 text-white border-cyan-500 font-semibold'
                      : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-800 text-cyan-400 hover:text-cyan-300'
                  }`}
                  title="Latência de rede (ms) e recursos de cada câmera"
                >
                  <Activity className={`w-3.5 h-3.5 ${isDiagnosticsOpen ? 'text-white' : 'text-cyan-400'}`} />
                  <span>Diagnóstico de Rede &amp; CPU/RAM</span>
                </button>

                <button
                  onClick={() => {
                    if (cameras.length > 0) {
                      setAiSelectedCamera(cameras[0]);
                      setIsAiInspectorOpen(true);
                    } else if (currentUserRole === 'admin') {
                      setIsAddModalOpen(true);
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-950/70 hover:bg-purple-900/80 border border-purple-800/80 text-xs text-purple-300 font-medium transition-colors shadow-sm whitespace-nowrap shrink-0"
                  title="Auditoria de segurança com IA"
                >
                  <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                  <span>Auditar com IA</span>
                </button>

                <button
                  onClick={() => setIsCloudModalOpen(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-xs text-neutral-300 transition-colors whitespace-nowrap shrink-0"
                >
                  <Cloud className={`w-3.5 h-3.5 ${user ? 'text-emerald-400' : 'text-neutral-400'}`} />
                  <span className="text-[11px]">
                    Destino: <strong className="text-neutral-200">{cloudDestination === 'google_drive' ? 'Drive' : 'Local'}</strong>
                  </span>
                </button>

                <div className="flex items-center gap-1 bg-neutral-900 p-1 rounded-xl border border-neutral-800">
                  {(['1x1', '2x2', '3x3'] as GridViewMode[]).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => {
                        setFocusedCameraId(null);
                        setGridView(mode);
                      }}
                      className={`px-2.5 py-1 rounded-lg text-xs font-mono transition-colors ${
                        gridView === mode && !focusedCameraId
                          ? 'bg-neutral-800 text-white font-semibold'
                          : 'text-neutral-400 hover:text-neutral-200'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {isDiagnosticsOpen && (
              <SystemDiagnosticsPanel
                cameras={cameras}
                onClose={() => setIsDiagnosticsOpen(false)}
                onUpdateCamera={handleUpdateCamera}
                currentUserRole={currentUserRole}
              />
            )}

            {/* Empty Units / Cameras Fallback */}
            {businesses.length === 0 ? (
              <div className="p-16 text-center rounded-2xl bg-neutral-900/60 border border-neutral-800 space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-blue-950/60 text-blue-400 border border-blue-800 flex items-center justify-center mx-auto">
                  <Building2 className="w-7 h-7" />
                </div>
                <h3 className="text-base font-semibold text-neutral-100">
                  Nenhuma unidade configurada
                </h3>
                <p className="text-xs text-neutral-400 max-w-md mx-auto">
                  {currentUserRole === 'admin'
                    ? 'Cadastre uma unidade de monitoramento para organizar câmeras e gravações.'
                    : 'Solicite ao administrador para cadastrar uma unidade de monitoramento.'}
                </p>
                {currentUserRole === 'admin' && (
                  <div className="pt-2 flex justify-center">
                    <button
                      onClick={() => setIsBusinessModalOpen(true)}
                      className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition-all shadow-lg shadow-blue-900/30 whitespace-nowrap shrink-0"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Criar Primeira Unidade</span>
                    </button>
                  </div>
                )}
              </div>
            ) : cameras.length === 0 ? (
              <div className="p-16 text-center rounded-2xl bg-neutral-900/60 border border-neutral-800 space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-blue-950/60 text-blue-400 border border-blue-800 flex items-center justify-center mx-auto">
                  <Video className="w-7 h-7" />
                </div>
                <h3 className="text-base font-semibold text-neutral-100">
                  Nenhuma câmera conectada em {activeBusiness?.name}
                </h3>
                <p className="text-xs text-neutral-400 max-w-md mx-auto">
                  {currentUserRole === 'admin'
                    ? 'Busque câmeras RTSP/ONVIF reais na sua rede local ou conecte uma câmera USB/IP.'
                    : 'Nenhuma câmera cadastrada nesta unidade. Solicite ao administrador do sistema para adicionar as câmeras.'}
                </p>
                {currentUserRole === 'admin' && (
                  <div className="pt-2 flex justify-center">
                    <button
                      onClick={() => setIsAddModalOpen(true)}
                      className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition-all shadow-lg shadow-blue-900/30 whitespace-nowrap shrink-0"
                    >
                      <Wifi className="w-4 h-4 text-cyan-300" />
                      <span>Buscar Câmeras na Rede</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
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
                    latestAiTags={cameraLatestAiTags[camera.id] || null}
                    currentUserRole={currentUserRole}
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
            motionEvents={motionEvents}
            user={user}
            accessToken={accessToken}
            cloudDestination={cloudDestination}
            onDeleteRecording={handleDeleteRecording}
            onClearAllRecordings={handleClearAllRecordings}
            onNavigateToMonitor={() => setCurrentTab('monitor')}
            onUploadToDrive={handleUploadToDrive}
            isUploadingId={isUploadingId}
            onOpenCloudModal={() => setIsCloudModalOpen(true)}
            currentUserRole={currentUserRole}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-neutral-800/80 bg-neutral-950 py-4 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-neutral-500">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-neutral-400">
              {activeBusiness?.name || 'Sentinela NVR'}
            </span>
            <span>·</span>
            <span>Monitoramento e Auditoria com Armazenamento Isolado</span>
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
              <span>Unidades</span>
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
        currentUserRole={currentUserRole}
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
        currentUserRole={currentUserRole}
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

      <UserRoleModal
        isOpen={isRoleModalOpen}
        onClose={() => setIsRoleModalOpen(false)}
        currentUser={authUser}
        onLogout={handleLogout}
        activeUnitName={activeBusiness?.name}
      />
    </div>
  );
}
