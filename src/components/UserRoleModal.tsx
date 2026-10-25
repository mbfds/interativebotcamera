import React, { useState } from 'react';
import {
  X,
  ShieldCheck,
  User,
  KeyRound,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Unlock,
  Bell,
  Eye,
  Settings,
  Building,
} from 'lucide-react';
import { UserRole } from '../types/camera';
import {
  getBrowserNotificationPermission,
  requestBrowserNotificationPermission,
  sendHighThreatBrowserNotification,
} from '../utils/browserNotifications';

interface UserRoleModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentRole: UserRole;
  onChangeRole: (role: UserRole) => void;
  activeBusinessName?: string;
  onPurgeDemoCameras?: () => void;
}

export const UserRoleModal: React.FC<UserRoleModalProps> = ({
  isOpen,
  onClose,
  currentRole,
  onChangeRole,
  activeBusinessName = 'Comércio Ativo',
  onPurgeDemoCameras,
}) => {
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [notificationStatus, setNotificationStatus] = useState<string>(
    getBrowserNotificationPermission()
  );
  const [notificationTestSuccess, setNotificationTestSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSwitchToAdmin = () => {
    // Standard default PIN for quick admin elevation
    if (pinInput.trim() === '1234' || pinInput.trim() === '') {
      onChangeRole('admin');
      setPinError('');
      setPinInput('');
    } else {
      setPinError('PIN de Administrador incorreto. (PIN padrão: 1234)');
    }
  };

  const handleSwitchToOperator = () => {
    onChangeRole('operador');
    setPinError('');
    setPinInput('');
  };

  const handleRequestNotification = async () => {
    const perm = await requestBrowserNotificationPermission();
    setNotificationStatus(perm);
    if (perm === 'granted') {
      sendHighThreatBrowserNotification({
        cameraName: 'Câmera Principal',
        threatScore: 92,
        reason: 'Teste de Notificação em Segundo Plano ativado com sucesso!',
        location: activeBusinessName,
      });
      setNotificationTestSuccess(true);
      setTimeout(() => setNotificationTestSuccess(false), 4000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className={`p-2 rounded-xl border ${
                currentRole === 'admin'
                  ? 'bg-amber-950/70 border-amber-800/80 text-amber-400'
                  : 'bg-blue-950/70 border-blue-800/80 text-blue-400'
              }`}
            >
              {currentRole === 'admin' ? (
                <ShieldCheck className="w-5 h-5" />
              ) : (
                <User className="w-5 h-5" />
              )}
            </div>
            <div>
              <h2 className="text-base font-bold text-neutral-100">
                Perfis de Acesso: Administrador vs Usuário
              </h2>
              <p className="text-xs text-neutral-400">
                Separação completa de privilégios de controle e visualização segura
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

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs text-neutral-300">
          {/* Active Profile Status Badge */}
          <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 flex items-center justify-between">
            <div>
              <span className="text-[11px] text-neutral-400 block">Perfil Ativo na Sessão:</span>
              <span className="text-sm font-bold text-neutral-100 flex items-center gap-1.5 mt-0.5">
                {currentRole === 'admin' ? (
                  <>
                    <ShieldCheck className="w-4 h-4 text-amber-400" />
                    <span>Administrador (Acesso Irrestrito)</span>
                  </>
                ) : (
                  <>
                    <User className="w-4 h-4 text-blue-400" />
                    <span>Usuário Operador (Modo Monitoramento & Segurança)</span>
                  </>
                )}
              </span>
            </div>
            <span
              className={`font-mono text-[10px] uppercase font-bold px-2 py-1 rounded-md border ${
                currentRole === 'admin'
                  ? 'bg-amber-950 text-amber-300 border-amber-800'
                  : 'bg-blue-950 text-blue-300 border-blue-800'
              }`}
            >
              {currentRole.toUpperCase()}
            </span>
          </div>

          {/* Role Comparison Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* Admin Role Card */}
            <div
              className={`p-4 rounded-xl border transition-all ${
                currentRole === 'admin'
                  ? 'bg-amber-950/20 border-amber-800/80 ring-1 ring-amber-500/50'
                  : 'bg-neutral-950/60 border-neutral-800 opacity-80'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-neutral-100 flex items-center gap-1.5 text-xs">
                  <ShieldCheck className="w-4 h-4 text-amber-400" />
                  Administrador
                </span>
                {currentRole === 'admin' && (
                  <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-amber-900 text-amber-200">
                    ATIVO
                  </span>
                )}
              </div>
              <ul className="space-y-1.5 text-[11px] text-neutral-400">
                <li className="flex items-center gap-1.5 text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Adicionar, editar e remover câmeras</span>
                </li>
                <li className="flex items-center gap-1.5 text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Cadastrar e gerenciar lojas/clientes</span>
                </li>
                <li className="flex items-center gap-1.5 text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Auditoria e relatórios com IA (Gemini)</span>
                </li>
                <li className="flex items-center gap-1.5 text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Diagnóstico de Rede & Gargalos</span>
                </li>
                <li className="flex items-center gap-1.5 text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Configuração de Nuvem e Google Drive</span>
                </li>
              </ul>

              {currentRole !== 'admin' && (
                <div className="mt-3 pt-3 border-t border-neutral-800 space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="password"
                      placeholder="PIN (Padrão: 1234)"
                      value={pinInput}
                      onChange={(e) => setPinInput(e.target.value)}
                      className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-2.5 py-1 text-xs text-neutral-200 focus:outline-none focus:border-amber-500"
                    />
                    <button
                      onClick={handleSwitchToAdmin}
                      className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-lg text-xs whitespace-nowrap transition-colors"
                    >
                      Acessar Admin
                    </button>
                  </div>
                  {pinError && <p className="text-[10px] text-rose-400">{pinError}</p>}
                </div>
              )}
            </div>

            {/* Operator / User Role Card */}
            <div
              className={`p-4 rounded-xl border transition-all ${
                currentRole === 'operador'
                  ? 'bg-blue-950/20 border-blue-800/80 ring-1 ring-blue-500/50'
                  : 'bg-neutral-950/60 border-neutral-800 opacity-80'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-neutral-100 flex items-center gap-1.5 text-xs">
                  <User className="w-4 h-4 text-blue-400" />
                  Usuário Operador
                </span>
                {currentRole === 'operador' && (
                  <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-blue-900 text-blue-200">
                    ATIVO
                  </span>
                )}
              </div>
              <ul className="space-y-1.5 text-[11px] text-neutral-400">
                <li className="flex items-center gap-1.5 text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Visualização ao vivo das câmeras</span>
                </li>
                <li className="flex items-center gap-1.5 text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Reprodução de gravações e download</span>
                </li>
                <li className="flex items-center gap-1.5 text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Receber alertas sonoros e sirenes</span>
                </li>
                <li className="flex items-center gap-1.5 text-neutral-500 line-through">
                  <span>Adicionar ou apagar câmeras</span>
                </li>
                <li className="flex items-center gap-1.5 text-neutral-500 line-through">
                  <span>Alterar credenciais de rede / RTSP</span>
                </li>
              </ul>

              {currentRole !== 'operador' && (
                <div className="mt-3 pt-3 border-t border-neutral-800">
                  <button
                    onClick={handleSwitchToOperator}
                    className="w-full py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-semibold rounded-lg text-xs transition-colors"
                  >
                    Mudar para Modo Operador
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Browser Notifications Permission Box */}
          <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-neutral-200 flex items-center gap-2">
                <Bell className="w-4 h-4 text-cyan-400" />
                Notificações em Segundo Plano (Browser API)
              </span>
              <span
                className={`font-mono text-[10px] uppercase font-bold px-2 py-0.5 rounded ${
                  notificationStatus === 'granted'
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                    : notificationStatus === 'denied'
                    ? 'bg-rose-950 text-rose-300 border border-rose-800'
                    : 'bg-amber-950 text-amber-300 border border-amber-800'
                }`}
              >
                {notificationStatus === 'granted'
                  ? 'Ativado'
                  : notificationStatus === 'denied'
                  ? 'Bloqueado'
                  : 'Pendente'}
              </span>
            </div>
            <p className="text-[11px] text-neutral-400">
              Receba avisos instantâneos na área de trabalho/celular quando a IA detectar uma Ameaça de nível <strong>ALTO</strong>, mesmo com a aba minimizada ou em segundo plano.
            </p>
            <div className="pt-1 flex flex-wrap gap-2">
              <button
                onClick={handleRequestNotification}
                className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white font-medium rounded-lg text-xs transition-colors shadow-sm"
              >
                {notificationStatus === 'granted'
                  ? 'Testar Alerta em 2º Plano'
                  : 'Ativar Notificações no Navegador'}
              </button>
              {notificationTestSuccess && (
                <span className="text-[11px] text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Notificação enviada ao sistema!
                </span>
              )}
            </div>
          </div>

          {/* Demonstrative Cameras Purge Utility */}
          {onPurgeDemoCameras && (
            <div className="p-3.5 rounded-xl bg-neutral-950/80 border border-neutral-800 flex items-center justify-between gap-3">
              <div>
                <span className="font-medium text-neutral-200 block text-xs">
                  Limpeza de Câmeras Demonstrativas
                </span>
                <p className="text-[11px] text-neutral-400">
                  Garante que nenhuma câmera demonstrativa ou fictícia apareça no seu painel.
                </p>
              </div>
              <button
                onClick={() => {
                  onPurgeDemoCameras();
                  onClose();
                }}
                className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-rose-950/80 hover:text-rose-300 hover:border-rose-800 border border-neutral-700 text-neutral-300 text-xs transition-colors shrink-0"
              >
                Apagar Câmeras Fictícias
              </button>
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
