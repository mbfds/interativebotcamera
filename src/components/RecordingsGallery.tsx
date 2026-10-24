import React, { useState, useMemo } from 'react';
import {
  Film,
  Play,
  Download,
  Trash2,
  HardDrive,
  Filter,
  Search,
  Calendar,
  AlertTriangle,
  Clock,
  Video,
  Cloud,
  UploadCloud,
  ExternalLink,
  Settings,
} from 'lucide-react';
import { User } from 'firebase/auth';
import { RecordingItem, CameraConfig, CloudStorageDestination } from '../types/camera';
import { VideoPlayerModal } from './VideoPlayerModal';

interface RecordingsGalleryProps {
  recordings: RecordingItem[];
  cameras: CameraConfig[];
  user: User | null;
  accessToken: string | null;
  cloudDestination: CloudStorageDestination;
  onDeleteRecording: (id: string) => void;
  onClearAllRecordings: () => void;
  onNavigateToMonitor: () => void;
  onUploadToDrive: (recording: RecordingItem) => Promise<void>;
  isUploadingId: string | null;
  onOpenCloudModal: () => void;
}

export const RecordingsGallery: React.FC<RecordingsGalleryProps> = ({
  recordings,
  cameras,
  user,
  accessToken,
  cloudDestination,
  onDeleteRecording,
  onClearAllRecordings,
  onNavigateToMonitor,
  onUploadToDrive,
  isUploadingId,
  onOpenCloudModal,
}) => {
  const [selectedCameraFilter, setSelectedCameraFilter] = useState<string>('all');
  const [selectedTriggerFilter, setSelectedTriggerFilter] = useState<string>('all');
  const [selectedStorageFilter, setSelectedStorageFilter] = useState<string>('all');
  const [filterCriticalOnly, setFilterCriticalOnly] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeRecordingForPlayer, setActiveRecordingForPlayer] = useState<RecordingItem | null>(null);

  // Helper to determine if a recording has an AI critical event detection
  const isRecordingCritical = (r: RecordingItem): boolean => {
    return Boolean(
      r.isCritical ||
      r.aiThreatLevel === 'alto' ||
      (typeof r.aiThreatScore === 'number' && r.aiThreatScore >= 70)
    );
  };

  // Compute total size
  const totalSizeBytes = useMemo(() => {
    return recordings.reduce((acc, r) => acc + (r.fileSizeBytes || r.blob?.size || 0), 0);
  }, [recordings]);

  const syncedCount = useMemo(() => {
    return recordings.filter((r) => !!r.driveFileId).length;
  }, [recordings]);

  const criticalCount = useMemo(() => {
    return recordings.filter(isRecordingCritical).length;
  }, [recordings]);

  const formatFileSize = (bytes: number) => {
    if (!bytes) return '0 KB';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Filtered recordings
  const filteredRecordings = useMemo(() => {
    return recordings.filter((r) => {
      // Critical AI filter toggle
      if (filterCriticalOnly && !isRecordingCritical(r)) {
        return false;
      }
      if (selectedCameraFilter !== 'all' && r.cameraId !== selectedCameraFilter) {
        return false;
      }
      if (selectedTriggerFilter === 'critical_ai' && !isRecordingCritical(r)) {
        return false;
      }
      if (
        selectedTriggerFilter !== 'all' &&
        selectedTriggerFilter !== 'critical_ai' &&
        r.triggerType !== selectedTriggerFilter
      ) {
        return false;
      }
      if (selectedStorageFilter === 'drive' && !r.driveFileId) {
        return false;
      }
      if (selectedStorageFilter === 'local' && !!r.driveFileId) {
        return false;
      }
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchName = r.cameraName.toLowerCase().includes(query);
        const matchLoc = r.cameraLocation.toLowerCase().includes(query);
        const matchReason = (r.aiThreatReason || r.aiAnalysisSummary || '').toLowerCase().includes(query);
        return matchName || matchLoc || matchReason;
      }
      return true;
    });
  }, [
    recordings,
    filterCriticalOnly,
    selectedCameraFilter,
    selectedTriggerFilter,
    selectedStorageFilter,
    searchQuery,
  ]);

  const handleDownload = (rec: RecordingItem, e: React.MouseEvent) => {
    e.stopPropagation();
    const url = URL.createObjectURL(rec.blob);
    const link = document.createElement('a');
    link.href = url;
    const safeDate = new Date(rec.timestamp).toISOString().replace(/[:.]/g, '-');
    link.download = `gravacao_${rec.cameraName.replace(/\s+/g, '_')}_${safeDate}.webm`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Deseja excluir esta gravação do site?')) {
      onDeleteRecording(id);
    }
  };

  const handleDriveUpload = (rec: RecordingItem, e: React.MouseEvent) => {
    e.stopPropagation();
    onUploadToDrive(rec);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner: Storage & Cloud Status */}
      <div className="p-4 bg-neutral-900 border border-neutral-800 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-950/70 text-blue-400 border border-blue-800/80">
            <HardDrive className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-neutral-100">Galeria de Gravações</h2>
              <span className="text-neutral-500">·</span>
              <span className="font-mono tabular-nums text-xs text-neutral-400">
                {recordings.length} {recordings.length === 1 ? 'vídeo' : 'vídeos'}
              </span>
              {criticalCount > 0 && (
                <>
                  <span className="text-neutral-500">·</span>
                  <span className="inline-flex items-center gap-1 text-xs text-red-400 font-semibold">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                    <span>{criticalCount} {criticalCount === 1 ? 'crítica IA' : 'críticas IA'}</span>
                  </span>
                </>
              )}
            </div>
            <p className="text-xs text-neutral-400">
              Espaço local ocupado:{' '}
              <span className="font-mono tabular-nums font-semibold text-neutral-200">
                {formatFileSize(totalSizeBytes)}
              </span>
              {' '}·{' '}
              <span className="text-emerald-400">
                {syncedCount} no Google Drive
              </span>
            </p>
          </div>
        </div>

        {/* Cloud Destination Card / Button */}
        <div className="flex items-center gap-2.5 w-full md:w-auto justify-between md:justify-end">
          <button
            onClick={onOpenCloudModal}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-neutral-950/80 hover:bg-neutral-800 text-xs text-neutral-300 border border-neutral-700/80 transition-colors"
            title="Configurar destino das gravações (Local ou Google Drive)"
          >
            <Cloud className={`w-4 h-4 ${user ? 'text-emerald-400' : 'text-neutral-400'}`} />
            <span>
              Destino: <strong className="text-neutral-100">{cloudDestination === 'google_drive' ? 'Google Drive' : 'Local'}</strong>
            </span>
            <Settings className="w-3.5 h-3.5 text-neutral-500 ml-1" />
          </button>

          {recordings.length > 0 && (
            <button
              onClick={() => {
                if (confirm('Tem certeza de que deseja apagar TODAS as gravações salvas? Esta ação não pode ser desfeita.')) {
                  onClearAllRecordings();
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-red-950/60 hover:text-red-400 text-neutral-400 text-xs transition-colors border border-neutral-700/60"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Limpar Todas</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por câmera, local ou motivo da IA..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-neutral-900 border border-neutral-800 rounded-xl text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* AI Critical Events Filter Button */}
        <button
          type="button"
          onClick={() => setFilterCriticalOnly((prev) => !prev)}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all border ${
            filterCriticalOnly
              ? 'bg-red-950 text-red-200 border-red-500 shadow-lg shadow-red-950/70 ring-2 ring-red-500/40'
              : criticalCount > 0
              ? 'bg-neutral-900 text-neutral-200 hover:text-white border-red-900/50 hover:border-red-600/70'
              : 'bg-neutral-900 text-neutral-400 hover:text-neutral-200 border-neutral-800'
          }`}
          title="Filtrar apenas gravações com detecção de eventos críticos pela IA"
        >
          <AlertTriangle
            className={`w-3.5 h-3.5 ${
              filterCriticalOnly
                ? 'text-red-400 animate-pulse fill-red-400/20'
                : criticalCount > 0
                ? 'text-amber-400 fill-amber-400/20'
                : 'text-neutral-500'
            }`}
          />
          <span>Eventos Críticos IA</span>
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] font-mono tabular-nums font-bold ${
              filterCriticalOnly
                ? 'bg-red-700 text-white shadow-sm'
                : criticalCount > 0
                ? 'bg-red-950 text-red-300 border border-red-800/80'
                : 'bg-neutral-800 text-neutral-400'
            }`}
          >
            {criticalCount}
          </span>
        </button>

        {/* Camera Filter */}
        <div className="flex items-center gap-1.5">
          <span className="text-neutral-400">Câmera:</span>
          <select
            value={selectedCameraFilter}
            onChange={(e) => setSelectedCameraFilter(e.target.value)}
            className="bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-neutral-200 focus:outline-none focus:border-blue-500"
          >
            <option value="all">Todas as Câmeras</option>
            {cameras.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Trigger Filter */}
        <div className="flex items-center gap-1.5">
          <span className="text-neutral-400">Origem:</span>
          <select
            value={selectedTriggerFilter}
            onChange={(e) => setSelectedTriggerFilter(e.target.value)}
            className="bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-neutral-200 focus:outline-none focus:border-blue-500"
          >
            <option value="all">Todos os Disparos</option>
            <option value="critical_ai">🚨 Eventos Críticos (IA)</option>
            <option value="motion">Movimento</option>
            <option value="manual">Manual</option>
          </select>
        </div>

        {/* Storage Filter */}
        <div className="flex items-center gap-1.5">
          <span className="text-neutral-400">Nuvem:</span>
          <select
            value={selectedStorageFilter}
            onChange={(e) => setSelectedStorageFilter(e.target.value)}
            className="bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-neutral-200 focus:outline-none focus:border-blue-500"
          >
            <option value="all">Todos os Locais</option>
            <option value="drive">No Google Drive</option>
            <option value="local">Apenas Local</option>
          </select>
        </div>

        {/* Reset Filter Button if any filter is active */}
        {(filterCriticalOnly ||
          selectedCameraFilter !== 'all' ||
          selectedTriggerFilter !== 'all' ||
          selectedStorageFilter !== 'all' ||
          searchQuery.trim().length > 0) && (
          <button
            type="button"
            onClick={() => {
              setFilterCriticalOnly(false);
              setSelectedCameraFilter('all');
              setSelectedTriggerFilter('all');
              setSelectedStorageFilter('all');
              setSearchQuery('');
            }}
            className="px-2.5 py-2 text-xs text-neutral-400 hover:text-neutral-200 bg-neutral-900 border border-neutral-800 rounded-xl hover:border-neutral-700 transition-colors"
          >
            Limpar Filtros
          </button>
        )}
      </div>

      {/* Recordings Grid or Empty State */}
      {filteredRecordings.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-neutral-900/50 border border-neutral-800/80 space-y-3">
          <div className="w-12 h-12 rounded-full bg-neutral-800/80 text-neutral-400 flex items-center justify-center mx-auto">
            {filterCriticalOnly ? (
              <AlertTriangle className="w-6 h-6 text-amber-400" />
            ) : (
              <Film className="w-6 h-6" />
            )}
          </div>
          <h3 className="text-sm font-semibold text-neutral-200">
            {filterCriticalOnly
              ? 'Nenhuma gravação com evento crítico pela IA'
              : 'Nenhuma gravação encontrada'}
          </h3>
          <p className="text-xs text-neutral-400 max-w-md mx-auto">
            {filterCriticalOnly
              ? 'Nenhum dos vídeos atende ao filtro de detecção de ameaça crítica da IA. Quando a IA detectar uma intrusão de alta severidade, ela aparecerá aqui automaticamente.'
              : recordings.length === 0
              ? 'Você ainda não possui gravações salvas. Acesse o monitoramento e grave em qualquer câmera, ou ative a gravação automática por movimento.'
              : 'Nenhuma gravação corresponde aos filtros selecionados.'}
          </p>
          {filterCriticalOnly ? (
            <button
              onClick={() => setFilterCriticalOnly(false)}
              className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-xl text-xs font-medium transition-colors"
            >
              <span>Ver todas as gravações ({recordings.length})</span>
            </button>
          ) : recordings.length === 0 ? (
            <button
              onClick={onNavigateToMonitor}
              className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-medium transition-colors"
            >
              <Video className="w-3.5 h-3.5" />
              <span>Ir para o Monitoramento Ao Vivo</span>
            </button>
          ) : null}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredRecordings.map((rec) => {
            const dateStr = new Date(rec.timestamp).toLocaleDateString('pt-BR', {
              day: '2-digit',
              month: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            });

            const isUploadingThis = isUploadingId === rec.id;
            const isCritical = isRecordingCritical(rec);

            return (
              <div
                key={rec.id}
                onClick={() => setActiveRecordingForPlayer(rec)}
                className={`group relative bg-neutral-900 rounded-xl overflow-hidden cursor-pointer transition-all hover:shadow-xl ${
                  isCritical
                    ? 'border-2 border-red-600/80 hover:border-red-500 shadow-lg shadow-red-950/40 ring-1 ring-red-600/30'
                    : 'border border-neutral-800 hover:border-neutral-700'
                }`}
              >
                {/* Glowing top rim for critical AI events */}
                {isCritical && (
                  <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-red-600 via-rose-500 to-amber-500 z-10" />
                )}

                {/* Thumbnail */}
                <div className="relative aspect-video w-full bg-black flex items-center justify-center overflow-hidden">
                  {rec.thumbnailDataUrl ? (
                    <img
                      src={rec.thumbnailDataUrl}
                      alt={rec.cameraName}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-neutral-950 text-neutral-600">
                      <Film className="w-8 h-8" />
                    </div>
                  )}

                  {/* Play Overlay Button */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div
                      className={`p-3 rounded-full text-white shadow-lg transform group-hover:scale-110 transition-transform ${
                        isCritical ? 'bg-red-600/90 shadow-red-950/80' : 'bg-blue-600/90'
                      }`}
                    >
                      <Play className="w-5 h-5 fill-current ml-0.5" />
                    </div>
                  </div>

                  {/* Duration Tag */}
                  <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/80 font-mono tabular-nums text-[11px] text-neutral-200">
                    {formatDuration(rec.durationSeconds)}
                  </div>

                  {/* Top-left Badges */}
                  <div className="absolute top-2 left-2 flex flex-col gap-1 items-start">
                    {/* Critical AI Badge */}
                    {isCritical && (
                      <div className="px-2 py-0.5 rounded bg-red-600/95 border border-red-400 text-white text-[10px] font-bold tracking-wide flex items-center gap-1 shadow-md shadow-red-950/80 animate-pulse">
                        <AlertTriangle className="w-3 h-3 text-amber-200 fill-amber-200/20" />
                        <span>CRÍTICO IA{rec.aiThreatScore ? ` · ${rec.aiThreatScore}%` : ''}</span>
                      </div>
                    )}

                    {/* Trigger Tag */}
                    <div className="px-1.5 py-0.5 rounded bg-black/75 text-[10px] font-medium tracking-wide text-neutral-300 flex items-center gap-1">
                      {rec.triggerType === 'motion' ? (
                        <>
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                          <span>MOVIMENTO</span>
                        </>
                      ) : (
                        <>
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                          <span>MANUAL</span>
                        </>
                      )}
                    </div>

                    {/* Google Drive Status Badge */}
                    {rec.driveFileId ? (
                      <div className="px-1.5 py-0.5 rounded bg-emerald-950/90 border border-emerald-600/80 text-[10px] font-medium tracking-wide text-emerald-300 flex items-center gap-1 shadow">
                        <Cloud className="w-3 h-3 text-emerald-400" />
                        <span>DRIVE</span>
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* Card Info */}
                <div className="p-3 text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5 truncate">
                      {isCritical && (
                        <span title="Gravação com evento crítico de segurança detectado pela IA">
                          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 fill-red-500/20 animate-bounce" />
                        </span>
                      )}
                      <h4 className="font-semibold text-neutral-200 truncate">{rec.cameraName}</h4>
                    </div>
                    <span className="font-mono tabular-nums text-[11px] text-neutral-400 shrink-0 ml-2">
                      {formatFileSize(rec.fileSizeBytes)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-neutral-400 text-[11px]">
                    <span className="truncate">{rec.cameraLocation}</span>
                    <span className="font-mono tabular-nums">{dateStr}</span>
                  </div>

                  {/* Critical AI Detection Highlight Box */}
                  {isCritical && (
                    <div className="mt-2.5 p-2 rounded-lg bg-red-950/70 border border-red-900/80 flex items-start gap-1.5 text-[11px] text-red-200">
                      <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                      <div className="overflow-hidden">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-red-300 text-[10px] uppercase tracking-wider">
                            Alerta Crítico IA
                          </span>
                          {rec.aiThreatScore && (
                            <span className="font-mono text-[10px] text-red-400 font-bold">
                              ({rec.aiThreatScore}%)
                            </span>
                          )}
                        </div>
                        <p className="text-red-200/90 line-clamp-2 text-[11px] leading-tight mt-0.5">
                          {rec.aiThreatReason ||
                            rec.aiAnalysisSummary ||
                            'Evento crítico de segurança identificado pelo modelo de IA.'}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Quick Card Action Buttons */}
                  <div className="mt-3 pt-2.5 border-t border-neutral-800/80 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => handleDownload(rec, e)}
                        className="flex items-center gap-1 text-[11px] text-neutral-400 hover:text-blue-400 transition-colors"
                        title="Baixar vídeo localmente"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Baixar</span>
                      </button>

                      {/* Google Drive quick action */}
                      {rec.driveViewLink ? (
                        <a
                          href={rec.driveViewLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300 transition-colors"
                          title="Abrir no Google Drive"
                        >
                          <Cloud className="w-3.5 h-3.5" />
                          <span>No Drive</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      ) : (
                        <button
                          onClick={(e) => handleDriveUpload(rec, e)}
                          disabled={isUploadingThis}
                          className="flex items-center gap-1 text-[11px] text-neutral-400 hover:text-emerald-400 transition-colors disabled:opacity-50"
                          title="Enviar para o Google Drive"
                        >
                          <UploadCloud className="w-3.5 h-3.5" />
                          <span>{isUploadingThis ? 'Enviando...' : 'P/ Drive'}</span>
                        </button>
                      )}
                    </div>

                    <button
                      onClick={(e) => handleDelete(rec.id, e)}
                      className="p-1 text-neutral-500 hover:text-red-400 transition-colors"
                      title="Excluir gravação"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Video Player Modal */}
      <VideoPlayerModal
        recording={activeRecordingForPlayer}
        onClose={() => setActiveRecordingForPlayer(null)}
        onDelete={onDeleteRecording}
        onUploadToDrive={onUploadToDrive}
        isUploadingToDrive={!!isUploadingId && isUploadingId === activeRecordingForPlayer?.id}
      />
    </div>
  );
};
