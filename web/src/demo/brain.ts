/**
 * The demo assistant's brain: a small, deterministic conversation engine for
 * the public interface demo at getinhouse.org/demo. It is intentionally not
 * an LLM — the demo's promise is "this is the real interface, simulated
 * assistant, nothing leaves this page", and a pattern engine keeps that
 * promise at zero bytes of network traffic.
 *
 * Pure and injectable like the VAD: variant rotation is a counter, not
 * Math.random, so tests are exact.
 */

interface Rule {
  match: RegExp;
  replies: string[];
}

const INSTALL = 'run `git clone https://github.com/getinhouse/inhouse` and you get the real me';

const RULES: Rule[] = [
  {
    match: /\b(hello|hey|hi|good (morning|afternoon|evening)|howdy)\b/,
    replies: [
      "Hey. I'm the demo Inhouse — same interface as the real thing, but my brain is a few hundred lines of pattern-matching running right here in your browser. Ask me what I am, or how the real one works.",
      'Hello! You found the demo. Everything you see — the bubbles, the timings, the voice — is the actual Inhouse app. The assistant behind it is simulated. The real one would be your LLM, on your hardware.',
    ],
  },
  {
    match: /\bhow are you\b/,
    replies: [
      "Running entirely inside one browser tab, so: lightweight. The real Inhouse would be answering from your own server right now — whisper for ears, your LLM for thoughts, Piper for this voice.",
    ],
  },
  {
    match: /\b(what (are|is) (you|this)|who are you|what am i looking at)\b/,
    replies: [
      "This is the Inhouse web app — the actual PWA you'd install on your phone — wired to a simulated assistant so you can feel the interface without setting anything up. The real Inhouse is self-hosted: your speech is transcribed by Whisper on your machine, answered by whatever LLM you point it at, and spoken back by Piper. Nothing in this demo leaves the page.",
      "I'm a stand-in. The interface around me is real — it's exactly what ships in the repo — but my replies are scripted so this page can stay a static file. The product version of me runs on your hardware and thinks with your model.",
    ],
  },
  {
    match: /\b(how (do|does) (you|it|the real one) work|pipeline|architecture)\b/,
    replies: [
      'The real pipeline: your voice → this app → a small FastAPI server you run → faster-whisper transcribes locally → your LLM streams a reply → Piper synthesizes it sentence-by-sentence, and playback starts before the model finishes writing. That last part is why it feels alive. In this demo I skip the middle and the voice is your browser speaking.',
    ],
  },
  {
    match: /\b(private|privacy|local|cloud|listening|spy|data)\b/,
    replies: [
      "That's the whole point. Real Inhouse: speech-to-text and text-to-speech run on hardware you own, conversation history lives on your disk, and the only network hop is to whichever LLM you choose — with Ollama, even that stays home. This demo honors it too: zero requests since the page loaded. Open the network tab.",
    ],
  },
  {
    match: /\b(what do i need|requirements|hardware|raspberry|pi\b|laptop|server do i)\b/,
    replies: [
      'A small box: an N100 mini-PC is the sweet spot, a Pi 5 works, an old laptop is fine. Whisper and Piper are CPU-only. The LLM is the hungry part — most people point it at Ollama on a beefier machine or any hosted endpoint. Then: ' + INSTALL + '.',
    ],
  },
  {
    match: /\b(pro|price|pricing|cost|pay|buy|\$59|playbook)\b/,
    replies: [
      "The core is MIT and complete — free forever, no crippleware. Inhouse Pro is $59 once: production deployment playbooks, a troubleshooting matrix, and three working add-ons — a wake-word satellite, a Twilio phone bridge, and a multi-user auth gateway. It funds the roadmap. The button's on the site if it ever earns your money.",
    ],
  },
  {
    match: /\b(wake word|hey jarvis|phone|call|text you|sms|twilio|multi.?user|family|household)\b/,
    replies: [
      'Those are the Pro add-ons: a wake-word satellite (say "hey Jarvis" from across the room — detection runs locally with openWakeWord), a Twilio bridge so you can call or text your assistant from any phone, and a multi-user gateway so the household shares one server but not one conversation history.',
    ],
  },
  {
    match: /\b(weather|time is it|news|timer|remind|turn (on|off)|lights)\b/,
    replies: [
      "Honest answer: I can't — I'm the demo, and pretending would be cheating. The real Inhouse passes your words to your LLM, so what it can *do* is whatever your model and tools can do. What I can promise is that it'll hear you, answer fast, and keep the conversation on your disk.",
    ],
  },
  {
    match: /\b(joke|funny|laugh)\b/,
    replies: [
      "A cloud assistant and a self-hosted assistant walk into a bar. Only one of them tells the bar what you said. ...I'll be here all week, locally.",
      "Why did the voice assistant move in-house? It was tired of the commute to us-east-1.",
    ],
  },
  {
    match: /\b(which|what) (llm|model)\b/,
    replies: [
      "In the demo: none — these replies are scripted in the page. The real one speaks OpenAI-compatible chat (Ollama, vLLM, LM Studio, Groq, OpenRouter…) and native Anthropic. Three small adapter interfaces; writing a new one is about fifty lines.",
    ],
  },
  {
    match: /\b(thank(s| you)|cool|nice|awesome|love (it|this)|impressive)\b/,
    replies: [
      "Thanks — and remember you're complimenting a static file. The version with an actual mind is one `git clone` away.",
    ],
  },
  {
    match: /\b(bye|goodbye|see you|later)\b/,
    replies: [
      'Bye. When you want the real conversation — the one with your model and your microphone — ' + INSTALL + '.',
    ],
  },
];

