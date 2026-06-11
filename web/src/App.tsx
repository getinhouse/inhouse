import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiClient } from './api';
import type { AssistantApi, TurnResponse } from './api';
import { Recorder } from './audio/recorder';
import { playStreamingWav } from './audio/streamPlayback';
import type { PlaybackHandle } from './audio/streamPlayback';
import { Vad } from './audio/vad';
import { Composer } from './components/Composer';
import { ConversationView } from './components/ConversationView';
import { ErrorBanner } from './components/ErrorBanner';
import { MicButton } from './components/MicButton';
import { SettingsPanel } from './components/SettingsPanel';
import { StatusStrip } from './components/StatusStrip';
import { loadSettings, saveSettings } from './settings';
import type { Settings } from './settings';
import type { AppStatus, ConversationTurn } from './types';

const VAD_MIN_SPEECH_MS = 200;
const VAD_HANGOVER_MS = 700;
const VAD_ARM_DELAY_MS = 400;
// Barge-in (listening over our own playback): raise the threshold and require
// a longer confirmation so echo-cancelled speaker bleed can't self-interrupt.
const VAD_STRICT_FACTOR = 2.5;
const VAD_STRICT_MIN_SPEECH_MS = 350;
const VAD_POLL_MS = 50;
const HEALTH_POLL_MS = 30_000;
const ERROR_AUTO_DISMISS_MS = 8_000;

function getAudioContextCtor(): typeof AudioContext | undefined {
  const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  return w.AudioContext ?? w.webkitAudioContext;
}

export interface AppProps {
  /** Replace the server client (the public interface demo injects a
   *  simulated assistant). Default: ApiClient from the saved settings. */
  client?: AssistantApi;
  /** Demo presentation: banner, no mic/hands-free/settings (they need a
   *  real server), demo-appropriate hints. */
  demo?: boolean;
}

