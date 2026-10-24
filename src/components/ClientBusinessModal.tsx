import React, { useState } from 'react';
import {
  X,
  Building2,
  Plus,
  Check,
  Shield,
  Trash2,
  Store,
  MapPin,
  Mail,
} from 'lucide-react';
import { ClientBusiness } from '../types/camera';

interface ClientBusinessModalProps {
  isOpen: boolean;
  onClose: () => void;
  businesses: ClientBusiness[];
  activeBusinessId: string;
  onSelectBusiness: (id: string) => void;
  onAddBusiness: (business: ClientBusiness) => void;
  onDeleteBusiness: (id: string) => void;
}

export const ClientBusinessModal: React.FC<ClientBusinessModalProps> = ({
  isOpen,
  onClose,
  businesses,
  activeBusinessId,
  onSelectBusiness,
  onAddBusiness,
  onDeleteBusiness,
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [businessType, setBusinessType] = useState<ClientBusiness['businessType']>('retail');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const newBiz: ClientBusiness = {
      id: `biz-${Date.now()}`,
      name: name.trim(),
      address: address.trim() || 'Endereço Comercial',
      ownerEmail: ownerEmail.trim() || 'cliente@comercio.com',
      businessType,
      dateCreated: Date.now(),
    };

    onAddBusiness(newBiz);
    onSelectBusiness(newBiz.id);
    setIsCreating(false);
    setName('');
    setAddress('');
    setOwnerEmail('');
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
                Gerenciar Comércios &amp; Clientes
              </h2>
              <p className="text-xs text-neutral-400">
                Isolamento total: cada comércio visualiza e salva apenas seus próprios vídeos
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
                <span className="text-neutral-400 font-medium">Selecione o Comércio Ativo:</span>
                <button
                  onClick={() => setIsCreating(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Cadastrar Novo Comércio</span>
                </button>
              </div>

              {/* Businesses list */}
              <div className="space-y-2.5">
                {businesses.map((biz) => {
                  const isActive = biz.id === activeBusinessId;
                  return (
                    <div
                      key={biz.id}
                      onClick={() => {
                        onSelectBusiness(biz.id);
                        onClose();
                      }}
                      className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                        isActive
                          ? 'border-blue-500 bg-blue-950/40 shadow-[0_0_15px_rgba(59,130,246,0.15)]'
                          : 'border-neutral-800 bg-neutral-950/60 hover:border-neutral-700'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`p-2 rounded-lg ${
                            isActive
                              ? 'bg-blue-600 text-white'
                              : 'bg-neutral-800 text-neutral-300'
                          }`}
                        >
                          <Store className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold text-neutral-100 text-sm">{biz.name}</h4>
                            {isActive && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30 font-medium">
                                ATIVO
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-neutral-400 text-[11px] mt-0.5">
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-neutral-500" />
                              {biz.address}
                            </span>
                            <span>·</span>
                            <span className="flex items-center gap-1 font-mono">
                              <Mail className="w-3 h-3 text-neutral-500" />
                              {biz.ownerEmail}
                            </span>
                          </div>
                        </div>
                      </div>

                      {businesses.length > 1 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`Remover comércio "${biz.name}"?`)) {
                              onDeleteBusiness(biz.id);
                            }
                          }}
                          className="p-1.5 text-neutral-500 hover:text-red-400 hover:bg-neutral-800 rounded-lg transition-colors ml-2"
                          title="Remover comércio"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            /* Create New Business Form */
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
                <span className="font-semibold text-neutral-200">Novo Comércio Cliente</span>
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
                  Nome do Estabelecimento / Loja
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Padaria Central, Mercado do Bairro, Ótica Visão"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-neutral-100 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1">
                    Tipo de Comércio
                  </label>
                  <select
                    value={businessType}
                    onChange={(e) =>
                      setBusinessType(e.target.value as ClientBusiness['businessType'])
                    }
                    className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-neutral-100 focus:outline-none focus:border-blue-500"
                  >
                    <option value="retail">Varejo / Loja Geral</option>
                    <option value="food">Restaurante / Padaria / Bar</option>
                    <option value="pharmacy">Farmácia / Drogaria</option>
                    <option value="warehouse">Depósito / Galpão</option>
                    <option value="office">Escritório / Clínica</option>
                    <option value="general">Outros Serviços</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1">
                    Email do Proprietário (Google Drive)
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="cliente@gmail.com"
                    value={ownerEmail}
                    onChange={(e) => setOwnerEmail(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-neutral-100 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">
                  Endereço / Cidade
                </label>
                <input
                  type="text"
                  placeholder="Ex: Av. Brasil, 500 - Sala 2"
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
                  className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors"
                >
                  Salvar e Ativar Comércio
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-neutral-950 border-t border-neutral-800 flex justify-between items-center text-[11px] text-neutral-500">
          <span>Serviço Multiusuário de CFTV Comercial</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium text-neutral-200 bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
