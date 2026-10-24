import React, { useState } from 'react';
import {
  X,
  Cloud,
  HardDrive,
  Check,
  ExternalLink,
  UploadCloud,
  LogOut,
  FolderCheck,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';
import { User } from 'firebase/auth';
import { CloudStorageDestination, RecordingItem } from '../types/camera';
import { googleSignIn, logoutGoogle, uploadRecordingToDrive } from '../services/googleDrive';
import { saveRecordingToDB } from '../services/db';

interface CloudStorageModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  accessToken: string | null;
  onAuthChange: (user: User | null, token: string | null) => void;
  cloudDestination: CloudStorageDestination;
  onChangeCloudDestination: (dest: CloudStorageDestination) => void;
  autoSyncToCloud: boolean;
  onToggleAutoSync: (enabled: boolean) => void;
  recordings: RecordingItem[];
  onRecordingsUpdated: () => void;
}

export const CloudStorageModal: React.FC<CloudStorageModalProps> = ({
  isOpen,
  onClose,
  user,
  accessToken,
  onAuthChange,
  cloudDestination,
  onChangeCloudDestination,
  autoSyncToCloud,
  onToggleAutoSync,
  recordings,
  onRecordingsUpdated,
}) => {
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleGoogleLogin = async () => {
    setIsSigningIn(true);
    try {
      const result = await googleSignIn();
      if (result) {
        onAuthChange(result.user, result.accessToken);
        onChangeCloudDestination('google_drive');
      }
    } catch (err: unknown) {
      const error = err as Error;
      alert(`Falha ao conectar com Google Drive: ${error.message}`);
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleGoogleLogout = async () => {
    await logoutGoogle();
    onAuthChange(null, null);
    onChangeCloudDestination('local');
  };

  const handleSyncAllPending = async () => {
    if (!accessToken) {
      alert('Conecte sua conta do Google Drive primeiro.');
      return;
    }

    const pending = recordings.filter((r) => !r.driveFileId);
    if (pending.length === 0) {
      alert('Todas as gravações já estão sincronizadas com o Google Drive!');
      return;
    }

    setSyncingAll(true);
    setSyncStatusMsg(`Sincronizando 1 de ${pending.length}...`);

    try {
      let count = 0;
      for (const rec of pending) {
        count++;
        setSyncStatusMsg(`Enviando ${count} de ${pending.length} (${rec.cameraName})...`);
        const { fileId, webViewLink } = await uploadRecordingToDrive(rec, accessToken);
        const updated: RecordingItem = {
          ...rec,
          driveFileId: fileId,
          driveViewLink: webViewLink,
          syncStatus: 'synced',
        };
        await saveRecordingToDB(updated);
      }
      onRecordingsUpdated();
      setSyncStatusMsg(`Sucesso! ${pending.length} gravações enviadas para a pasta Sentinela NVR no Google Drive.`);
      setTimeout(() => setSyncStatusMsg(null), 4000);
    } catch (err: unknown) {
      const error = err as Error;
      alert(`Erro durante envio para Google Drive: ${error.message}`);
    } finally {
      setSyncingAll(false);
    }
  };

  const unsyncedCount = recordings.filter((r) => !r.driveFileId).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-blue-950 text-blue-400 border border-blue-800">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-neutral-100">Armazenamento em Nuvem &amp; Destino</h2>
              <p className="text-xs text-neutral-400">Escolha onde salvar e sincronizar os vídeos das câmeras</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-neutral-100 rounded-lg hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs text-neutral-300">
          {/* Destination Selection Cards */}
          <div>
            <label className="block text-xs font-semibold text-neutral-200 mb-2.5">
              Destino Padrão das Gravações (Escolha do Usuário)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Option 1: Local */}
              <div
                onClick={() => onChangeCloudDestination('local')}
                className={`p-4 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                  cloudDestination === 'local'
                    ? 'border-blue-500 bg-blue-950/30 shadow-[0_0_15px_rgba(59,130,246,0.15)]'
                    : 'border-neutral-800 bg-neutral-950/60 hover:border-neutral-700'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="p-2 rounded-lg bg-neutral-800 text-neutral-300">
                    <HardDrive className="w-4 h-4" />
                  </div>
                  {cloudDestination === 'local' && (
                    <div className="w-5 h-5 rounded-full bg-blue-500 text-white flex items-center justify-center">
                      <Check className="w-3 h-3 stroke-[3]" />
                    </div>
                  )}
                </div>
                <div>
                  <h4 className="font-semibold text-neutral-100 text-sm mb-1">Armazenamento Local</h4>
                  <p className="text-[11px] text-neutral-400 leading-relaxed">
                    Salva diretamente no banco de dados seguro do navegador (IndexedDB). Funciona 100% offline e sem login.
                  </p>
                </div>
              </div>

              {/* Option 2: Google Drive */}
              <div
                onClick={() => {
                  if (!user) {
                    handleGoogleLogin();
                  } else {
                    onChangeCloudDestination('google_drive');
                  }
                }}
                className={`p-4 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                  cloudDestination === 'google_drive'
                    ? 'border-emerald-500 bg-emerald-950/30 shadow-[0_0_15px_rgba(16,185,129,0.15)]'
                    : 'border-neutral-800 bg-neutral-950/60 hover:border-neutral-700'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="p-2 rounded-lg bg-neutral-800 text-emerald-400">
                    <Cloud className="w-4 h-4" />
                  </div>
                  {cloudDestination === 'google_drive' && (
                    <div className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center">
                      <Check className="w-3 h-3 stroke-[3]" />
                    </div>
                  )}
                </div>
                <div>
                  <h4 className="font-semibold text-neutral-100 text-sm mb-1">Google Drive (Nuvem)</h4>
                  <p className="text-[11px] text-neutral-400 leading-relaxed">
                    Envia os vídeos automaticamente para uma pasta dedicada no seu Google Drive com acesso de qualquer lugar.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Google Account Status & Sign In Button */}
          <div className="p-4 bg-neutral-950/80 rounded-xl border border-neutral-800 space-y-3">
            <h4 className="font-semibold text-neutral-200 text-xs">Conta Google Conectada</h4>

            {user ? (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={user.displayName || 'Google User'}
                      referrerPolicy="no-referrer"
                      className="w-9 h-9 rounded-full border border-neutral-700 object-cover"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800 flex items-center justify-center font-bold">
                      {user.displayName?.charAt(0) || user.email?.charAt(0) || 'G'}
                    </div>
                  )}
                  <div>
                    <div className="font-semibold text-neutral-100 text-xs">
                      {user.displayName || 'Usuário Google'}
                    </div>
                    <div className="text-[11px] text-neutral-400">{user.email}</div>
                  </div>
                </div>

                <button
                  onClick={handleGoogleLogout}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white transition-colors"
                  title="Desconectar do Google"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Desconectar</span>
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-[11px] text-neutral-400">
                  Conecte sua conta do Google para habilitar o upload automático das gravações para a sua nuvem no Google Drive.
                </p>

                {/* Official Material Google Sign-In Button */}
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={isSigningIn}
                  className="w-full flex items-center justify-center gap-3 px-4 py-2.5 bg-white hover:bg-neutral-100 text-neutral-800 font-medium rounded-xl text-xs transition-colors shadow-sm disabled:opacity-50"
                >
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 48 48">
                    <path
                      fill="#EA4335"
                      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                    />
                    <path
                      fill="#4285F4"
                      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                    />
                    <path
                      fill="#34A853"
                      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                    />
                  </svg>
                  <span>{isSigningIn ? 'Conectando...' : 'Conectar com Google Drive'}</span>
                </button>
              </div>
            )}
          </div>

          {/* Sync & Automation Settings */}
          {user && (
            <div className="p-4 bg-neutral-950/80 rounded-xl border border-neutral-800 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-neutral-200 text-xs">
                    Sincronização Automática com a Nuvem
                  </h4>
                  <p className="text-[11px] text-neutral-400">
                    Enviar novos vídeos gravados para o Google Drive assim que a gravação terminar.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={autoSyncToCloud}
                  onChange={(e) => onToggleAutoSync(e.target.checked)}
                  className="rounded bg-neutral-800 border-neutral-700 text-emerald-600 focus:ring-0"
                />
              </div>

              {/* Dedicated Folder Info */}
              <div className="pt-2 border-t border-neutral-800/80 flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-1.5 text-neutral-400">
                  <FolderCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Pasta no Drive:</span>
                  <span className="font-semibold text-neutral-200">Sentinela NVR - Gravações</span>
                </div>
                <a
                  href="https://drive.google.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors"
                >
                  <span>Abrir Google Drive</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              {/* Batch sync button */}
              {unsyncedCount > 0 && (
                <div className="pt-2 border-t border-neutral-800/80">
                  <button
                    onClick={handleSyncAllPending}
                    disabled={syncingAll}
                    className="w-full flex items-center justify-center gap-2 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg text-xs font-medium transition-colors border border-neutral-700 disabled:opacity-50"
                  >
                    <UploadCloud className="w-4 h-4 text-emerald-400" />
                    <span>
                      {syncingAll
                        ? 'Enviando gravações...'
                        : `Enviar ${unsyncedCount} gravação(ões) pendentes para o Drive`}
                    </span>
                  </button>
                </div>
              )}

              {syncStatusMsg && (
                <p className="text-[11px] text-emerald-400 font-medium animate-pulse">
                  {syncStatusMsg}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-neutral-950 border-t border-neutral-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
