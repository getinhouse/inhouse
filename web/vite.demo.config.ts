/**
 * Build config for the public interface demo, deployed as static files at
 * getinhouse.org/demo by Cloudflare Pages (output dir: site/). Produces
 * site/demo/ from demo.html + the demo entry; the output is committed so
 * Pages needs no build step.
 *
 *   npm run build:demo      (or `make demo` from the repo root)
 */
import { copyFileSync, mkdirSync, readdirSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const outDir = resolve(__dirname, '../site/demo');

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'inhouse-demo-output',
      closeBundle() {
        // Pages must serve this page at /demo/, so the entry has to be
        // index.html; Rollup names it after the source (demo.html).
        renameSync(resolve(outDir, 'demo.html'), resolve(outDir, 'index.html'));
        copyFileSync(resolve(__dirname, 'public/icon.svg'), resolve(outDir, 'icon.svg'));
        // Pre-baked Piper reply audio (scripts/gen_demo_voice.py).
        const voiceSrc = resolve(__dirname, 'demo-voice');
        const voiceOut = resolve(outDir, 'voice');
        mkdirSync(voiceOut, { recursive: true });
        for (const f of readdirSync(voiceSrc).filter((f) => f.endsWith('.mp3'))) {
          copyFileSync(resolve(voiceSrc, f), resolve(voiceOut, f));
        }
      },
    },
  ],
  base: '/demo/',
  publicDir: false, // no manifest/sw — the demo is a page, not an installable PWA
  build: {
    outDir,
    emptyOutDir: true,
    rollupOptions: { input: resolve(__dirname, 'demo.html') },
  },
});
