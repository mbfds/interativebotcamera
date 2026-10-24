import React from 'react';
import { X, Activity, ShieldAlert, Trash2 } from 'lucide-react';
import { MotionEvent } from '../types/camera';

interface MotionLogPanelProps {
  isOpen: boolean;
  onClose: () => void;
  events: MotionEvent[];
  onClearEvents: () => void;
  onNavigateToRecordings: () => void;
}

export const MotionLogPanel: React.FC<MotionLogPanelProps> = ({
  isOpen,
  onClose,
  events,
  onClearEvents,
  onNavigateToRecordings,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-96 bg-neutral-900 border-l border-neutral-800 shadow-2xl flex flex-col animate-slide-left">
      {/* Header */}
      <div className="px-5 py-4 border-b border-neutral-800 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-amber-950/80 text-amber-400 border border-amber-800/80">
            <ShieldAlert className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-neutral-100">Log de Movimentos</h3>
            <p className="text-xs text-neutral-400 font-mono tabular-nums">
              {events.length} {events.length === 1 ? 'evento registrado' : 'eventos registrados'}
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

      {/* Events List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2.5 text-xs">
        {events.length === 0 ? (
          <div className="py-12 text-center text-neutral-500">
            <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="font-medium text-neutral-400">Nenhum evento registrado ainda</p>
            <p className="text-[11px] text-neutral-500 mt-1 max-w-xs mx-auto">
              Quando alguma câmera detectar movimento, os alertas e gravações correspondentes aparecerão aqui.
            </p>
          </div>
        ) : (
          events.map((evt) => {
            const timeStr = new Date(evt.timestamp).toLocaleTimeString('pt-BR', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            });
            const dateStr = new Date(evt.timestamp).toLocaleDateString('pt-BR', {
              day: '2-digit',
              month: '2-digit',
            });

            return (
              <div
                key={evt.id}
                className="p-3 bg-neutral-950/80 border border-neutral-800/80 rounded-xl space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-neutral-200">{evt.cameraName}</span>
                  <span className="font-mono tabular-nums text-[11px] text-neutral-400">
                    {dateStr} {timeStr}
                  </span>
                </div>

                <div className="flex items-center justify-between text-neutral-400 text-[11px]">
                  <span className="flex items-center gap-1.5 text-amber-400 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                    Movimento Detectado
                  </span>
                  <span className="font-mono tabular-nums text-neutral-500">
                    Intensidade: {evt.intensity}%
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-neutral-800 bg-neutral-950/80 flex items-center justify-between text-xs">
        {events.length > 0 && (
          <button
            onClick={onClearEvents}
            className="flex items-center gap-1 text-neutral-500 hover:text-red-400 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Limpar Histórico</span>
          </button>
        )}

        <button
          onClick={() => {
            onClose();
            onNavigateToRecordings();
          }}
          className="ml-auto text-blue-400 hover:text-blue-300 font-medium transition-colors"
        >
          Ver Gravações Salvas &rarr;
        </button>
      </div>
    </div>
  );
};
