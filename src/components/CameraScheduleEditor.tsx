import React from 'react';
import { CalendarClock, Clock, PauseCircle, PlayCircle, Lock } from 'lucide-react';
import { DayOfWeek, RecordingSchedule } from '../types/camera';
import {
  DAYS_OF_WEEK,
  DEFAULT_RECORDING_SCHEDULE,
  evaluateRecordingSchedule,
  formatScheduleSummary,
} from '../utils/recordingSchedule';

interface CameraScheduleEditorProps {
  schedule?: RecordingSchedule;
  onChange: (schedule: RecordingSchedule) => void;
  readOnly?: boolean;
  compact?: boolean;
}

export const CameraScheduleEditor: React.FC<CameraScheduleEditorProps> = ({
  schedule,
  onChange,
  readOnly = false,
  compact = false,
}) => {
  const current: RecordingSchedule = schedule || DEFAULT_RECORDING_SCHEDULE;
  const evaluation = evaluateRecordingSchedule(current);

  const update = (patch: Partial<RecordingSchedule>) => {
    if (readOnly) return;
    onChange({
      ...current,
      ...patch,
    });
  };

  const toggleDay = (day: DayOfWeek) => {
    if (readOnly) return;
    const exists = current.days.includes(day);
    const nextDays = exists
      ? current.days.filter((d) => d !== day)
      : [...current.days, day].sort((a, b) => a - b);
    update({ days: nextDays });
  };

  return (
    <div className="p-3 bg-neutral-900 rounded-xl border border-neutral-800 space-y-3 text-xs">
      {/* Header Row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <CalendarClock className="w-4 h-4 text-cyan-400 shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-neutral-200">
                Agendamento de Gravação
              </span>
              <span
                className={`inline-flex items-center gap-1 text-[11px] font-medium ${
                  evaluation.isScheduledPause ? 'text-amber-400' : 'text-emerald-400'
                }`}
              >
                {evaluation.isScheduledPause ? (
                  <PauseCircle className="w-3 h-3 shrink-0" />
                ) : (
                  <PlayCircle className="w-3 h-3 shrink-0" />
                )}
                <span>{evaluation.isScheduledPause ? 'Pausada agora' : 'Ativa agora'}</span>
              </span>
            </div>
            <p className="text-[11px] text-neutral-400 truncate">
              {formatScheduleSummary(current)}
            </p>
          </div>
        </div>

        {readOnly ? (
          <span className="flex items-center gap-1 text-[11px] text-neutral-500 shrink-0">
            <Lock className="w-3 h-3" />
            <span>Somente Admin</span>
          </span>
        ) : (
          <label className="flex items-center gap-2 cursor-pointer shrink-0">
            <span className="text-[11px] text-neutral-400">
              {current.enabled ? 'Ativado' : '24/7'}
            </span>
            <input
              type="checkbox"
              checked={current.enabled}
              onChange={(e) =>
                update({
                  enabled: e.target.checked,
                  days: current.days.length > 0 ? current.days : [1, 2, 3, 4, 5],
                })
              }
              className="rounded bg-neutral-800 border-neutral-700 text-cyan-500 focus:ring-0"
            />
          </label>
        )}
      </div>

      {/* Expanded Schedule Config when enabled */}
      {current.enabled && !readOnly && (
        <div className="pt-2.5 border-t border-neutral-800 space-y-3">
          {/* Mode Selector */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => update({ mode: 'allow_window' })}
              className={`p-2 rounded-lg border text-left transition-colors ${
                current.mode === 'allow_window'
                  ? 'bg-emerald-950/50 border-emerald-600/80 text-emerald-200'
                  : 'bg-neutral-950/60 border-neutral-800 text-neutral-400 hover:border-neutral-700'
              }`}
            >
              <span className="block font-semibold text-[11px]">
                Ativar apenas na janela
              </span>
              <span className="block text-[10px] opacity-80">
                Grava nos dias/horários abaixo e pausa no restante
              </span>
            </button>

            <button
              type="button"
              onClick={() => update({ mode: 'pause_window' })}
              className={`p-2 rounded-lg border text-left transition-colors ${
                current.mode === 'pause_window'
                  ? 'bg-amber-950/50 border-amber-600/80 text-amber-200'
                  : 'bg-neutral-950/60 border-neutral-800 text-neutral-400 hover:border-neutral-700'
              }`}
            >
              <span className="block font-semibold text-[11px]">
                Pausar apenas na janela
              </span>
              <span className="block text-[10px] opacity-80">
                Pausa nos dias/horários abaixo e grava no restante
              </span>
            </button>
          </div>

          {/* Days of Week Selector */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-[11px] text-neutral-400">Dias da Semana:</span>
              {!compact && (
                <div className="flex items-center gap-1.5 text-[10px]">
                  <button
                    type="button"
                    onClick={() => update({ days: [1, 2, 3, 4, 5] })}
                    className="px-2 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300"
                  >
                    Seg–Sex
                  </button>
                  <button
                    type="button"
                    onClick={() => update({ days: [0, 6] })}
                    className="px-2 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300"
                  >
                    Fim de Semana
                  </button>
                  <button
                    type="button"
                    onClick={() => update({ days: [0, 1, 2, 3, 4, 5, 6] })}
                    className="px-2 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300"
                  >
                    Todos
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      update({
                        mode: 'allow_window',
                        days: [0, 1, 2, 3, 4, 5, 6],
                        startTime: '22:00',
                        endTime: '06:00',
                      })
                    }
                    className="px-2 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700 text-cyan-300"
                  >
                    Noturno 22h–06h
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {DAYS_OF_WEEK.map((d) => {
                const active = current.days.includes(d.value);
                return (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => toggleDay(d.value)}
                    title={d.label}
                    className={`py-1.5 rounded-lg border text-[11px] font-medium transition-colors ${
                      active
                        ? 'bg-blue-600 border-blue-500 text-white'
                        : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    {d.short}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Time Window Inputs */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="flex items-center gap-1 text-[11px] text-neutral-400 mb-1">
                <Clock className="w-3 h-3" />
                <span>Horário de Início</span>
              </label>
              <input
                type="time"
                value={current.startTime}
                onChange={(e) => update({ startTime: e.target.value || '00:00' })}
                className="w-full px-2.5 py-1.5 bg-neutral-950 border border-neutral-800 rounded-lg text-neutral-100 font-mono tabular-nums text-xs focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="flex items-center gap-1 text-[11px] text-neutral-400 mb-1">
                <Clock className="w-3 h-3" />
                <span>Horário de Término</span>
              </label>
              <input
                type="time"
                value={current.endTime}
                onChange={(e) => update({ endTime: e.target.value || '23:59' })}
                className="w-full px-2.5 py-1.5 bg-neutral-950 border border-neutral-800 rounded-lg text-neutral-100 font-mono tabular-nums text-xs focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <p className="text-[10px] text-neutral-500">
            Dica: Se o horário de término for menor que o de início (ex: 22:00 até 06:00), o sistema aplica o turno noturno automaticamente entre os dias. Estado atual:{' '}
            <strong className={evaluation.isScheduledPause ? 'text-amber-300' : 'text-emerald-300'}>
              {evaluation.reason}
            </strong>
          </p>
        </div>
      )}
    </div>
  );
};
