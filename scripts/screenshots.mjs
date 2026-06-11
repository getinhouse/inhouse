// Regenerate the README screenshots by driving the real app headless.
//
// Playwright is intentionally NOT a project dependency — install it ad hoc:
//   cd web && npm i --no-save playwright && npx playwright install chromium
//
// Usage (from repo root, server venv + web build present, server running on
// :8770 with INHOUSE_LLM__BASE_URL=http://127.0.0.1:9002/v1):
//   node scripts/screenshots.mjs
//
// Starts a canned OpenAI-compatible LLM on :9002, expects the Inhouse server
// on :8770 already pointed at it (the wrapper below does this), drives two
// text turns through the actual UI, and captures desktop + phone shots into
// docs/screenshots/.

import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// playwright lives in the web app's devDependencies.
const { chromium } = await import(
  path.join(ROOT, 'web/node_modules/playwright/index.mjs')
);

const ANSWERS = [
  [
    'do you send anything to the cloud',
    'Nope. Your speech was transcribed right here by Whisper, this reply is ' +
      'being synthesized by Piper on the same machine, and the only network ' +
      'hop is to whichever LLM you configured. Unplug the internet and I can ' +
      'still hear you, think with a local model, and talk back.',
  ],
  [
    'good way to learn rust',
    'Coming from Python, start by porting a small tool you already wrote, ' +
      'like a CLI or a log parser. You will hit ownership and borrowing ' +
      'immediately, which is the part worth learning first. The Rust book is ' +
      'excellent, and clippy will teach you idioms as you go.',
  ],
];

function reply(messages) {
  const last = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
  const hit = ANSWERS.find(([k]) => last.toLowerCase().includes(k));
  return hit ? hit[1] : `You asked: ${last}`;
}

const mock = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', async () => {
    const text = reply(JSON.parse(body).messages ?? []);
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    for (let i = 0; i < text.length; i += 12) {
      res.write(
        `data: ${JSON.stringify({ choices: [{ delta: { content: text.slice(i, i + 12) } }] })}\n\n`,
      );
      await new Promise((r) => setTimeout(r, 30)); // believable token cadence
    }
    res.write('data: [DONE]\n\n');
    res.end();
  });
});

async function askViaUi(page, text) {
  const input = page.locator('input[type="text"], textarea').last();
  await input.fill(text);
  await input.press('Enter');
  // Wait for the assistant turn to render fully.
  await page.waitForTimeout(4000);
}

const main = async () => {
  await new Promise((r) => mock.listen(9002, '127.0.0.1', r));
  const browser = await chromium.launch();

  for (const [name, viewport, scale] of [
    ['conversation-desktop', { width: 1280, height: 820 }, 2],
    ['conversation-phone', { width: 390, height: 844 }, 3],
  ]) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: scale });
    await ctx.addInitScript(() => {
      localStorage.setItem(
        'inhouse.settings.v1',
        JSON.stringify({ baseUrl: '', token: '', vadThreshold: 0.02, playAloud: false }),
      );
    });
    const page = await ctx.newPage();
    await page.goto('http://127.0.0.1:8770/');
    await page.waitForTimeout(1500);
    await askViaUi(page, 'Wait — do you send anything to the cloud?');
    await askViaUi(page, "What's a good way to learn Rust as a Python dev?");
    await page.screenshot({ path: path.join(ROOT, `docs/screenshots/${name}.png`) });
    await ctx.close();
    console.log(`captured docs/screenshots/${name}.png`);
  }

  await browser.close();
  mock.close();
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
