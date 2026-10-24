import React from 'react';
import {
  Shield,
  Plus,
  Volume2,
  VolumeX,
  Bell,
  Cloud,
  HardDrive,
  Sparkles,
  Building2,
  ChevronDown,
  Wifi,
} from 'lucide-react';
import { GridViewMode, CloudStorageDestination, ClientBusiness } from '../types/camera';

interface NavbarProps {
  currentTab: 'monitor' | 'recordings';
  onSelectTab: (tab: 'monitor' | 'recordings') => void;
  recordingCount: number;
  motionEventCount: number;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onOpenAddModal: () => void;
  onOpenManagerModal: () => void;
  onOpenMotionLog: () => void;
  onOpenCloudModal: () => void;
  onOpenBusinessModal: () => void;
  onOpenAIModal: () => void;
  activeBusiness: ClientBusiness | null;
  cloudDestination: CloudStorageDestination;
  isGoogleConnected: boolean;
  gridView: GridViewMode;
  onChangeGridView: (view: GridViewMode) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  onSelectTab,
  recordingCount,
  motionEventCount,
  soundEnabled,
  onToggleSound,
  onOpenAddModal,
  onOpenManagerModal,
  onOpenMotionLog,
  onOpenCloudModal,
  onOpenBusinessModal,
  onOpenAIModal,
  activeBusiness,
  cloudDestination,
  isGoogleConnected,
  gridView,
  onChangeGridView,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-neutral-950/90 backdrop-blur-md border-b border-neutral-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Brand Wordmark (Single text element) */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="p-2 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
            <Shield className="w-5 h-5" />
          </div>
          <button
            onClick={() => onSelectTab('monitor')}
            className="text-lg font-bold tracking-tight text-neutral-100 hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            Sentinela NVR
          </button>
        </div>

        {/* Zone 2: Navigation Links */}
        <nav className="hidden lg:flex items-center gap-6 text-sm font-medium text-neutral-400">
          <button
            onClick={() => onSelectTab('monitor')}
            className={`transition-colors whitespace-nowrap shrink-0 pb-0.5 ${
              currentTab === 'monitor'
                ? 'text-neutral-100 font-semibold border-b-2 border-blue-500'
                : 'hover:text-neutral-200'
            }`}
          >
            Monitoramento
          </button>

          <button
            onClick={() => onSelectTab('recordings')}
            className={`transition-colors whitespace-nowrap shrink-0 flex items-center gap-2 pb-0.5 ${
              currentTab === 'recordings'
                ? 'text-neutral-100 font-semibold border-b-2 border-blue-500'
                : 'hover:text-neutral-200'
            }`}
          >
            <span>Gravações</span>
            {recordingCount > 0 && (
              <span className="font-mono tabular-nums text-xs px-1.5 py-0.2 rounded bg-neutral-800 text-neutral-300">
                {recordingCount}
              </span>
            )}
          </button>

          {/* AI Auditor Link */}
          <button
            onClick={onOpenAIModal}
            className="hover:text-purple-300 transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 text-purple-400"
            title="Administração e Auditoria de Segurança com IA (Gemini 3.8 Flash)"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Auditoria IA</span>
          </button>

          <button
            onClick={onOpenCloudModal}
            className="hover:text-neutral-200 transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5"
            title="Escolha do cliente: Armazenamento Local ou Nuvem Google Drive"
          >
            <Cloud className={`w-3.5 h-3.5 ${isGoogleConnected ? 'text-emerald-400' : 'text-neutral-400'}`} />
            <span>Nuvem {cloudDestination === 'google_drive' ? '(Drive)' : '(Local)'}</span>
          </button>

          <button
            onClick={onOpenManagerModal}
            className="hover:text-neutral-200 transition-colors whitespace-nowrap shrink-0"
          >
            Câmeras
          </button>

          <button
            onClick={onOpenMotionLog}
            className="hover:text-neutral-200 transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5"
          >
            <span>Alertas</span>
            {motionEventCount > 0 && (
              <span className="w-2 h-2 rounded-full bg-amber-400" />
            )}
          </button>
        </nav>

        {/* Zone 3: Primary Action & Quick Tools */}
        <div className="flex items-center gap-2.5 shrink-0">
          {/* Active Business / Store Selector */}
          <button
            onClick={onOpenBusinessModal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-xs text-neutral-200 border border-neutral-700/80 transition-colors max-w-[190px]"
            title="Trocar comércio / cliente ativo"
          >
            <Building2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span className="truncate font-medium">{activeBusiness?.name || 'Meu Comércio'}</span>
            <ChevronDown className="w-3 h-3 text-neutral-400 shrink-0" />
          </button>

          {/* Sound alarm mute toggle */}
          <button
            onClick={onToggleSound}
            className={`p-2 rounded-lg border transition-colors ${
              soundEnabled
                ? 'bg-neutral-800/80 text-neutral-200 border-neutral-700 hover:bg-neutral-700'
                : 'bg-neutral-900 text-neutral-500 border-neutral-800 hover:text-neutral-300'
            }`}
            title={soundEnabled ? 'Alarme sonoro ativado (Clique para silenciar)' : 'Alarme sonoro silenciado'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-blue-400" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* Primary Action Button: Network Discovery & Add Camera */}
          <button
            onClick={onOpenAddModal}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-all shadow-md shadow-blue-900/30 whitespace-nowrap shrink-0 hover:scale-[1.02]"
            title="Escanear e descobrir câmeras na mesma rede ou adicionar manualmente"
          >
            <Wifi className="w-3.5 h-3.5 text-cyan-200" />
            <span className="hidden sm:inline">Buscar Câmeras na Rede</span>
            <span className="sm:hidden">Buscar Câmera</span>
          </button>
        </div>
      </div>

      {/* Mobile Submenu Bar */}
      <div className="lg:hidden flex items-center justify-around py-2 border-t border-neutral-800 text-xs text-neutral-400 bg-neutral-950">
        <button
          onClick={() => onSelectTab('monitor')}
          className={`px-2 py-1 rounded-md ${
            currentTab === 'monitor' ? 'text-white font-medium bg-neutral-800' : ''
          }`}
        >
          Monitoramento
        </button>
        <button
          onClick={() => onSelectTab('recordings')}
          className={`px-2 py-1 rounded-md flex items-center gap-1 ${
            currentTab === 'recordings' ? 'text-white font-medium bg-neutral-800' : ''
          }`}
        >
          <span>Gravações</span>
          {recordingCount > 0 && (
            <span className="font-mono text-[10px] px-1 bg-neutral-700 rounded text-neutral-200">
              {recordingCount}
            </span>
          )}
        </button>
        <button
          onClick={onOpenAIModal}
          className="px-2 py-1 rounded-md text-purple-400 flex items-center gap-1"
        >
          <Sparkles className="w-3 h-3" />
          <span>IA</span>
        </button>
        <button
          onClick={onOpenCloudModal}
          className="px-2 py-1 rounded-md flex items-center gap-1 text-emerald-400"
        >
          <Cloud className="w-3 h-3" />
          <span>Nuvem</span>
        </button>
        <button
          onClick={onOpenBusinessModal}
          className="px-2 py-1 rounded-md hover:text-white"
        >
          Lojas
        </button>
      </div>
    </header>
  );
};
