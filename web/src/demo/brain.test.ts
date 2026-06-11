import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DemoBrain } from './brain';
import LINES from './voice-lines.json';

describe('DemoBrain', () => {
  it('greets and identifies itself honestly as a demo', () => {
    const brain = new DemoBrain();
    expect(brain.reply('Hello there').text).toMatch(/demo/i);
    expect(brain.reply('what are you?').text).toMatch(/simulat|stand-in/i);
  });

  it('explains the real pipeline', () => {
    const reply = new DemoBrain().reply('how does it work?');
    expect(reply.text).toMatch(/whisper/i);
    expect(reply.text).toMatch(/piper/i);
  });

  it('answers privacy questions with the local-first story', () => {
    expect(new DemoBrain().reply('is this private?').text).toMatch(
      /hardware you own|nothing you type/i
    );
  });

  it('refuses real-world tasks instead of faking them', () => {
    expect(new DemoBrain().reply("what's the weather like?").text).toMatch(/can't|demo/i);
  });

  it('pitches Pro when asked about pricing', () => {
    const reply = new DemoBrain().reply('how much does it cost?');
    expect(reply.text).toMatch(/\$59/);
    expect(reply.text).toMatch(/MIT/);
  });

  it('rotates variants instead of repeating verbatim', () => {
    const brain = new DemoBrain();
    const first = brain.reply('hello');
    const second = brain.reply('hello');
    expect(first.text).not.toEqual(second.text);
    expect(brain.reply('hello').text).toEqual(first.text); // wraps around
  });

  it('remembers a name for the session', () => {
    const brain = new DemoBrain();
    expect(brain.reply('Hi, my name is Ada').text).toMatch(/Ada/);
    expect(brain.reply('what is my name?').text).toMatch(/Ada/);
  });

  it('admits when no name was given', () => {
    expect(new DemoBrain().reply('who am i?').text).toMatch(/haven't told me/i);
  });

  it('falls back gracefully on arbitrary input and steers to the product', () => {
    const reply = new DemoBrain().reply('flarp glorble quux');
    expect(reply.text.length).toBeGreaterThan(40);
    expect(reply.text).toMatch(/demo|script|real/i);
  });

  it('tags scripted replies with a voice id and dynamic ones with null', () => {
    const brain = new DemoBrain();
    expect(brain.reply('hello').voiceId).toBe('greet-0');
    expect(brain.reply('my name is Ada').voiceId).toBeNull();
    expect(brain.reply("what's my name?").voiceId).toBeNull();
    expect(new DemoBrain().reply('who am i?').voiceId).toBe('noname-0');
  });

  it('reply text for scripted lines comes verbatim from the catalog', () => {
    const reply = new DemoBrain().reply('tell me a joke');
    expect(reply.voiceId).toBe('joke-0');
    expect(reply.text).toBe(LINES['joke-0']);
  });
});

describe('voice catalog ↔ pre-baked audio', () => {
  it('has one MP3 per catalog line (run scripts/gen_demo_voice.py if not)', () => {
    // vitest runs with cwd = web/ (jsdom remaps import.meta.url to http).
    const voiceDir = resolve(process.cwd(), 'demo-voice');
    const mp3s = readdirSync(voiceDir)
      .filter((f) => f.endsWith('.mp3'))
      .map((f) => f.replace(/\.mp3$/, ''))
      .sort();
    expect(mp3s).toEqual(Object.keys(LINES).sort());
  });
});