const FALLBACKS = [
  "That one's beyond my script — I'm the demo, not the product. The real Inhouse would hand your question to your LLM and start speaking the answer before it finished thinking. Try asking me what I am, how the pipeline works, what hardware you need, or what Pro adds.",
  "I only know a handful of moves; the real assistant inherits its brain from whatever model you run. Ask me about privacy, hardware, the pipeline, or Pro — or just go get the real thing: " + INSTALL + ".",
  'You\'ve officially out-asked the demo script. Good sign — you need the real one. It clones in seconds and says hello with a built-in mock LLM before you configure anything.',
];

const NAME_PATTERN = /\b(?:my name is|i'?m called|call me)\s+([a-z][a-z-]{1,20})/i;

export class DemoBrain {
  private counts = new Map<string, number>();
  private name: string | null = null;

  reply(input: string): string {
    const text = input.toLowerCase().trim();

    const named = NAME_PATTERN.exec(input);
    if (named?.[1]) {
      this.name = named[1][0]?.toUpperCase() + named[1].slice(1);
      return `Nice to meet you, ${this.name}. I'll remember that for exactly as long as this tab is open — the demo has no storage, which is the most private memory policy there is. The real Inhouse keeps history on your disk, where it belongs.`;
    }
    if (/\b(what('s| is) my name|remember me|who am i)\b/.test(text)) {
      return this.name
        ? `You're ${this.name}. Told you I'd remember — within the lifespan of a browser tab, anyway.`
        : "You haven't told me. Tell me your name and I'll hold onto it until you close the tab — the demo keeps everything in this page and nothing anywhere else.";
    }

    for (const rule of RULES) {
      if (rule.match.test(text)) {
        return this.pick(rule.match.source, rule.replies);
      }
    }
    return this.pick('fallback', FALLBACKS);
  }

  /** Rotate variants per rule so repeated questions don't repeat verbatim. */
  private pick(key: string, variants: string[]): string {
    const n = this.counts.get(key) ?? 0;
    this.counts.set(key, n + 1);
    return variants[n % variants.length] ?? variants[0] ?? '';
  }
}
