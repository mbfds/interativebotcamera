import React, { useState } from 'react';
import {
  X,
  Building2,
  Plus,
  Trash2,
  MapPin,
  Mail,
  Lock,
} from 'lucide-react';
import { ClientBusiness, UserRole } from '../types/camera';

interface ClientBusinessModalProps {
  isOpen: boolean;
  onClose: () => void;
  businesses: ClientBusiness[];
  activeBusinessId: string;
  onSelectBusiness: (id: string) => void;
  onAddBusiness: (business: ClientBusiness) => void;
  onDeleteBusiness: (id: string) => void;
  currentUserRole?: UserRole;
}

export const ClientBusinessModal: React.FC<ClientBusinessModalProps> = ({
  isOpen,
  onClose,
  businesses,
  activeBusinessId,
  onSelectBusiness,
  onAddBusiness,
  onDeleteBusiness,
  currentUserRole = 'admin',
}) => {
  const isAdmin = currentUserRole === 'admin';
  const [isCreating, setIsCreating] = useState(businesses.length === 0);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [businessType, setBusinessType] = useState<ClientBusiness['businessType']>('general');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !isAdmin) return;

    const newUnit: ClientBusiness = {
      id: `unit-${Date.now()}`,
      name: name.trim(),
      address: address.trim(),
      ownerEmail: ownerEmail.trim(),
      businessType,
      dateCreated: Date.now(),
    };

    onAddBusiness(newUnit);
    onSelectBusiness(newUnit.id);
    setIsCreating(false);
    setName('');
    setAddress('');
    setOwnerEmail('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-blue-950 text-blue-400 border border-blue-800">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-neutral-100">
                Unidades &amp; Ambientes Monitorados
              </h2>
              <p className="text-xs text-neutral-400">
                Cada unidade mantém suas câmeras, alertas e gravações isolados
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

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-4 text-xs">
          {!isCreating ? (
            <>
              <div className="flex items-center justify-between pb-1">
                <span className="text-neutral-400 font-medium">Selecione a Unidade Ativa:</span>
                {isAdmin && (
                  <button
                    onClick={() => setIsCreating(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Cadastrar Unidade</span>
                  </button>
                )}
              </div>

              {businesses.length === 0 ? (
                <div className="p-8 text-center rounded-xl bg-neutral-950/60 border border-neutral-800 space-y-3">
                  <Building2 className="w-8 h-8 text-neutral-500 mx-auto" />
                  <p className="text-sm font-medium text-neutral-200">
                    Nenhuma unidade cadastrada
                  </p>
                  <p className="text-xs text-neutral-400 max-w-sm mx-auto">
                    {isAdmin
                      ? 'Cadastre uma unidade para organizar suas câmeras e gravações.'
                      : 'Solicite ao administrador para cadastrar a primeira unidade de monitoramento.'}
                  </p>
                  {isAdmin && (
                    <button
                      onClick={() => setIsCreating(true)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Criar Primeira Unidade</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-2.5">
                  {businesses.map((unit) => {
                    const isActive = unit.id === activeBusinessId;
                    return (
                      <div
                        key={unit.id}
                        onClick={() => {
                          onSelectBusiness(unit.id);
                          onClose();
                        }}
                        className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                          isActive
                            ? 'border-blue-500 bg-blue-950/40 shadow-[0_0_15px_rgba(59,130,246,0.15)]'
                            : 'border-neutral-800 bg-neutral-950/60 hover:border-neutral-700'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`p-2 rounded-lg shrink-0 ${
                              isActive
                                ? 'bg-blue-600 text-white'
                                : 'bg-neutral-800 text-neutral-300'
                            }`}
                          >
                            <Building2 className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <h4 className="font-semibold text-neutral-100 text-sm truncate">
                                {unit.name}
                              </h4>
                              {isActive && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30 font-medium shrink-0">
                                  ATIVA
                                </span>
                              )}
                            </div>
                            {(unit.address || unit.ownerEmail) && (
                              <div className="flex items-center gap-3 text-neutral-400 text-[11px] mt-0.5 flex-wrap">
                                {unit.address && (
                                  <span className="flex items-center gap-1">
                                    <MapPin className="w-3 h-3 text-neutral-500" />
                                    {unit.address}
                                  </span>
                                )}
                                {unit.address && unit.ownerEmail && <span>·</span>}
                                {unit.ownerEmail && (
                                  <span className="flex items-center gap-1 font-mono">
                                    <Mail className="w-3 h-3 text-neutral-500" />
                                    {unit.ownerEmail}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {isAdmin && businesses.length > 1 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(`Remover unidade "${unit.name}"?`)) {
                                onDeleteBusiness(unit.id);
                              }
                            }}
                            className="p-1.5 text-neutral-500 hover:text-red-400 hover:bg-neutral-800 rounded-lg transition-colors ml-2 shrink-0"
                            title="Remover unidade"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {!isAdmin && (
                <div className="p-3 rounded-xl bg-neutral-950/60 border border-neutral-800 flex items-center gap-2 text-[11px] text-neutral-400">
                  <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>Criação e remoção de unidades são restritas ao Administrador.</span>
                </div>
              )}
            </>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
                <span className="font-semibold text-neutral-200">Nova Unidade Monitorada</span>
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="text-neutral-400 hover:text-neutral-200"
                >
                  Cancelar
                </button>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">
                  Nome da Unidade / Local
                </label>
                <input
                  type="text"
                  required
                  placeholder="Informe o nome da unidade"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-neutral-100 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1">
                    Tipo de Ambiente
                  </label>
                  <select
                    value={businessType}
                    onChange={(e) =>
                      setBusinessType(e.target.value as ClientBusiness['businessType'])
                    }
                    className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-neutral-100 focus:outline-none focus:border-blue-500"
                  >
                    <option value="general">Ambiente Geral</option>
                    <option value="residence">Residência / Condomínio</option>
                    <option value="office">Escritório / Consultório</option>
                    <option value="warehouse">Depósito / Galpão</option>
                    <option value="facility">Unidade Operacional</option>
                    <option value="retail">Ponto de Atendimento</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1">
                    E-mail do Responsável (Opcional)
                  </label>
                  <input
                    type="email"
                    placeholder="responsavel@dominio.com"
                    value={ownerEmail}
                    onChange={(e) => setOwnerEmail(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-neutral-100 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">
                  Endereço / Referência (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="Endereço ou setor da instalação"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-neutral-100 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-3.5 py-2 text-xs font-medium text-neutral-400 hover:text-neutral-200"
                >
                  Voltar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  Salvar e Ativar Unidade
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-neutral-950 border-t border-neutral-800 flex justify-between items-center text-[11px] text-neutral-500">
          <span>Monitoramento Multiunidade</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium text-neutral-200 bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
