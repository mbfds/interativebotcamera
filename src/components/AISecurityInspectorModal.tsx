import React, { useState } from 'react';
import {
  X,
  Sparkles,
  ShieldCheck,
  AlertTriangle,
  ShieldAlert,
  Users,
  CheckCircle,
  FileText,
  Clock,
  Building,
  RefreshCw,
} from 'lucide-react';
import { AISecurityAnalysis, AIDailyReport, CameraConfig, ClientBusiness } from '../types/camera';

interface AISecurityInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  analysis: AISecurityAnalysis | null;
  snapshotUrl: string | null;
  camera: CameraConfig | null;
  business: ClientBusiness | null;
  isLoading: boolean;
  onReanalyze: () => void;
  onGenerateDailyReport: () => Promise<void>;
  dailyReport: AIDailyReport | null;
  isLoadingDailyReport: boolean;
}

export const AISecurityInspectorModal: React.FC<AISecurityInspectorModalProps> = ({
  isOpen,
  onClose,
  analysis,
  snapshotUrl,
  camera,
  business,
  isLoading,
  onReanalyze,
  onGenerateDailyReport,
  dailyReport,
  isLoadingDailyReport,
}) => {
  const [activeTab, setActiveTab] = useState<'frame_audit' | 'daily_report'>('frame_audit');

  if (!isOpen) return null;

  const getThreatColor = (level: string) => {
    switch (level) {
      case 'alto':
        return 'text-red-400 border-red-500 bg-red-950/60';
      case 'medio':
        return 'text-amber-400 border-amber-500 bg-amber-950/60';
      case 'baixo':
      default:
        return 'text-emerald-400 border-emerald-500 bg-emerald-950/60';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-3xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-950/80 text-purple-400 border border-purple-800/80">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-neutral-100">
                  Sentinela IA - Auditoria de Segurança
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-950 border border-purple-800 text-purple-300">
                  Gemini 3.8 Flash
                </span>
              </div>
              <p className="text-xs text-neutral-400">
                {business?.name || 'Comércio Local'} · {camera?.name || 'Câmera'}
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

        {/* Tab Selection */}
        <div className="px-6 pt-3 flex items-center gap-2 border-b border-neutral-800 bg-neutral-950/40 text-xs">
          <button
            onClick={() => setActiveTab('frame_audit')}
            className={`pb-2.5 px-3 font-medium transition-colors border-b-2 ${
              activeTab === 'frame_audit'
                ? 'border-purple-500 text-purple-300 font-semibold'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Auditoria Visual do Frame
          </button>
          <button
            onClick={() => {
              setActiveTab('daily_report');
              if (!dailyReport && !isLoadingDailyReport) {
                onGenerateDailyReport();
              }
            }}
            className={`pb-2.5 px-3 font-medium transition-colors border-b-2 flex items-center gap-1.5 ${
              activeTab === 'daily_report'
                ? 'border-purple-500 text-purple-300 font-semibold'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Relatório Diário do Comércio</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs text-neutral-300">
          {activeTab === 'frame_audit' && (
            <>
              {/* Snapshot and Threat Score Bar */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Snapshot display */}
                <div className="relative aspect-video rounded-xl overflow-hidden bg-black border border-neutral-800 flex items-center justify-center">
                  {snapshotUrl ? (
                    <img
                      src={snapshotUrl}
                      alt="Frame auditado"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="text-neutral-500 text-xs">Capturando frame da câmera...</div>
                  )}
                  <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/80 font-mono text-[10px] text-neutral-300">
                    FRAME ANALISADO PELA IA
                  </div>
                </div>

                {/* Threat score & Summary */}
                <div className="flex flex-col justify-between p-4 rounded-xl bg-neutral-950/80 border border-neutral-800 space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-neutral-400">Nível de Risco Identificado:</span>
                      {analysis && (
                        <span
                          className={`font-semibold uppercase text-xs px-2.5 py-0.5 rounded border ${getThreatColor(
                            analysis.threatLevel
                          )}`}
                        >
                          {analysis.threatLevel} ({analysis.threatScore}/100)
                        </span>
                      )}
                    </div>

                    {/* Threat bar */}
                    <div className="w-full h-2 bg-neutral-800 rounded-full overflow-hidden mb-3">
                      <div
                        className={`h-full transition-all duration-500 ${
                          analysis?.threatLevel === 'alto'
                            ? 'bg-red-500'
                            : analysis?.threatLevel === 'medio'
                            ? 'bg-amber-500'
                            : 'bg-emerald-500'
                        }`}
                        style={{ width: `${analysis?.threatScore || 10}%` }}
                      />
                    </div>

                    {isLoading ? (
                      <div className="py-6 flex flex-col items-center justify-center gap-2 text-neutral-400">
                        <RefreshCw className="w-6 h-6 animate-spin text-purple-400" />
                        <span className="text-xs">Avaliando conformidade e segurança com IA...</span>
                      </div>
                    ) : (
                      <p className="text-xs text-neutral-200 leading-relaxed italic bg-neutral-900/60 p-3 rounded-lg border border-neutral-800">
                        &ldquo;{analysis?.summary || 'Nenhum risco relevante detectado no ambiente.'}&rdquo;
                      </p>
                    )}
                  </div>

                  {analysis && (
                    <div className="flex items-center gap-4 text-[11px] text-neutral-400 pt-2 border-t border-neutral-800">
                      <span className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-neutral-500" />
                        Ocupantes: <strong className="text-neutral-200">{analysis.occupancyEstimate}</strong>
                      </span>
                      <span>·</span>
                      <span className="font-mono tabular-nums">
                        {new Date(analysis.timestamp).toLocaleTimeString('pt-BR')}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Detected Elements & Security Concerns */}
              {analysis && !isLoading && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Elements Detected */}
                  <div className="p-4 rounded-xl bg-neutral-950/60 border border-neutral-800 space-y-2">
                    <h4 className="font-semibold text-neutral-200 flex items-center gap-1.5">
                      <CheckCircle className="w-4 h-4 text-emerald-400" />
                      <span>Elementos Reconhecidos no Comércio</span>
                    </h4>
                    <ul className="space-y-1.5 text-neutral-300">
                      {analysis.detectedElements.map((el, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-[11px]">
                          <span className="text-emerald-400 mt-0.5">•</span>
                          <span>{el}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Concerns & Inconformities */}
                  <div className="p-4 rounded-xl bg-neutral-950/60 border border-neutral-800 space-y-2">
                    <h4 className="font-semibold text-neutral-200 flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                      <span>Inconformidades ou Atenção</span>
                    </h4>
                    {analysis.securityConcerns && analysis.securityConcerns.length > 0 ? (
                      <ul className="space-y-1.5 text-neutral-300">
                        {analysis.securityConcerns.map((c, i) => (
                          <li key={i} className="flex items-start gap-1.5 text-[11px] text-amber-300">
                            <span className="text-amber-400 mt-0.5">•</span>
                            <span>{c}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[11px] text-neutral-400 italic">
                        Nenhuma violação ou comportamento suspeito observado no momento.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Recommendations */}
              {analysis && !isLoading && (
                <div className="p-4 rounded-xl bg-neutral-950/80 border border-neutral-800 space-y-2">
                  <h4 className="font-semibold text-neutral-200 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-purple-400" />
                    <span>Recomendações da IA para o Comércio</span>
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                    {analysis.recommendations.map((rec, i) => (
                      <div
                        key={i}
                        className="p-2.5 rounded-lg bg-neutral-900 border border-neutral-800 text-[11px] text-neutral-300 leading-snug"
                      >
                        {rec}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Tab 2: Daily Report for Local Business Owner */}
          {activeTab === 'daily_report' && (
            <div className="space-y-4">
              {isLoadingDailyReport ? (
                <div className="py-16 text-center text-neutral-400 space-y-3">
                  <RefreshCw className="w-8 h-8 mx-auto animate-spin text-purple-400" />
                  <p className="text-sm font-medium text-neutral-200">
                    Sintetizando eventos e gerando relatório executivo com Gemini 3.8 Flash...
                  </p>
                  <p className="text-xs text-neutral-500">
                    Processando movimentações, horários de pico e conformidade de segurança.
                  </p>
                </div>
              ) : dailyReport ? (
                <div className="p-5 rounded-xl bg-neutral-950/80 border border-neutral-800 space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
                    <div>
                      <h3 className="text-sm font-bold text-neutral-100">{dailyReport.reportTitle}</h3>
                      <p className="text-[11px] text-neutral-400">
                        {business?.name} · Gerado para {business?.ownerEmail || 'Proprietário'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-neutral-400">Score de Segurança:</span>
                      <span className="font-mono font-bold text-sm text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-800">
                        {dailyReport.securityScore}/100
                      </span>
                    </div>
                  </div>

                  <div>
                    <h5 className="font-semibold text-neutral-200 mb-1">Resumo Executivo</h5>
                    <p className="text-xs text-neutral-300 leading-relaxed bg-neutral-900/60 p-3 rounded-lg border border-neutral-800/80">
                      {dailyReport.executiveSummary}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="p-3 bg-neutral-900/60 rounded-lg border border-neutral-800">
                      <h5 className="font-semibold text-neutral-200 mb-1.5 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-blue-400" />
                        <span>Horário de Maior Fluxo</span>
                      </h5>
                      <p className="text-[11px] text-neutral-300">{dailyReport.busiestHour}</p>
                    </div>

                    <div className="p-3 bg-neutral-900/60 rounded-lg border border-neutral-800">
                      <h5 className="font-semibold text-neutral-200 mb-1.5 flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
                        <span>Ações Preventivas Recomendadas</span>
                      </h5>
                      <ul className="space-y-1 text-[11px] text-neutral-300">
                        {dailyReport.actionItems.map((item, i) => (
                          <li key={i} className="flex items-start gap-1">
                            <span className="text-purple-400">•</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div className="p-3 bg-neutral-900/60 rounded-lg border border-neutral-800">
                    <h5 className="font-semibold text-neutral-200 mb-1.5">Destaques do Dia</h5>
                    <ul className="space-y-1 text-[11px] text-neutral-300">
                      {dailyReport.keyHighlights.map((hl, i) => (
                        <li key={i} className="flex items-start gap-1">
                          <span className="text-emerald-400">✓</span>
                          <span>{hl}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : (
                <div className="py-12 text-center text-neutral-500">
                  <p>Clique abaixo para gerar o relatório do comércio hoje.</p>
                  <button
                    onClick={onGenerateDailyReport}
                    className="mt-3 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-medium"
                  >
                    Gerar Relatório com IA
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-3.5 bg-neutral-950 border-t border-neutral-800 flex items-center justify-between text-xs">
          <div className="text-[11px] text-neutral-500">
            Administração de CFTV Comercial com Gemini AI
          </div>

          <div className="flex items-center gap-2">
            {activeTab === 'frame_audit' && (
              <button
                onClick={onReanalyze}
                disabled={isLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 transition-colors border border-neutral-700 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                <span>Reanalisar Frame</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-medium transition-colors"
            >
              Concluir
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
