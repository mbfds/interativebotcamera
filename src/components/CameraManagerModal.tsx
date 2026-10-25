import { X, Trash2, Sliders, Shield, Video, Volume2, VolumeX, Eye, Lock, Wifi, ShieldCheck } from 'lucide-react';
import { CameraConfig, UserRole } from '../types/camera';

interface CameraManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  cameras: CameraConfig[];
  onUpdateCamera: (camera: CameraConfig) => void;
  onDeleteCamera: (id: string) => void;
  onOpenAddModal: () => void;
  currentUserRole?: UserRole;
}

export const CameraManagerModal: React.FC<CameraManagerModalProps> = ({
  isOpen,
  onClose,
  cameras,
  onUpdateCamera,
  onDeleteCamera,
  onOpenAddModal,
  currentUserRole = 'admin',
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-neutral-800 text-neutral-200">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-neutral-100">Gerenciar Câmeras</h2>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold border ${
                    currentUserRole === 'admin'
                      ? 'bg-amber-950 text-amber-300 border-amber-800'
                      : 'bg-emerald-950 text-emerald-300 border-emerald-800'
                  }`}
                >
                  {currentUserRole === 'admin' ? 'MODO ADMIN' : 'MODO OPERADOR'}
                </span>
              </div>
              <p className="text-xs text-neutral-400">
                {cameras.length} {cameras.length === 1 ? 'câmera configurada' : 'câmeras configuradas'}
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

        {/* Operational Security Notice */}
        {currentUserRole === 'operador' && (
          <div className="px-6 py-2.5 bg-neutral-950/90 border-b border-neutral-800/80 flex items-center gap-2 text-[11px] text-neutral-400">
            <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>
              <strong>Segurança Operacional Ativa:</strong> Configurações críticas de rede (IPs, portas RTSP) e exclusão de câmeras estão ocultas para operadores.
            </span>
          </div>
        )}

        {/* List of Cameras */}
        <div className="p-6 overflow-y-auto space-y-4 text-xs">
          {cameras.map((cam) => (
            <div
              key={cam.id}
              className="p-4 bg-neutral-950/70 border border-neutral-800 rounded-xl space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-neutral-800 text-neutral-300">
                    <Video className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-neutral-200 text-sm">{cam.name}</h4>
                    <span className="text-neutral-400">{cam.location}</span>
                    <span className="text-neutral-600 mx-1.5">·</span>
                    <span className="text-neutral-400 font-mono uppercase text-[11px]">
                      {cam.type === 'webcam' ? 'Webcam USB' : cam.type === 'ip_stream' ? 'Stream IP' : 'Simulador CCTV'}
                    </span>
                  </div>
                </div>

                {currentUserRole === 'admin' && (
                  <button
                    onClick={() => {
                      if (confirm(`Remover a câmera "${cam.name}"?`)) {
                        onDeleteCamera(cam.id);
                      }
                    }}
                    className="p-1.5 text-neutral-500 hover:text-red-400 hover:bg-neutral-800 rounded-lg transition-colors"
                    title="Remover câmera (Administrador)"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Settings row */}
              <div className="pt-2 border-t border-neutral-800/80 grid grid-cols-1 sm:grid-cols-2 gap-3 text-neutral-300">
                {/* Motion toggle */}
                <div className="flex items-center justify-between p-2 bg-neutral-900 rounded-lg border border-neutral-800">
                  <div className="flex items-center gap-2">
                    <Shield className="w-3.5 h-3.5 text-blue-400" />
                    <span>Sensor de Movimento</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={cam.motionDetectionEnabled}
                    onChange={(e) =>
                      onUpdateCamera({ ...cam, motionDetectionEnabled: e.target.checked })
                    }
                    className="rounded bg-neutral-800 border-neutral-700 text-blue-600 focus:ring-0"
                  />
                </div>

                {/* Auto-record on motion */}
                <div className="flex items-center justify-between p-2 bg-neutral-900 rounded-lg border border-neutral-800">
                  <span>Auto-Gravação por Movimento</span>
                  <input
                    type="checkbox"
                    checked={cam.autoRecordOnMotion}
                    onChange={(e) =>
                      onUpdateCamera({ ...cam, autoRecordOnMotion: e.target.checked })
                    }
                    className="rounded bg-neutral-800 border-neutral-700 text-blue-600 focus:ring-0"
                  />
                </div>

                {/* Individual Sound Alert Toggle */}
                <div className="flex items-center justify-between p-2 bg-neutral-900 rounded-lg border border-neutral-800 sm:col-span-2">
                  <div className="flex items-center gap-2">
                    {cam.soundAlarmEnabled !== false ? (
                      <Volume2 className="w-3.5 h-3.5 text-blue-400" />
                    ) : (
                      <VolumeX className="w-3.5 h-3.5 text-neutral-400" />
                    )}
                    <div>
                      <span className="font-medium text-neutral-200">Alarme Sonoro &amp; Sirene de Ameaça IA</span>
                      <p className="text-[10px] text-neutral-400">
                        {cam.soundAlarmEnabled !== false
                          ? 'Sirene ativada em detecções de Ameaça Alta da IA para este feed'
                          : 'Som silenciado individualmente nesta câmera'}
                      </p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={cam.soundAlarmEnabled !== false}
                    onChange={(e) =>
                      onUpdateCamera({ ...cam, soundAlarmEnabled: e.target.checked })
                    }
                    className="rounded bg-neutral-800 border-neutral-700 text-blue-600 focus:ring-0"
                  />
                </div>

                {/* Motion Sensitivity Slider */}
                {cam.motionDetectionEnabled && (
                  <div className="sm:col-span-2 p-2.5 bg-neutral-900 rounded-lg border border-neutral-800 flex items-center gap-3">
                    <span className="text-neutral-400 whitespace-nowrap">Sensibilidade ({cam.motionSensitivity}%):</span>
                    <input
                      type="range"
                      min="10"
                      max="90"
                      value={cam.motionSensitivity}
                      onChange={(e) =>
                        onUpdateCamera({ ...cam, motionSensitivity: parseInt(e.target.value) })
                      }
                      className="w-full accent-blue-500 h-1 bg-neutral-700 rounded-lg cursor-pointer"
                    />
                  </div>
                )}

                {/* Critical Network Endpoint & RTSP Config - Hidden for Operator */}
                {currentUserRole === 'admin' && (cam.ipHost || cam.streamUrl) && (
                  <div className="sm:col-span-2 p-2.5 bg-neutral-900/90 rounded-lg border border-neutral-800 text-[11px] font-mono space-y-1">
                    <div className="flex items-center justify-between text-neutral-400">
                      <span className="flex items-center gap-1.5 text-cyan-300 font-sans font-semibold text-xs">
                        <Wifi className="w-3.5 h-3.5 text-cyan-400" />
                        Configuração de Rede & RTSP (Admin)
                      </span>
                      <span className="text-[10px] text-neutral-500">Porta: {cam.ipPort || 554}</span>
                    </div>
                    {cam.ipHost && (
                      <p className="text-neutral-300 truncate">
                        <span className="text-neutral-500">Host IP:</span> {cam.ipHost} · Canal {cam.ipChannel || 1}
                      </p>
                    )}
                    {cam.streamUrl && (
                      <p className="text-neutral-400 text-[10px] truncate" title={cam.streamUrl}>
                        <span className="text-neutral-500">Stream:</span> {cam.streamUrl}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Add Camera Action inside manager */}
          {currentUserRole === 'admin' ? (
            <button
              onClick={() => {
                onClose();
                onOpenAddModal();
              }}
              className="w-full py-3 border border-dashed border-neutral-700 hover:border-blue-500 rounded-xl text-neutral-400 hover:text-blue-400 text-xs font-medium transition-colors flex items-center justify-center gap-2"
            >
              <span>+ Adicionar Outra Câmera</span>
            </button>
          ) : (
            <div className="w-full py-2.5 border border-neutral-800 rounded-xl text-neutral-500 text-xs text-center flex items-center justify-center gap-1.5 bg-neutral-950/40">
              <Lock className="w-3.5 h-3.5" />
              <span>Inclusão e exclusão de câmeras permitida apenas para Administradores</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-neutral-950 border-t border-neutral-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors"
          >
            Concluir
          </button>
        </div>
      </div>
    </div>
  );
};
