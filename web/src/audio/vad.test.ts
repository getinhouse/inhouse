import { describe, expect, it } from 'vitest';
import { Vad } from './vad';
import type { VadEvent, VadOptions } from './vad';

const QUIET = 0.001;
const LOUD = 0.1;

function makeClock() {
  let t = 0;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

function makeVad(overrides: Partial<VadOptions> = {}) {
  const clock = makeClock();
  const vad = new Vad({
    threshold: 0.05,
    minSpeechMs: 200,
    hangoverMs: 500,
    armDelayMs: 300,
    now: clock.now,
    ...overrides,
  });
  return { vad, clock };
}

/** Push samples every stepMs for totalMs; returns all emitted events. */
function feed(
  vad: Vad,
  clock: ReturnType<typeof makeClock>,
  rms: number,
  totalMs: number,
  stepMs = 50
): VadEvent[] {
  const events: VadEvent[] = [];
  for (let elapsed = 0; elapsed < totalMs; elapsed += stepMs) {
    clock.advance(stepMs);
    const ev = vad.push(rms);
    if (ev) events.push(ev);
  }
  return events;
}

describe('Vad', () => {
  it('starts disarmed and ignores input until armed', () => {
    const { vad, clock } = makeVad();
    expect(vad.state).toBe('disarmed');
    expect(feed(vad, clock, LOUD, 1000)).toEqual([]);
    expect(vad.state).toBe('disarmed');
  });

  it('ignores loud samples during the arm delay', () => {
    const { vad, clock } = makeVad({ armDelayMs: 300 });
    vad.arm();
    // 250ms of loud input inside the arm delay window: no transitions.
    expect(feed(vad, clock, LOUD, 250)).toEqual([]);
    expect(vad.state).toBe('idle');
    // Once past the delay, loud input is picked up again.
    const events = feed(vad, clock, LOUD, 400);
    expect(events.map((e) => e.type)).toEqual(['speech-start']);
  });

  it('requires minSpeechMs of sustained sound before speech-start', () => {
    const { vad, clock } = makeVad({ armDelayMs: 0, minSpeechMs: 200 });
    vad.arm();
    clock.advance(1);
    // 150ms of loud input: candidate only, no start yet.
    expect(feed(vad, clock, LOUD, 150)).toEqual([]);
    expect(vad.state).toBe('maybe-speech');
    // Crossing 200ms fires speech-start.
    const events = feed(vad, clock, LOUD, 100);
    expect(events).toEqual([{ type: 'speech-start', time: expect.any(Number) }]);
    expect(vad.state).toBe('speech');
  });

  it('cancels a blip shorter than minSpeechMs', () => {
    const { vad, clock } = makeVad({ armDelayMs: 0 });
    vad.arm();
    clock.advance(1);
    feed(vad, clock, LOUD, 100); // shorter than minSpeechMs
    const events = feed(vad, clock, QUIET, 50);
    expect(events.map((e) => e.type)).toEqual(['speech-cancel']);
    expect(vad.state).toBe('idle');
  });

  it('fires speech-end only after hangoverMs of silence', () => {
    const { vad, clock } = makeVad({ armDelayMs: 0, hangoverMs: 500 });
    vad.arm();
    clock.advance(1);
    feed(vad, clock, LOUD, 400); // speech-start fires in here
    // 450ms of silence: still inside hangover.
    expect(feed(vad, clock, QUIET, 450)).toEqual([]);
    expect(vad.state).toBe('hangover');
    // Crossing 500ms of silence ends speech.
    const events = feed(vad, clock, QUIET, 100);
    expect(events.map((e) => e.type)).toEqual(['speech-end']);
  });

  it('treats a brief dip below threshold as part of the same utterance', () => {
    const { vad, clock } = makeVad({ armDelayMs: 0, hangoverMs: 500 });
    vad.arm();
    clock.advance(1);
    feed(vad, clock, LOUD, 400);
    feed(vad, clock, QUIET, 200); // dip shorter than hangover
    expect(feed(vad, clock, LOUD, 200)).toEqual([]); // resumes speech, no events
    expect(vad.state).toBe('speech');
    const events = feed(vad, clock, QUIET, 600);
    expect(events.map((e) => e.type)).toEqual(['speech-end']);
  });

  it('reports the speech duration (excluding hangover) on speech-end', () => {
    const { vad, clock } = makeVad({ armDelayMs: 0, minSpeechMs: 200, hangoverMs: 500 });
    vad.arm();
    clock.advance(1);
    feed(vad, clock, LOUD, 1000, 50);
    const events = feed(vad, clock, QUIET, 600, 50);
    const end = events.find((e) => e.type === 'speech-end');
    expect(end).toBeDefined();
    if (end?.type === 'speech-end') {
      // Spoke for ~1000ms (measured from the first loud sample).
      expect(end.durationMs).toBeGreaterThanOrEqual(900);
      expect(end.durationMs).toBeLessThanOrEqual(1100);
    }
  });

  it('disarms itself after speech-end until re-armed', () => {
    const { vad, clock } = makeVad({ armDelayMs: 0 });
    vad.arm();
    clock.advance(1);
    feed(vad, clock, LOUD, 400);
    feed(vad, clock, QUIET, 600);
    expect(vad.state).toBe('disarmed');
    // Loud input while disarmed does nothing.
    expect(feed(vad, clock, LOUD, 1000)).toEqual([]);
    // Re-arming restores detection.
    vad.arm();
    clock.advance(1);
    const events = feed(vad, clock, LOUD, 400);
    expect(events.map((e) => e.type)).toEqual(['speech-start']);
  });

  it('applies setThreshold to subsequent samples', () => {
    const { vad, clock } = makeVad({ armDelayMs: 0, threshold: 0.05 });
    vad.arm();
    clock.advance(1);
    expect(feed(vad, clock, 0.03, 300)).toEqual([]); // below threshold
    expect(vad.state).toBe('idle');
    vad.setThreshold(0.02);
    const events = feed(vad, clock, 0.03, 300);
    expect(events.map((e) => e.type)).toEqual(['speech-start']);
  });
});

describe('Vad strict mode (barge-in)', () => {
  it('ignores energy below the strict threshold that would trigger normal mode', () => {
    const { vad, clock } = makeVad({ armDelayMs: 0, threshold: 0.05, strictThresholdFactor: 2.5 });
    vad.setMode('strict');
    vad.arm();
    clock.advance(1);
    // 0.1 clears the normal threshold (0.05) but not the strict one (0.125).
    expect(feed(vad, clock, 0.1, 1000)).toEqual([]);
    expect(vad.state).toBe('idle');
    // Clearly-above-strict energy still triggers.
    const events = feed(vad, clock, 0.2, 600);
    expect(events.map((e) => e.type)).toEqual(['speech-start']);
  });

  it('defaults the strict multiplier to 2.5 when not configured', () => {
    const { vad, clock } = makeVad({ armDelayMs: 0, threshold: 0.05 });
    vad.setMode('strict');
    vad.arm();
    clock.advance(1);
    expect(feed(vad, clock, 0.12, 600)).toEqual([]); // just under 0.05 × 2.5
    expect(vad.state).toBe('idle');
    const events = feed(vad, clock, 0.13, 600);
    expect(events.map((e) => e.type)).toEqual(['speech-start']);
  });

  it('requires the longer strict confirmation window before speech-start', () => {
    const { vad, clock } = makeVad({ armDelayMs: 0, minSpeechMs: 200, strictMinSpeechMs: 400 });
    vad.setMode('strict');
    vad.arm();
    clock.advance(1);
    // 300ms of loud input: enough for normal mode, not yet for strict.
    expect(feed(vad, clock, 0.2, 300)).toEqual([]);
    expect(vad.state).toBe('maybe-speech');
    // Crossing 400ms fires speech-start.
    const events = feed(vad, clock, 0.2, 150);
    expect(events.map((e) => e.type)).toEqual(['speech-start']);
  });

  it('cancels an in-flight candidate that no longer qualifies after switching to strict', () => {
    const { vad, clock } = makeVad({ armDelayMs: 0, threshold: 0.05 });
    vad.arm();
    clock.advance(1);
    feed(vad, clock, 0.1, 100); // normal-mode candidate
    expect(vad.state).toBe('maybe-speech');
    vad.setMode('strict'); // 0.1 now reads as silence (< 0.125)
    const events = feed(vad, clock, 0.1, 50);
    expect(events.map((e) => e.type)).toEqual(['speech-cancel']);
    expect(vad.state).toBe('idle');
  });

  it('restores normal detection after switching back from strict mode', () => {
    const { vad, clock } = makeVad({ armDelayMs: 0, threshold: 0.05 });
    vad.setMode('strict');
    vad.arm();
    clock.advance(1);
    expect(feed(vad, clock, 0.1, 400)).toEqual([]); // ignored while strict
    vad.setMode('normal');
    const events = feed(vad, clock, 0.1, 400);
    expect(events.map((e) => e.type)).toEqual(['speech-start']);
  });

  it('continues a strict-confirmed utterance after a mid-speech switch to normal', () => {
    const { vad, clock } = makeVad({ armDelayMs: 0, threshold: 0.05, hangoverMs: 500 });
    vad.setMode('strict');
    vad.arm();
    clock.advance(1);
    feed(vad, clock, 0.2, 600); // speech-start fires in here
    expect(vad.state).toBe('speech');
    // Barge-in confirmed: the rest of the utterance is tracked with normal rules.
    vad.setMode('normal');
    expect(feed(vad, clock, 0.1, 300)).toEqual([]); // normal-loud keeps it alive
    expect(vad.state).toBe('speech');
    const events = feed(vad, clock, QUIET, 600);
    expect(events.map((e) => e.type)).toEqual(['speech-end']);
  });
});