export default function App({ client, demo = false }: AppProps = {}) {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [turns, setTurns] = useState<ConversationTurn[]>([]);
  const [status, setStatus] = useState<AppStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [healthy, setHealthy] = useState<boolean | null>(null);
  const [handsFree, setHandsFree] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [recordingSince, setRecordingSince] = useState<number | null>(null);

  const api = useMemo<AssistantApi>(
    () => client ?? new ApiClient({ baseUrl: settings.baseUrl, token: settings.token }),
    [client, settings.baseUrl, settings.token]
  );
  const apiRef = useRef(api);
  apiRef.current = api;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const handsFreeRef = useRef(handsFree);
  handsFreeRef.current = handsFree;

  const sessionRef = useRef<string | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pttRecorderRef = useRef<Recorder | null>(null);
  const pttActiveRef = useRef(false);
  const vadRef = useRef<Vad | null>(null);
  const playbackRef = useRef<PlaybackHandle | null>(null);
  const busyRef = useRef(false);
  // True while the VAD listens over the assistant's playback in strict mode.
  const bargeInListeningRef = useRef(false);
  // Set when a confirmed barge-in stopped playback mid-turn, so runTurn's
  // cleanup leaves the in-flight utterance (and 'recording' status) alone.
  const interruptedRef = useRef(false);
  const errorTimerRef = useRef<number | null>(null);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  // Server changed: start a fresh session.
  useEffect(() => {
    sessionRef.current = null;
  }, [api]);

  const showError = useCallback((err: unknown) => {
    const message = err instanceof Error ? err.message : 'Something went wrong.';
    setError(message);
    if (errorTimerRef.current !== null) window.clearTimeout(errorTimerRef.current);
    errorTimerRef.current = window.setTimeout(() => setError(null), ERROR_AUTO_DISMISS_MS);
  }, []);

  // Health polling.
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const h = await apiRef.current.health();
        if (!cancelled) setHealthy(h.status === 'ok');
      } catch {
        if (!cancelled) setHealthy(false);
      }
    };
    void check();
    const id = window.setInterval(() => void check(), HEALTH_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [api]);

  const getAudioContext = useCallback((): AudioContext | null => {
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') return audioCtxRef.current;
    const Ctor = getAudioContextCtor();
    if (!Ctor) return null;
    audioCtxRef.current = new Ctor();
    return audioCtxRef.current;
  }, []);

  const ensureStream = useCallback(async (): Promise<MediaStream> => {
    if (streamRef.current && streamRef.current.getAudioTracks().some((t) => t.readyState === 'live')) {
      return streamRef.current;
    }
    // Echo cancellation + noise suppression keep the assistant's own playback
    // out of the mic signal — essential for barge-in over open speakers.
    streamRef.current = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    return streamRef.current;
  }, []);

  const ensureSession = useCallback(async (): Promise<string> => {
    if (sessionRef.current) return sessionRef.current;
    const session = await apiRef.current.createSession();
    sessionRef.current = session.session_id;
    return session.session_id;
  }, []);

  const restingStatus = useCallback((): AppStatus => (handsFreeRef.current ? 'listening' : 'idle'), []);

  /**
   * Full turn pipeline: thinking → server → transcript → (optionally) play the
   * reply stream. Always lands back in a resting state, even on error.
   */
  const runTurn = useCallback(
    async (send: (sessionId: string) => Promise<TurnResponse>) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setStatus('thinking');
      try {
        const sessionId = await ensureSession();
        const res = await send(sessionId);
        setTurns((prev) => [
          ...prev,
          {
            id: res.turn_id,
            transcript: res.transcript,
            replyText: res.reply_text,
            totalMs: res.timings.total_ms,
          },
        ]);
        if (settingsRef.current.playAloud && res.audio_url) {
          setStatus('speaking');
          // A client that speaks for itself (the demo) replaces the WAV stream.
          const speak = apiRef.current.speak?.bind(apiRef.current);
          const handle = speak
            ? speak(res.reply_text)
            : playStreamingWav(apiRef.current.resolveUrl(res.audio_url), {
                headers: apiRef.current.authHeaders(),
                audioContext: getAudioContext() ?? undefined,
              });
          playbackRef.current = handle;
          // Barge-in: keep listening during our own playback, in strict mode
          // so the speaker output can't trigger the VAD itself.
          if (settingsRef.current.bargeIn && handsFreeRef.current && vadRef.current) {
            vadRef.current.setMode('strict');
            vadRef.current.arm();
            bargeInListeningRef.current = true;
          }
          await handle.done;
        }
      } catch (err) {
        showError(err);
      } finally {
        playbackRef.current = null;
        busyRef.current = false;
        bargeInListeningRef.current = false;
        if (interruptedRef.current) {
          // A confirmed barge-in cut playback short; the VAD is mid-utterance
          // and status is already 'recording' — don't reset either.
          interruptedRef.current = false;
        } else {
          setStatus(restingStatus());
          // Re-arm hands-free listening; arm-delay keeps the assistant's own
          // audio tail from being detected as user speech.
          vadRef.current?.setMode('normal');
          vadRef.current?.arm();
        }
      }
    },
    [ensureSession, getAudioContext, restingStatus, showError]
  );

  // --- Push-to-talk -------------------------------------------------------

  const startPtt = useCallback(async () => {
    if (busyRef.current || handsFreeRef.current || pttActiveRef.current) return;
    pttActiveRef.current = true;
    try {
      const stream = await ensureStream();
      if (!pttActiveRef.current) return; // released before mic was ready
      const recorder = new Recorder(stream);
      recorder.start();
      pttRecorderRef.current = recorder;
      setStatus('recording');
      setRecordingSince(Date.now());
    } catch (err) {
      pttActiveRef.current = false;
      setStatus(restingStatus());
      showError(err instanceof Error ? err : new Error('Microphone unavailable.'));
    }
  }, [ensureStream, restingStatus, showError]);

  const endPtt = useCallback(async () => {
    if (!pttActiveRef.current) return;
    pttActiveRef.current = false;
    setRecordingSince(null);
    const recorder = pttRecorderRef.current;
    pttRecorderRef.current = null;
    if (!recorder) return;
    const blob = await recorder.stop();
    if (blob.size < 100) {
      // Accidental tap — nothing meaningful was recorded.
      setStatus(restingStatus());
      return;
    }
    await runTurn((sid) => apiRef.current.sendAudioTurn(sid, blob, recorder.filename));
  }, [restingStatus, runTurn]);

  // --- Hands-free (VAD) ---------------------------------------------------

  useEffect(() => {
    if (!handsFree) return;
    let disposed = false;
    let intervalId: number | null = null;
    let sourceNode: MediaStreamAudioSourceNode | null = null;
    let recorder: Recorder | null = null;

    const vad = new Vad({
      threshold: settingsRef.current.vadThreshold,
      minSpeechMs: VAD_MIN_SPEECH_MS,
      hangoverMs: VAD_HANGOVER_MS,
      armDelayMs: VAD_ARM_DELAY_MS,
      now: () => performance.now(),
      strictThresholdFactor: VAD_STRICT_FACTOR,
      strictMinSpeechMs: VAD_STRICT_MIN_SPEECH_MS,
    });
    vadRef.current = vad;

    const setup = async () => {
      try {
        const stream = await ensureStream();
        const ctx = getAudioContext();
        if (!ctx) throw new Error('Web Audio is not supported in this browser.');
        if (disposed) return;
        await ctx.resume().catch(() => undefined);

        sourceNode = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        sourceNode.connect(analyser);
        const sampleBuf = new Float32Array(analyser.fftSize);
        recorder = new Recorder(stream);

        vad.arm();
        setStatus('listening');

        intervalId = window.setInterval(() => {
          // Poll while a turn is in flight only for barge-in listening.
          if (busyRef.current && !bargeInListeningRef.current) return;
          analyser.getFloatTimeDomainData(sampleBuf);
          let sum = 0;
          for (let i = 0; i < sampleBuf.length; i++) {
            const v = sampleBuf[i] ?? 0;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / sampleBuf.length);
          const event = vad.push(rms);

          // Start capturing tentatively on the first above-threshold sample so
          // the utterance onset is not clipped while VAD confirms speech.
          if (vad.state === 'maybe-speech' && recorder && !recorder.active) {
            recorder.start();
          }
          // A re-arm during a tentative candidate (e.g. playback ended before
          // strict-mode speech was confirmed) emits no cancel event; drop the
          // stale capture once the VAD is back to waiting.
          if (!event && recorder?.active && (vad.state === 'idle' || vad.state === 'disarmed')) {
            recorder.cancel();
          }
          if (!event) return;

          if (event.type === 'speech-start') {
            // Confirmed speech over the assistant's reply: cut playback and
            // carry on as a normal utterance (the tentative recording already
            // holds the onset). Playback stop lets runTurn's cleanup finish;
            // the interrupted flag tells it to leave this utterance running.
            if (bargeInListeningRef.current && playbackRef.current) {
              interruptedRef.current = true;
              vad.setMode('normal');
              playbackRef.current.stop();
            }
            setStatus('recording');
            setRecordingSince(Date.now());
          } else if (event.type === 'speech-cancel') {
            recorder?.cancel();
          } else {
            // speech-end: VAD is now disarmed until runTurn re-arms it.
            setRecordingSince(null);
            const rec = recorder;
            if (!rec) return;
            void rec.stop().then((blob) => {
              if (disposed) return;
              if (blob.size < 100) {
                setStatus('listening');
                vad.arm();
                return;
              }
              void runTurn((sid) => apiRef.current.sendAudioTurn(sid, blob, rec.filename));
            });
          }
        }, VAD_POLL_MS);
      } catch (err) {
        if (!disposed) {
          showError(err instanceof Error ? err : new Error('Microphone unavailable.'));
          setHandsFree(false);
        }
      }
    };
    void setup();

    return () => {
      disposed = true;
      if (intervalId !== null) window.clearInterval(intervalId);
      sourceNode?.disconnect();
      recorder?.cancel();
      vad.disarm();
      if (vadRef.current === vad) vadRef.current = null;
      setRecordingSince(null);
      setStatus((s) => (s === 'thinking' || s === 'speaking' ? s : 'idle'));
    };
  }, [handsFree, ensureStream, getAudioContext, runTurn, showError]);

  // Apply VAD threshold changes live without restarting the mic pipeline.
  useEffect(() => {
    vadRef.current?.setThreshold(settings.vadThreshold);
  }, [settings.vadThreshold]);

  // --- UI handlers --------------------------------------------------------

  const sendText = useCallback(
    (text: string) => {
      void runTurn((sid) => apiRef.current.sendTextTurn(sid, text));
    },
    [runTurn]
  );

  const stopPlayback = useCallback(() => {
    playbackRef.current?.stop();
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <h1>
          Inhouse<span className="header-accent">.</span>
          {demo && <span className="demo-chip">interface demo</span>}
        </h1>
        {!demo && (
          <div className="header-controls">
            <label className="handsfree-toggle">
              <input type="checkbox" checked={handsFree} onChange={(e) => setHandsFree(e.target.checked)} />
              <span>Hands-free</span>
            </label>
            <button
              type="button"
              className="btn-subtle"
              aria-expanded={settingsOpen}
              onClick={() => setSettingsOpen((o) => !o)}
            >
              Settings
            </button>
          </div>
        )}
      </header>

      {demo && (
        <div className="demo-banner">
          This is the real Inhouse app with a <strong>simulated</strong> assistant — everything runs
          in this page, nothing is sent anywhere. The product runs on your hardware with your models.{' '}
          <a href="https://github.com/getinhouse/inhouse">Get Inhouse →</a>
        </div>
      )}

      <SettingsPanel
        open={settingsOpen}
        settings={settings}
        onChange={setSettings}
        onClose={() => setSettingsOpen(false)}
      />
      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      <ConversationView
        turns={turns}
        status={status}
        emptyHint={demo ? 'Type something — ask it what it is. It talks back, out loud.' : undefined}
      />

      <footer className="app-footer">
        <StatusStrip status={status} healthy={healthy} onStopPlayback={stopPlayback} />
        <Composer disabled={status === 'thinking'} onSend={sendText} />
        {demo && (
          <div className="demo-mic-hint">
            Voice <em>input</em> needs your own server (whisper runs on your hardware, not in this
            page) — so here, you type. Replies still speak.
          </div>
        )}
        {!demo && !handsFree && (
          <MicButton
            disabled={status === 'thinking' || status === 'speaking'}
            recording={status === 'recording'}
            recordingSince={recordingSince}
            onPressStart={() => void startPtt()}
            onPressEnd={() => void endPtt()}
          />
        )}
        {handsFree && (
          <div className="handsfree-indicator">
            {status === 'recording' ? 'Speech detected — keep talking' : 'Hands-free on — just start talking'}
          </div>
        )}
      </footer>
    </div>
  );
}
