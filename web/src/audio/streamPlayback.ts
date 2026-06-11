/**
 * Streaming WAV playback: fetch with ReadableStream, parse the 44-byte PCM
 * header, and schedule decoded Float32 chunks gaplessly via Web Audio.
 * The server may still be synthesizing while we play (chunked transfer).
 */

export interface StreamPlaybackOptions {
  headers?: Record<string, string>;
  /** Reuse an existing AudioContext (recommended) instead of creating one. */
  audioContext?: AudioContext;
  /** Minimum samples to accumulate before scheduling a buffer (anti-crackle). */
  minChunkSamples?: number;
}

export interface PlaybackHandle {
  /** Resolves when playback finishes (or is stopped); rejects on fetch/parse errors. */
  done: Promise<void>;
  stop: () => void;
}

interface WavFormat {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
}

function getAudioContextCtor(): typeof AudioContext | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  return w.AudioContext ?? w.webkitAudioContext;
}

/**
 * Parse the canonical 44-byte WAV header:
 *   0  "RIFF"   8  "WAVE"   12 "fmt "   20 audioFormat (1 = PCM)
 *   22 channels 24 sampleRate           34 bitsPerSample   36 "data"
 */
function parseWavHeader(bytes: Uint8Array): WavFormat {
  const ascii = (off: number, len: number) => String.fromCharCode(...bytes.subarray(off, off + len));
  if (ascii(0, 4) !== 'RIFF' || ascii(8, 4) !== 'WAVE') {
    throw new Error('Reply audio is not a WAV stream.');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const format: WavFormat = {
    channels: view.getUint16(22, true),
    sampleRate: view.getUint32(24, true),
    bitsPerSample: view.getUint16(34, true),
  };
  if (view.getUint16(20, true) !== 1 || format.bitsPerSample !== 16) {
    throw new Error('Reply audio is not 16-bit PCM WAV.');
  }
  if (format.sampleRate < 8000 || format.sampleRate > 192000) {
    throw new Error('Reply audio has an invalid sample rate.');
  }
  return format;
}

/** Decode interleaved s16le bytes to mono Float32 (channels averaged). */
function s16leToMonoFloat32(bytes: Uint8Array, channels: number): Float32Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const totalSamples = bytes.byteLength >> 1;
  const frames = Math.floor(totalSamples / channels);
  const out = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) {
      sum += view.getInt16((f * channels + c) * 2, true);
    }
    out[f] = sum / channels / 32768;
  }
  return out;
}

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

/** Fallback for browsers without ReadableStream/AudioContext: plain <audio>. */
function playViaAudioElement(url: string): PlaybackHandle {
  const el = new Audio();
  let settle: () => void = () => undefined;
  const done = new Promise<void>((resolve) => {
    settle = resolve;
  });
  el.onended = () => settle();
  el.onerror = () => settle();
  el.src = url;
  void el.play().catch(() => settle());
  return {
    done,
    stop: () => {
      try {
        el.pause();
        el.removeAttribute('src');
        el.load();
      } catch {
        // ignore
      }
      settle();
    },
  };
}

export function playStreamingWav(url: string, opts: StreamPlaybackOptions = {}): PlaybackHandle {
  const Ctor = getAudioContextCtor();
  const canStream =
    typeof ReadableStream !== 'undefined' &&
    typeof fetch === 'function' &&
    (opts.audioContext !== undefined || Ctor !== undefined);
  if (!canStream) {
    return playViaAudioElement(url);
  }

  const ctx = opts.audioContext ?? new (Ctor as typeof AudioContext)();
  const ownsContext = opts.audioContext === undefined;
  const minChunkSamples = opts.minChunkSamples ?? 4096;

  const controller = new AbortController();
  const sources = new Set<AudioBufferSourceNode>();
  let stopped = false;
  let nextStartTime = 0; // AudioContext-time at which the next buffer starts

  let resolveDone!: () => void;
  let rejectDone!: (err: unknown) => void;
  const done = new Promise<void>((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });

  const cleanup = () => {
    for (const s of sources) {
      try {
        s.stop();
      } catch {
        // Not started yet or already ended.
      }
    }
    sources.clear();
    if (ownsContext) void ctx.close().catch(() => undefined);
  };

  const schedule = (samples: Float32Array, sampleRate: number) => {
    if (samples.length === 0 || stopped) return;
    const buffer = ctx.createBuffer(1, samples.length, sampleRate);
    buffer.copyToChannel(samples, 0);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    // Back-to-back scheduling; small initial lead so the first buffer is not late.
    const startAt = Math.max(nextStartTime, ctx.currentTime + 0.06);
    src.start(startAt);
    nextStartTime = startAt + buffer.duration;
    sources.add(src);
    src.onended = () => sources.delete(src);
  };

  const run = async () => {
    if (ctx.state === 'suspended') {
      await ctx.resume().catch(() => undefined);
    }
    const res = await fetch(url, { headers: opts.headers, signal: controller.signal });
    if (!res.ok) throw new Error(`Audio fetch failed (HTTP ${res.status}).`);
    if (!res.body) throw new Error('Audio response has no body stream.');

    const reader = res.body.getReader();
    let header = new Uint8Array(0);
    let format: WavFormat | null = null;
    let carry: Uint8Array | null = null; // odd byte left when a chunk splits an s16 sample
    let pending: Float32Array[] = [];
    let pendingSamples = 0;

    const flush = () => {
      if (pendingSamples === 0 || !format) return;
      const merged = new Float32Array(pendingSamples);
      let off = 0;
      for (const part of pending) {
        merged.set(part, off);
        off += part.length;
      }
      pending = [];
      pendingSamples = 0;
      schedule(merged, format.sampleRate);
    };

    for (;;) {
      const { done: streamDone, value } = await reader.read();
      if (stopped) return;
      if (streamDone) break;
      let bytes: Uint8Array = value;

      if (!format) {
        header = concatBytes(header, bytes);
        if (header.length < 44) continue;
        format = parseWavHeader(header);
        bytes = header.subarray(44);
        if (bytes.length === 0) continue;
      }

      if (carry) {
        bytes = concatBytes(carry, bytes);
        carry = null;
      }
      if (bytes.length % 2 === 1) {
        carry = bytes.slice(bytes.length - 1);
        bytes = bytes.subarray(0, bytes.length - 1);
      }
      if (bytes.length === 0) continue;

      const samples = s16leToMonoFloat32(bytes, format.channels);
      pending.push(samples);
      pendingSamples += samples.length;
      if (pendingSamples >= minChunkSamples) flush();
    }
    flush();

    // Resolve once the last scheduled buffer has finished playing.
    const remainingMs = Math.max(0, (nextStartTime - ctx.currentTime) * 1000);
    await new Promise<void>((resolve) => setTimeout(resolve, remainingMs + 60));
  };

  run()
    .then(() => {
      cleanup();
      resolveDone();
    })
    .catch((err: unknown) => {
      cleanup();
      if (stopped || (err instanceof DOMException && err.name === 'AbortError')) {
        resolveDone();
      } else {
        rejectDone(err);
      }
    });

  return {
    done,
    stop: () => {
      if (stopped) return;
      stopped = true;
      controller.abort();
      cleanup();
      resolveDone();
    },
  };
}
