/**
 * Demo client: implements the same surface as ApiClient (AssistantApi) with
 * a simulated assistant that lives entirely in the page. Replies come from
 * DemoBrain after a short think-delay.
 *
 * Speech is the product's real voice: every scripted line has an MP3 under
 * voice/ pre-synthesized with the same Piper model the server ships with
 * (scripts/gen_demo_voice.py). The browser's own speechSynthesis is only a
 * fallback — for the two name-personalized replies and for any playback
 * failure. Nothing the visitor types is ever sent anywhere; the only
 * network traffic is this page fetching its own static files.
 */

import type { AssistantApi, HealthResponse, SessionResponse, TurnResponse } from '../api';
import type { PlaybackHandle } from '../audio/streamPlayback';
import { DemoBrain } from './brain';
import type { VoiceLineId } from './brain';

/** Injectable for tests; defaults tuned to feel like a fast local model. */
export interface DemoClientOptions {
  thinkMsPerChar?: number;
  thinkMsFloor?: number;
  sleep?: (ms: number) => Promise<void>;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class DemoClient implements AssistantApi {
  private brain = new DemoBrain();
  private turnCount = 0;
  private lastVoiceId: VoiceLineId | null = null;
  private readonly thinkMsPerChar: number;
  private readonly thinkMsFloor: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: DemoClientOptions = {}) {
    this.thinkMsPerChar = options.thinkMsPerChar ?? 1.2;
    this.thinkMsFloor = options.thinkMsFloor ?? 350;
    this.sleep = options.sleep ?? realSleep;
  }

  resolveUrl(path: string): string {
    return path;
  }

  authHeaders(): Record<string, string> {
    return {};
  }

  async health(): Promise<HealthResponse> {
    return { status: 'ok', demo: true };
  }

  async createSession(): Promise<SessionResponse> {
    return { session_id: 'demo-session', state: 'idle' };
  }

  async sendTextTurn(_sessionId: string, text: string): Promise<TurnResponse> {
    const reply = this.brain.reply(text);
    const thinkMs = Math.round(this.thinkMsFloor + reply.text.length * this.thinkMsPerChar);
    await this.sleep(thinkMs);
    this.turnCount += 1;
    this.lastVoiceId = reply.voiceId;
    return {
      turn_id: `demo-turn-${this.turnCount}`,
      transcript: text,
      reply_text: reply.text,
      // Non-empty so the app takes its normal speaking path; resolved by
      // speak() below instead of a WAV stream from a server.
      audio_url: reply.voiceId ? `voice/${reply.voiceId}.mp3` : 'demo:speech',
      timings: { stt_ms: 0, llm_ms: thinkMs, total_ms: thinkMs },
    };
  }

  async sendAudioTurn(): Promise<TurnResponse> {
    // The demo UI hides the mic; this is a safety net, not a flow.
    this.turnCount += 1;
    this.lastVoiceId = null;
    return {
      turn_id: `demo-turn-${this.turnCount}`,
      transcript: '(voice input)',
      reply_text:
        'Voice input needs the real server — whisper runs on your hardware, not in this static page. In the demo, type to me; I still talk back.',
      audio_url: 'demo:speech',
      timings: { stt_ms: 0, llm_ms: 0, total_ms: 0 },
    };
  }

  /**
   * Speak the reply. Pre-baked Piper audio when the line is scripted;
   * browser speechSynthesis otherwise (and as a playback-failure fallback).
   */
  speak(text: string): PlaybackHandle {
    const voiceId = this.lastVoiceId;
    this.lastVoiceId = null;
    if (!voiceId) return speakWithBrowser(text);

    const audio = new Audio(`${import.meta.env.BASE_URL}voice/${voiceId}.mp3`);
    let fallback: PlaybackHandle | null = null;
    const done = new Promise<void>((resolve) => {
      audio.onended = () => resolve();
      audio.onerror = () => {
        fallback = speakWithBrowser(text);
        void fallback.done.then(resolve);
      };
      audio.play().catch(() => {
        // Autoplay denied or unsupported: degrade silently to browser TTS
        // (which is exempt where it matters, and harmless if it also fails).
        fallback = speakWithBrowser(text);
        void fallback.done.then(resolve);
      });
    });
    return {
      done,
      stop: () => {
        audio.pause();
        audio.onended?.(new Event('ended'));
        fallback?.stop();
      },
    };
  }
}

function speakWithBrowser(text: string): PlaybackHandle {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
  if (!synth || typeof SpeechSynthesisUtterance === 'undefined') {
    return { done: Promise.resolve(), stop: () => undefined };
  }
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = pickVoice(synth);
  if (voice) utterance.voice = voice;
  utterance.rate = 1.04;
  const done = new Promise<void>((resolve) => {
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
  });
  synth.cancel(); // never overlap an earlier reply
  synth.speak(utterance);
  return { done, stop: () => synth.cancel() };
}

function pickVoice(synth: SpeechSynthesis): SpeechSynthesisVoice | null {
  const voices = synth.getVoices();
  // Prefer a local English voice — closest in spirit to Piper.
  return (
    voices.find((v) => v.lang.startsWith('en') && v.localService) ??
    voices.find((v) => v.lang.startsWith('en')) ??
    voices[0] ??
    null
  );
}
