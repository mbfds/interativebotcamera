import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  ShieldCheck,
  User,
  KeyRound,
  CheckCircle2,
  Bell,
  LogOut,
  UserPlus,
  Trash2,
  Users,
  Power,
} from 'lucide-react';
import { AuthUser, UserRole } from '../types/camera';
import {
  listUsers,
  createUserAccount,
  updateUserAccount,
  deleteUserAccount,
  changeOwnPassword,
} from '../services/auth';
import {
  getBrowserNotificationPermission,
  requestBrowserNotificationPermission,
  sendHighThreatBrowserNotification,
} from '../utils/browserNotifications';

interface UserRoleModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: AuthUser;
  onLogout: () => void;
  activeUnitName?: string;
}

export const UserRoleModal: React.FC<UserRoleModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onLogout,
  activeUnitName,
}) => {
  const isAdmin = currentUser.role === 'admin';
  const [activeTab, setActiveTab] = useState<'account' | 'users'>('account');

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwdFeedback, setPwdFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [isUpdatingPwd, setIsUpdatingPwd] = useState(false);

  // Admin user management state
  const [usersList, setUsersList] = useState<AuthUser[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [newUserForm, setNewUserForm] = useState({
    name: '',
    username: '',
    email: '',
    password: '',
    role: 'operador' as UserRole,
  });
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [resetPwdUserId, setResetPwdUserId] = useState<string | null>(null);
  const [resetPwdValue, setResetPwdValue] = useState('');

  // Browser notification state
  const [notificationStatus, setNotificationStatus] = useState<string>(
    getBrowserNotificationPermission()
  );
  const [notificationTestSuccess, setNotificationTestSuccess] = useState(false);

  const loadUsers = useCallback(async () => {
    if (!isAdmin) return;
    setIsLoadingUsers(true);
    setUsersError(null);
    try {
      const list = await listUsers();
      setUsersList(list);
    } catch (err: unknown) {
      setUsersError(err instanceof Error ? err.message : 'Erro ao carregar usuários.');
    } finally {
      setIsLoadingUsers(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (isOpen && isAdmin && activeTab === 'users') {
      loadUsers();
    }
  }, [isOpen, isAdmin, activeTab, loadUsers]);

  useEffect(() => {
    if (!isOpen) {
      setPwdFeedback(null);
      setUsersError(null);
      setResetPwdUserId(null);
      setResetPwdValue('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleChangeOwnPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdFeedback(null);
    setIsUpdatingPwd(true);
    try {
      await changeOwnPassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setPwdFeedback({ type: 'ok', text: 'Senha alterada com sucesso.' });
    } catch (err: unknown) {
      setPwdFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao atualizar senha.',
      });
    } finally {
      setIsUpdatingPwd(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setUsersError(null);
    setIsCreatingUser(true);
    try {
      await createUserAccount(newUserForm);
      setNewUserForm({ name: '', username: '', email: '', password: '', role: 'operador' });
      await loadUsers();
    } catch (err: unknown) {
      setUsersError(err instanceof Error ? err.message : 'Erro ao cadastrar usuário.');
    } finally {
      setIsCreatingUser(false);
    }
  };

  const handleToggleRole = async (u: AuthUser) => {
    setUsersError(null);
    try {
      const nextRole: UserRole = u.role === 'admin' ? 'operador' : 'admin';
      await updateUserAccount(u.id, { role: nextRole });
      await loadUsers();
    } catch (err: unknown) {
      setUsersError(err instanceof Error ? err.message : 'Erro ao alterar função.');
    }
  };

  const handleToggleActive = async (u: AuthUser) => {
    setUsersError(null);
    try {
      await updateUserAccount(u.id, { active: !u.active });
      await loadUsers();
    } catch (err: unknown) {
      setUsersError(err instanceof Error ? err.message : 'Erro ao alterar status.');
    }
  };

  const handleResetPassword = async (userId: string) => {
    if (resetPwdValue.length < 6) {
      setUsersError('A nova senha deve ter no mínimo 6 caracteres.');
      return;
    }
    setUsersError(null);
    try {
      await updateUserAccount(userId, { password: resetPwdValue });
      setResetPwdUserId(null);
      setResetPwdValue('');
      await loadUsers();
    } catch (err: unknown) {
      setUsersError(err instanceof Error ? err.message : 'Erro ao redefinir senha.');
    }
  };

  const handleDeleteUser = async (u: AuthUser) => {
    if (!confirm(`Remover permanentemente o usuário "${u.name}" (${u.username})?`)) return;
    setUsersError(null);
    try {
      await deleteUserAccount(u.id);
      await loadUsers();
    } catch (err: unknown) {
      setUsersError(err instanceof Error ? err.message : 'Erro ao excluir usuário.');
    }
  };

  const handleRequestNotification = async () => {
    const perm = await requestBrowserNotificationPermission();
    setNotificationStatus(perm);
    if (perm === 'granted') {
      sendHighThreatBrowserNotification({
        cameraName: 'Teste de Alerta',
        threatScore: 95,
        reason: 'Notificações em segundo plano ativadas.',
        location: activeUnitName,
      });
      setNotificationTestSuccess(true);
      setTimeout(() => setNotificationTestSuccess(false), 4000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className={`p-2 rounded-xl border ${
                isAdmin
                  ? 'bg-amber-950/70 border-amber-800/80 text-amber-400'
                  : 'bg-blue-950/70 border-blue-800/80 text-blue-400'
              }`}
            >
              {isAdmin ? <ShieldCheck className="w-5 h-5" /> : <User className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-base font-bold text-neutral-100">
                Conta &amp; Controle de Acesso
              </h2>
              <p className="text-xs text-neutral-400">
                {currentUser.name} · @{currentUser.username} ·{' '}
                {isAdmin ? 'Administrador' : 'Operador'}
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

        {/* Navigation Tabs */}
        <div className="px-6 pt-2 flex items-center gap-4 border-b border-neutral-800 bg-neutral-950/40 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('account')}
            className={`pb-2.5 px-2 font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
              activeTab === 'account'
                ? 'border-blue-500 text-blue-400 font-semibold'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>Minha Conta &amp; Alertas</span>
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={() => setActiveTab('users')}
              className={`pb-2.5 px-2 font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                activeTab === 'users'
                  ? 'border-amber-500 text-amber-300 font-semibold'
                  : 'border-transparent text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Gerenciar Usuários</span>
            </button>
          )}
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs text-neutral-300">
          {activeTab === 'account' && (
            <>
              {/* Active Account Summary */}
              <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="text-[11px] text-neutral-400 block">Usuário Autenticado</span>
                  <div className="text-sm font-bold text-neutral-100 flex items-center gap-2 mt-0.5">
                    <span>{currentUser.name}</span>
                    <span className="text-neutral-500">·</span>
                    <span className="font-mono text-xs text-neutral-400">
                      {currentUser.email || `@${currentUser.username}`}
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-500 mt-1">
                    {isAdmin
                      ? 'Privilégio de Administrador: acesso completo a rede, câmeras, agendamentos e usuários.'
                      : 'Privilégio de Operador: monitoramento ao vivo e reprodução de gravações com segurança operacional.'}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={onLogout}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-neutral-900 hover:bg-red-950/70 hover:text-red-300 border border-neutral-700 hover:border-red-800 text-neutral-300 font-medium transition-colors whitespace-nowrap shrink-0 self-start sm:self-center"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sair da Conta</span>
                </button>
              </div>

              {/* Change Password Form */}
              <form
                onSubmit={handleChangeOwnPassword}
                className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 space-y-3"
              >
                <div className="flex items-center gap-2 font-semibold text-neutral-200">
                  <KeyRound className="w-4 h-4 text-blue-400" />
                  <span>Alterar Minha Senha</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="password"
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Senha atual"
                    className="bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-100 focus:outline-none focus:border-blue-500"
                  />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Nova senha (mín. 6 caracteres)"
                    className="bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-100 focus:outline-none focus:border-blue-500"
                  />
                </div>

                {pwdFeedback && (
                  <p
                    className={`text-[11px] ${
                      pwdFeedback.type === 'ok' ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {pwdFeedback.text}
                  </p>
                )}

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={isUpdatingPwd}
                    className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium text-xs transition-colors whitespace-nowrap shrink-0"
                  >
                    {isUpdatingPwd ? 'Atualizando...' : 'Atualizar Senha'}
                  </button>
                </div>
              </form>

              {/* Browser Notifications Permission Box */}
              <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-neutral-200 flex items-center gap-2">
                    <Bell className="w-4 h-4 text-cyan-400" />
                    Notificações em Segundo Plano (Navegador)
                  </span>
                  <span
                    className={`font-mono text-[10px] uppercase font-bold ${
                      notificationStatus === 'granted'
                        ? 'text-emerald-400'
                        : notificationStatus === 'denied'
                        ? 'text-rose-400'
                        : 'text-amber-400'
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
                  Receba avisos instantâneos quando a IA identificar uma ameaça de nível{' '}
                  <strong>ALTO</strong>, mesmo com a aba em segundo plano.
                </p>
                <div className="pt-1 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleRequestNotification}
                    className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white font-medium rounded-lg text-xs transition-colors whitespace-nowrap shrink-0"
                  >
                    {notificationStatus === 'granted'
                      ? 'Testar Notificação'
                      : 'Ativar Notificações no Navegador'}
                  </button>
                  {notificationTestSuccess && (
                    <span className="text-[11px] text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Notificação enviada!
                    </span>
                  )}
                </div>
              </div>
            </>
          )}

          {activeTab === 'users' && isAdmin && (
            <div className="space-y-4">
              {/* Add User Form */}
              <form
                onSubmit={handleCreateUser}
                className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 space-y-3"
              >
                <div className="flex items-center gap-2 font-semibold text-neutral-200">
                  <UserPlus className="w-4 h-4 text-blue-400" />
                  <span>Cadastrar Novo Usuário</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    required
                    value={newUserForm.name}
                    onChange={(e) => setNewUserForm((p) => ({ ...p, name: e.target.value }))}
                    placeholder="Nome completo"
                    className="bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-100 focus:outline-none focus:border-blue-500"
                  />
                  <input
                    type="text"
                    required
                    value={newUserForm.username}
                    onChange={(e) => setNewUserForm((p) => ({ ...p, username: e.target.value }))}
                    placeholder="Usuário de login"
                    className="bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-100 font-mono focus:outline-none focus:border-blue-500"
                  />
                  <input
                    type="email"
                    value={newUserForm.email}
                    onChange={(e) => setNewUserForm((p) => ({ ...p, email: e.target.value }))}
                    placeholder="E-mail (opcional)"
                    className="bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-100 focus:outline-none focus:border-blue-500"
                  />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={newUserForm.password}
                    onChange={(e) => setNewUserForm((p) => ({ ...p, password: e.target.value }))}
                    placeholder="Senha inicial (mín. 6)"
                    className="bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-100 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div className="flex items-center gap-2">
                    <span className="text-neutral-400">Perfil:</span>
                    <select
                      value={newUserForm.role}
                      onChange={(e) =>
                        setNewUserForm((p) => ({ ...p, role: e.target.value as UserRole }))
                      }
                      className="bg-neutral-900 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs text-neutral-100 focus:outline-none focus:border-blue-500"
                    >
                      <option value="operador">Operador (Visualização &amp; Gravações)</option>
                      <option value="admin">Administrador (Acesso Total)</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    disabled={isCreatingUser}
                    className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-xs transition-colors whitespace-nowrap shrink-0"
                  >
                    {isCreatingUser ? 'Salvando...' : 'Criar Usuário'}
                  </button>
                </div>
              </form>

              {usersError && (
                <div className="p-3 rounded-xl bg-red-950/60 border border-red-800 text-red-200 text-xs">
                  {usersError}
                </div>
              )}

              {/* Registered Users List */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-neutral-400 font-medium">
                  <span>Contas Cadastradas ({usersList.length})</span>
                  {isLoadingUsers && <span className="text-[11px]">Carregando...</span>}
                </div>

                {usersList.map((u) => {
                  const isSelf = u.id === currentUser.id;
                  return (
                    <div
                      key={u.id}
                      className="p-3.5 rounded-xl bg-neutral-950 border border-neutral-800 space-y-2.5"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-neutral-100 text-sm truncate">
                              {u.name}
                            </span>
                            <span className="text-neutral-500">·</span>
                            <span className="font-mono text-[11px] text-neutral-400">
                              @{u.username}
                            </span>
                            {isSelf && (
                              <span className="text-[11px] text-blue-400 font-medium">· Você</span>
                            )}
                            {!u.active && (
                              <span className="text-[11px] text-rose-400 font-medium">· Inativo</span>
                            )}
                          </div>
                          <div className="text-[11px] text-neutral-500 flex items-center gap-2 mt-0.5">
                            <span>{u.email || 'Sem e-mail cadastrado'}</span>
                            <span>·</span>
                            <span
                              className={
                                u.role === 'admin' ? 'text-amber-400 font-medium' : 'text-blue-400'
                              }
                            >
                              {u.role === 'admin' ? 'Administrador' : 'Operador'}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                          <button
                            type="button"
                            onClick={() => handleToggleRole(u)}
                            className="px-2.5 py-1 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-[11px] text-neutral-300 transition-colors whitespace-nowrap shrink-0"
                            title="Alternar entre Administrador e Operador"
                          >
                            {u.role === 'admin' ? 'Tornar Operador' : 'Tornar Admin'}
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              setResetPwdUserId(resetPwdUserId === u.id ? null : u.id)
                            }
                            className="px-2.5 py-1 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-[11px] text-neutral-300 transition-colors whitespace-nowrap shrink-0"
                          >
                            Redefinir Senha
                          </button>

                          {!isSelf && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleToggleActive(u)}
                                className={`p-1.5 rounded-lg border transition-colors ${
                                  u.active
                                    ? 'bg-neutral-900 border-neutral-800 text-emerald-400 hover:bg-neutral-800'
                                    : 'bg-neutral-900 border-neutral-800 text-neutral-500 hover:text-emerald-400'
                                }`}
                                title={u.active ? 'Desativar usuário' : 'Reativar usuário'}
                              >
                                <Power className="w-3.5 h-3.5" />
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDeleteUser(u)}
                                className="p-1.5 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-500 hover:text-red-400 hover:bg-neutral-800 transition-colors"
                                title="Excluir usuário"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {resetPwdUserId === u.id && (
                        <div className="pt-2 border-t border-neutral-800 flex items-center gap-2">
                          <input
                            type="password"
                            value={resetPwdValue}
                            onChange={(e) => setResetPwdValue(e.target.value)}
                            placeholder="Nova senha (mín. 6 caracteres)"
                            className="flex-1 bg-neutral-900 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-xs text-neutral-100 focus:outline-none focus:border-blue-500"
                          />
                          <button
                            type="button"
                            onClick={() => handleResetPassword(u.id)}
                            className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium whitespace-nowrap shrink-0"
                          >
                            Salvar Senha
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-neutral-950 border-t border-neutral-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
