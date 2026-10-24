/**
 * Audio alert chime generator using Web Audio API (Zero external assets required)
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

export function playMotionAlarm(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    // Two-tone warning beep
    osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
    osc.frequency.setValueAtTime(1174.66, ctx.currentTime + 0.1); // D6
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.2);

    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch {
    // Audio context may be blocked before first user gesture
  }
}

export function playRecordBeep(isStarting: boolean): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    if (isStarting) {
      // Ascending tone
      osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc.frequency.exponentialRampToValueAtTime(1046.5, ctx.currentTime + 0.15); // C6
    } else {
      // Descending tone
      osc.frequency.setValueAtTime(1046.5, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(523.25, ctx.currentTime + 0.15);
    }

    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.2);
  } catch {
    // Silent fail
  }
}

/**
 * High-urgency oscillating security siren for AI High Threat events.
 * Returns an object with a stop() callback to silence the alarm immediately.
 */
export function playAIThreatAlarm(): { stop: () => void } {
  try {
    const ctx = getAudioContext();
    if (!ctx) return { stop: () => {} };

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    const now = ctx.currentTime;

    // Multi-pulse oscillating siren frequency (650Hz to 1250Hz)
    osc.frequency.setValueAtTime(650, now);
    osc.frequency.linearRampToValueAtTime(1250, now + 0.25);
    osc.frequency.linearRampToValueAtTime(650, now + 0.5);
    osc.frequency.linearRampToValueAtTime(1250, now + 0.75);
    osc.frequency.linearRampToValueAtTime(650, now + 1.0);
    osc.frequency.linearRampToValueAtTime(1250, now + 1.25);
    osc.frequency.linearRampToValueAtTime(650, now + 1.5);

    gain.gain.setValueAtTime(0.14, now);
    gain.gain.setValueAtTime(0.14, now + 1.35);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.6);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 1.6);

    return {
      stop: () => {
        try {
          gain.gain.setValueAtTime(0.001, ctx.currentTime);
          osc.stop(ctx.currentTime + 0.05);
        } catch {
          // Ignore
        }
      },
    };
  } catch {
    return { stop: () => {} };
  }
}

