import { describe, expect, it } from 'vitest';
import { DemoBrain } from './brain';

describe('DemoBrain', () => {
  it('greets and identifies itself honestly as a demo', () => {
    const brain = new DemoBrain();
    expect(brain.reply('Hello there')).toMatch(/demo/i);
    expect(brain.reply('what are you?')).toMatch(/simulat|stand-in/i);
  });

  it('explains the real pipeline', () => {
    const brain = new DemoBrain();
    const reply = brain.reply('how does it work?');
    expect(reply).toMatch(/whisper/i);
    expect(reply).toMatch(/piper/i);
  });

  it('answers privacy questions with the local-first story', () => {
    const brain = new DemoBrain();
    expect(brain.reply('is this private?')).toMatch(/hardware you own|zero requests/i);
  });

  it('refuses real-world tasks instead of faking them', () => {
    const brain = new DemoBrain();
    expect(brain.reply("what's the weather like?")).toMatch(/can't|demo/i);
  });

  it('pitches Pro when asked about pricing', () => {
    const brain = new DemoBrain();
    const reply = brain.reply('how much does it cost?');
    expect(reply).toMatch(/\$59/);
    expect(reply).toMatch(/MIT/);
  });

  it('rotates variants instead of repeating verbatim', () => {
    const brain = new DemoBrain();
    const first = brain.reply('hello');
    const second = brain.reply('hello');
    expect(first).not.toEqual(second);
    expect(brain.reply('hello')).toEqual(first); // wraps around
  });

  it('remembers a name for the session', () => {
    const brain = new DemoBrain();
    expect(brain.reply("Hi, my name is Ada")).toMatch(/Ada/);
    expect(brain.reply('what is my name?')).toMatch(/Ada/);
  });

  it('admits when no name was given', () => {
    const brain = new DemoBrain();
    expect(brain.reply('who am i?')).toMatch(/haven't told me/i);
  });

  it('falls back gracefully on arbitrary input and steers to the product', () => {
    const brain = new DemoBrain();
    const reply = brain.reply('flarp glorble quux');
    expect(reply.length).toBeGreaterThan(40);
    expect(reply).toMatch(/demo|script|real/i);
  });
});
