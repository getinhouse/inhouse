// Record the README hands-free GIF by driving a REAL turn headless:
// Chromium's fake microphone is backed by a Piper-spoken WAV, so the VAD,
// whisper STT, LLM, and TTS all genuinely run.
//
// Playwright is intentionally NOT a project dependency — install it ad hoc:
//   cd web && npm i --no-save playwright && npx playwright install chromium
//
// Prep (see scripts/screenshots.mjs wrapper for the server side):
//   1. fake mic track with lead-in silence, e.g.:
//      echo "your question" | piper -m <voice> -f /tmp/q-raw.wav
//      ffmpeg -i /tmp/q-raw.wav -af "adelay=2500:all=1,apad=pad_dur=6" \
//             -ar 44100 /tmp/handsfree-question.wav
//   2. Inhouse server on :8770 pointed at an LLM (canned mock on :9002 below)
// Run from repo root: node scripts/record_gif.mjs
// Then convert:  ffmpeg -i <video.webm> -vf "fps=9,scale=360:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse" docs/screenshots/handsfree-turn.gif

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(
  path.join(ROOT, 'web/node_modules/playwright/index.mjs')
);

const ANSWER =
  'Sunrise is at five fifty-two tomorrow, and you said last week you wanted ' +
  'to start running before work. One good reason: the streets are empty, ' +
  'and you will be done before your first meeting.';

const mock = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/fake-mic.wav') {
    res.writeHead(200, {
      'content-type': 'audio/wav',
      'access-control-allow-origin': '*',
    });
    fs.createReadStream('/tmp/handsfree-question.wav').pipe(res);
    return;
  }
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', async () => {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    for (let i = 0; i < ANSWER.length; i += 10) {
      res.write(
        `data: ${JSON.stringify({ choices: [{ delta: { content: ANSWER.slice(i, i + 10) } }] })}\n\n`,
      );
      await new Promise((r) => setTimeout(r, 35));
    }
    res.write('data: [DONE]\n\n');
    res.end();
  });
});

const main = async () => {
  await new Promise((r) => mock.listen(9002, '127.0.0.1', r));
  const browser = await chromium.launch({
    // headless:false + --headless=new forces the FULL chromium binary in new
    // headless mode; the default "headless shell" lacks fake media devices.
    headless: false,
    args: [
      '--headless=new',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-capture',
      '--use-file-for-fake-audio-capture=/tmp/handsfree-question.wav%noloop',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    recordVideo: { dir: '/tmp/inhouse-gif', size: { width: 390, height: 844 } },
  });
  await ctx.addInitScript(() => {
    localStorage.setItem(
      'inhouse.settings.v1',
      JSON.stringify({
        baseUrl: '', token: '', vadThreshold: 0.02, playAloud: true, bargeIn: false,
      }),
    );
    // Headless chromium here exposes no audio devices (fake-device flags are
    // ignored), so present a Web Audio stream of the prepared WAV as the mic.
    navigator.mediaDevices.getUserMedia = async () => {
      const ac = new AudioContext();
      const res = await fetch('http://127.0.0.1:9002/fake-mic.wav');
      const buf = await ac.decodeAudioData(await res.arrayBuffer());
      const src = ac.createBufferSource();
      src.buffer = buf;
      const dest = ac.createMediaStreamDestination();
      src.connect(dest);
      src.start();
      return dest.stream;
    };
  });
  const page = await ctx.newPage();
  page.on('console', (m) => console.log('[console]', m.type(), m.text()));
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto('http://127.0.0.1:8770/');
  await page.waitForTimeout(1200);
  // Enabling hands-free opens the mic; the fake capture file starts playing
  // from its 2.5s lead-in silence, so the VAD arms before "speech" begins.
  const toggle = page.getByRole('checkbox', { name: /hands.?free/i });
  await toggle.check({ force: true });
  await page.waitForTimeout(500);
  console.log('[debug] checked after click:', await toggle.isChecked());
  console.log('[debug] banner:', await page.locator('[class*=error], [role=alert]').allTextContents());
  await page.waitForTimeout(24000); // silence → speech → STT → LLM → spoken reply
  await ctx.close();
  await browser.close();
  mock.close();
  console.log('video written under /tmp/inhouse-gif/');
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
