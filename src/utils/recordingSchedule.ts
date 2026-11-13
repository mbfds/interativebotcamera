import { DayOfWeek, RecordingSchedule } from '../types/camera';

export const DAYS_OF_WEEK: { value: DayOfWeek; short: string; label: string }[] = [
  { value: 0, short: 'Dom', label: 'Domingo' },
  { value: 1, short: 'Seg', label: 'Segunda' },
  { value: 2, short: 'Ter', label: 'Terça' },
  { value: 3, short: 'Qua', label: 'Quarta' },
  { value: 4, short: 'Qui', label: 'Quinta' },
  { value: 5, short: 'Sex', label: 'Sexta' },
  { value: 6, short: 'Sáb', label: 'Sábado' },
];

export const DEFAULT_RECORDING_SCHEDULE: RecordingSchedule = {
  enabled: false,
  mode: 'allow_window',
  days: [1, 2, 3, 4, 5],
  startTime: '08:00',
  endTime: '18:00',
};

function parseTimeToMinutes(hhmm: string): number {
  const [hStr, mStr] = (hhmm || '00:00').split(':');
  const h = Math.max(0, Math.min(23, parseInt(hStr, 10) || 0));
  const m = Math.max(0, Math.min(59, parseInt(mStr, 10) || 0));
  return h * 60 + m;
}

export interface ScheduleEvaluation {
  isActive: boolean;
  isScheduledPause: boolean;
  reason: string;
}

export function evaluateRecordingSchedule(
  schedule?: RecordingSchedule,
  now: Date = new Date()
): ScheduleEvaluation {
  if (!schedule || !schedule.enabled) {
    return {
      isActive: true,
      isScheduledPause: false,
      reason: 'Gravação contínua (sem restrição de horário)',
    };
  }

  const days = schedule.days || [];
  if (days.length === 0) {
    const active = schedule.mode === 'pause_window';
    return {
      isActive: active,
      isScheduledPause: !active,
      reason: active
        ? 'Nenhum dia marcado para pausa · Gravação ativa'
        : 'Nenhum dia marcado para gravação · Pausada',
    };
  }

  const startMins = parseTimeToMinutes(schedule.startTime);
  const endMins = parseTimeToMinutes(schedule.endTime);
  const currentMins = now.getHours() * 60 + now.getMinutes();
  const today = now.getDay() as DayOfWeek;
  const yesterday = ((today + 6) % 7) as DayOfWeek;

  let insideWindow = false;

  if (startMins === endMins) {
    // 24-hour window on selected days
    insideWindow = days.includes(today);
  } else if (startMins < endMins) {
    // Same-day range (e.g. 08:00 -> 18:00)
    insideWindow = days.includes(today) && currentMins >= startMins && currentMins < endMins;
  } else {
    // Overnight range (e.g. 22:00 -> 06:00)
    insideWindow =
      (days.includes(today) && currentMins >= startMins) ||
      (days.includes(yesterday) && currentMins < endMins);
  }

  if (schedule.mode === 'allow_window') {
    return insideWindow
      ? {
          isActive: true,
          isScheduledPause: false,
          reason: `Ativa na janela ${schedule.startTime}–${schedule.endTime}`,
        }
      : {
          isActive: false,
          isScheduledPause: true,
          reason: `Pausada fora do horário (${schedule.startTime}–${schedule.endTime})`,
        };
  }

  // mode === 'pause_window'
  return insideWindow
    ? {
        isActive: false,
        isScheduledPause: true,
        reason: `Pausada automaticamente (${schedule.startTime}–${schedule.endTime})`,
      }
    : {
        isActive: true,
        isScheduledPause: false,
        reason: `Ativa (fora da pausa de ${schedule.startTime}–${schedule.endTime})`,
      };
}

export function formatScheduleSummary(schedule?: RecordingSchedule): string {
  if (!schedule || !schedule.enabled) return '24/7 Sem agendamento';
  const sorted = [...(schedule.days || [])].sort((a, b) => a - b);
  let dayText = 'Nenhum dia';
  if (sorted.length === 7) {
    dayText = 'Todos os dias';
  } else if (sorted.join(',') === '1,2,3,4,5') {
    dayText = 'Seg–Sex';
  } else if (sorted.join(',') === '0,6') {
    dayText = 'Sáb–Dom';
  } else if (sorted.length > 0) {
    dayText = sorted.map((d) => DAYS_OF_WEEK[d]?.short).join(', ');
  }

  const prefix = schedule.mode === 'allow_window' ? 'Ativa' : 'Pausada';
  return `${prefix} · ${dayText} · ${schedule.startTime}–${schedule.endTime}`;
}
