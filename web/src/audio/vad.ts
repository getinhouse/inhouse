/**
 * Pure voice-activity-detection state machine. No browser API dependencies:
 * time is injected via `now()` and amplitude samples are fed via `push()`.
 *
 * States:
 *   disarmed     — ignoring all input (initial state, and after speech-end)
 *   idle         — armed and waiting for speech (arm-delay is enforced here)
 *   maybe-speech — amplitude above threshold, but not yet for minSpeechMs
 *   speech       — confirmed speech in progress
 *   hangover     — amplitude dropped; waiting hangoverMs of silence before ending
 *
 * Modes:
 *   normal — the thresholds above apply as configured.
 *   strict — for listening while the assistant's own reply is playing
 *            (barge-in): the threshold is multiplied and a longer
 *            confirmation window is required, so speaker bleed and room
 *            noise can't cut the reply off.
 */

export type VadState = 'disarmed' | 'idle' | 'maybe-speech' | 'speech' | 'hangover';

export type VadMode = 'normal' | 'strict';

export type VadEvent =
  | { type: 'speech-start'; time: number }
  | { type: 'speech-end'; time: number; durationMs: number }
  /** A blip shorter than minSpeechMs; lets callers discard a tentative recording. */
  | { type: 'speech-cancel'; time: number };

export interface VadOptions {
  /** RMS amplitude threshold (0..1) above which a sample counts as speech. */
  threshold: number;
  /** Sustained above-threshold time required before speech-start fires. */
  minSpeechMs: number;
  /** Below-threshold time required after speech before speech-end fires. */
  hangoverMs: number;
  /** Input is ignored for this long after arm() — e.g. after assistant playback
   *  ends, so the tail of its own audio is not captured as user speech. */
  armDelayMs: number;
  /** Injected clock (milliseconds, monotonic). */
  now: () => number;
  /** Threshold multiplier applied in strict mode (default 2.5). */
  strictThresholdFactor?: number;
  /** Sustained above-threshold time required in strict mode before
   *  speech-start fires (default 1.5 × minSpeechMs). */
  strictMinSpeechMs?: number;
}

const DEFAULT_STRICT_THRESHOLD_FACTOR = 2.5;
const DEFAULT_STRICT_MIN_SPEECH_FACTOR = 1.5;

export class Vad {
  private readonly opts: VadOptions;
  private _state: VadState = 'disarmed';
  private _mode: VadMode = 'normal';
  private armedAt = 0;
  private candidateStart = 0; // first above-threshold sample of the current candidate
  private speechStart = 0;
  private silenceStart = 0;

  constructor(options: VadOptions) {
    this.opts = { ...options };
  }

  get state(): VadState {
    return this._state;
  }

  get mode(): VadMode {
    return this._mode;
  }

  /** Start (or restart) listening. Input is ignored for armDelayMs. */
  arm(): void {
    this.armedAt = this.opts.now();
    this._state = 'idle';
  }

  disarm(): void {
    this._state = 'disarmed';
  }

  setThreshold(threshold: number): void {
    this.opts.threshold = threshold;
  }

  /**
   * Switch detection rules. Takes effect on subsequent push() calls: an
   * in-flight candidate keeps its start time but must satisfy the new mode's
   * threshold and confirmation window (so e.g. a candidate that only clears
   * the normal threshold is cancelled after switching to strict).
   */
  setMode(mode: VadMode): void {
    this._mode = mode;
  }

  /** Threshold currently in effect (raised by the multiplier in strict mode). */
  private effectiveThreshold(): number {
    const factor =
      this._mode === 'strict' ? (this.opts.strictThresholdFactor ?? DEFAULT_STRICT_THRESHOLD_FACTOR) : 1;
    return this.opts.threshold * factor;
  }

  /** Confirmation window currently in effect (longer in strict mode). */
  private effectiveMinSpeechMs(): number {
    if (this._mode === 'strict') {
      return this.opts.strictMinSpeechMs ?? this.opts.minSpeechMs * DEFAULT_STRICT_MIN_SPEECH_FACTOR;
    }
    return this.opts.minSpeechMs;
  }

  /** Feed one RMS amplitude sample; returns an event when a transition fires. */
  push(rms: number): VadEvent | null {
    if (this._state === 'disarmed') return null;

    const t = this.opts.now();
    if (this._state === 'idle' && t - this.armedAt < this.opts.armDelayMs) {
      return null;
    }
    const loud = rms >= this.effectiveThreshold();

    switch (this._state) {
      case 'idle':
        if (loud) {
          this.candidateStart = t;
          if (this.effectiveMinSpeechMs() <= 0) {
            this._state = 'speech';
            this.speechStart = t;
            return { type: 'speech-start', time: t };
          }
          this._state = 'maybe-speech';
        }
        return null;

      case 'maybe-speech':
        if (!loud) {
          this._state = 'idle';
          return { type: 'speech-cancel', time: t };
        }
        if (t - this.candidateStart >= this.effectiveMinSpeechMs()) {
          this._state = 'speech';
          this.speechStart = this.candidateStart;
          return { type: 'speech-start', time: t };
        }
        return null;

      case 'speech':
        if (!loud) {
          this._state = 'hangover';
          this.silenceStart = t;
        }
        return null;

      case 'hangover':
        if (loud) {
          // Brief dip — still the same utterance.
          this._state = 'speech';
          return null;
        }
        if (t - this.silenceStart >= this.opts.hangoverMs) {
          // Disarm until the caller re-arms (after the turn round-trip).
          this._state = 'disarmed';
          return {
            type: 'speech-end',
            time: t,
            durationMs: this.silenceStart - this.speechStart,
          };
        }
        return null;
    }
  }
}
