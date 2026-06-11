/**
 * The demo assistant's brain: a small, deterministic conversation engine for
 * the public interface demo at getinhouse.org/demo. It is intentionally not
 * an LLM — the demo's promise is "this is the real interface, simulated
 * assistant, nothing you type leaves this page", and a pattern engine keeps
 * that promise at zero bytes of upstream traffic.
 *
 * Every scripted line lives in voice-lines.json so the same catalog drives
 * both the text bubbles and the pre-baked Piper audio the demo speaks with
 * (scripts/gen_demo_voice.py renders one MP3 per line — the product's real
 * voice, not the browser's). Replies that embed the visitor's name are
 * composed at runtime and fall back to browser speech.
 *
 * Pure and injectable like the VAD: variant rotation is a counter, not
 * Math.random, so tests are exact.
 */

import LINES from './voice-lines.json';

export type VoiceLineId = keyof typeof LINES;

export interface DemoReply {
  text: string;
  /** Catalog id when this reply has pre-baked Piper audio; null = dynamic. */
  voiceId: VoiceLineId | null;
}

interface Rule {
  match: RegExp;
  lines: VoiceLineId[];
}

const RULES: Rule[] = [
  { match: /\b(hello|hey|hi|good (morning|afternoon|evening)|howdy)\b/, lines: ['greet-0', 'greet-1'] },
  { match: /\bhow are you\b/, lines: ['howareyou-0'] },
  { match: /\b(what (are|is) (you|this)|who are you|what am i looking at)\b/, lines: ['whatareyou-0', 'whatareyou-1'] },
  { match: /\b(how (do|does) (you|it|the real one) work|pipeline|architecture)\b/, lines: ['pipeline-0'] },
  { match: /\b(private|privacy|local|cloud|listening|spy|data)\b/, lines: ['privacy-0'] },
  { match: /\b(what do i need|requirements|hardware|raspberry|pi\b|laptop|server do i)\b/, lines: ['hardware-0'] },
  { match: /\b(pro|price|pricing|cost|pay|buy|\$59|playbook)\b/, lines: ['pro-0'] },
  { match: /\b(wake word|hey jarvis|phone|call|text you|sms|twilio|multi.?user|family|household)\b/, lines: ['addons-0'] },
  { match: /\b(weather|time is it|news|timer|remind|turn (on|off)|lights)\b/, lines: ['tasks-0'] },
  { match: /\b(joke|funny|laugh)\b/, lines: ['joke-0', 'joke-1'] },
  { match: /\b(which|what) (llm|model)\b/, lines: ['model-0'] },
  { match: /\b(thank(s| you)|cool|nice|awesome|love (it|this)|impressive)\b/, lines: ['thanks-0'] },
  { match: /\b(bye|goodbye|see you|later)\b/, lines: ['bye-0'] },
];

const FALLBACKS: VoiceLineId[] = ['fallback-0', 'fallback-1', 'fallback-2'];

const NAME_PATTERN = /\b(?:my name is|i'?m called|call me)\s+([a-z][a-z-]{1,20})/i;

export class DemoBrain {
  private counts = new Map<string, number>();
  private name: string | null = null;

  reply(input: string): DemoReply {
    const text = input.toLowerCase().trim();

    const named = NAME_PATTERN.exec(input);
    if (named?.[1]) {
      this.name = named[1][0]?.toUpperCase() + named[1].slice(1);
      return {
        text: `Nice to meet you, ${this.name}. I'll remember that for exactly as long as this tab is open — the demo has no storage, which is the most private memory policy there is. The real Inhouse keeps history on your disk, where it belongs.`,
        voiceId: null,
      };
    }
    if (/\b(what('s| is) my name|remember me|who am i)\b/.test(text)) {
      if (this.name) {
        return {
          text: `You're ${this.name}. Told you I'd remember — within the lifespan of a browser tab, anyway.`,
          voiceId: null,
        };
      }
      return { text: LINES['noname-0'], voiceId: 'noname-0' };
    }

    for (const rule of RULES) {
      if (rule.match.test(text)) {
        return this.pick(rule.match.source, rule.lines);
      }
    }
    return this.pick('fallback', FALLBACKS);
  }

  /** Rotate variants per rule so repeated questions don't repeat verbatim. */
  private pick(key: string, ids: VoiceLineId[]): DemoReply {
    const n = this.counts.get(key) ?? 0;
    this.counts.set(key, n + 1);
    const id = ids[n % ids.length] ?? ids[0];
    if (!id) return { text: '', voiceId: null };
    return { text: LINES[id], voiceId: id };
  }
}
