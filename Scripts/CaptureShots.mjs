// Copyright github.com/nguyenphanno © 2026. All rights reserved
/**
 * CaptureShots.mjs — regenerates docs/screenshots/*.png from the built UI.
 *
 * Why a dedicated script: the surfaces have to be photographed at their real
 * size (384x600 popup, 400x720 panel, 1280x840 options) with no browser chrome
 * around them, in both themes, and one of them needs a keypress before the
 * shutter. Doing that by hand is unrepeatable, so this drives Chrome over the
 * DevTools Protocol instead.
 *
 * Usage:
 *   node Scripts/Build.mjs          # the script reads dist/, so build first
 *   node Scripts/CaptureShots.mjs   # writes every PNG in SHOTS
 *   node Scripts/CaptureShots.mjs popup options   # only the named shots
 *
 * No dependencies: Chrome is found on disk, and Node 22 ships a WebSocket.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(import.meta.dirname, '..');
const DIST = join(ROOT, 'dist');
const OUT = join(ROOT, 'docs', 'screenshots');
const PORT = 9333;

/** Every shot: viewport, theme, and the optional interaction before capture. */
const SHOTS = [
  {
    name: 'popup',
    page: 'Popup.html',
    width: 384,
    height: 600,
    scale: 2,
    caption: 'Toolbar popup — identity, run control, streak safety, fortnight chart.',
  },
  {
    name: 'popup-dark',
    page: 'Popup.html',
    width: 384,
    height: 600,
    scale: 2,
    dark: true,
    caption: 'The same popup in dark mode. Every token has a Night counterpart.',
  },
  {
    name: 'side-panel',
    page: 'SidePanel.html',
    width: 400,
    height: 720,
    scale: 2,
    caption: 'Side panel — live progress, task timeline and streaming log.',
  },
  {
    name: 'options',
    page: 'Options.html?section=activity',
    width: 1280,
    height: 840,
    scale: 2,
    caption: 'Options · Activity — streak forecast, heatmap, achievements, run history.',
  },
  {
    name: 'options-answers',
    page: 'Options.html?section=answers',
    width: 1280,
    height: 840,
    scale: 2,
    caption: 'Options · Auto-answer — the two answer sources, the timing, and the remembered sentences.',
  },
  {
    name: 'palette',
    page: 'Options.html?section=account',
    width: 1280,
    height: 840,
    scale: 2,
    caption: 'Command palette (Ctrl/Cmd + K) — navigate, run, retry, theme, export.',
    after: async (session) => {
      // React listens on window, so a synthetic keydown is enough — no input
      // injection needed, and it works regardless of focus.
      await session.send('Runtime.evaluate', {
        expression: `window.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'k', code: 'KeyK', ctrlKey: true, bubbles: true, cancelable: true
        }))`,
      });
      await delay(220);
    },
  },
  {
    name: 'popup-tasks',
    page: 'Popup.html',
    width: 384,
    height: 600,
    scale: 2,
    caption: 'Popup · Tasks — run-shape presets and the per-task plan.',
    after: async (session) => {
      // The tab bar is a real button; a synthetic click goes through React's
      // delegated handler exactly like a user's would.
      await session.send('Runtime.evaluate', {
        expression: `document.querySelectorAll('.tabbar__item')[1]?.click()`,
      });
      await delay(240);
    },
  },
  /*
   * The Vietnamese pass. `?locale=vi` is honoured by the mock bridge, so these
   * are reproducible like the rest — they exist to prove the translated layout
   * doesn't overflow, which is where a longer string usually breaks first.
   */
  {
    name: 'popup-vi',
    page: 'Popup.html?locale=vi',
    width: 384,
    height: 600,
    scale: 2,
    caption: 'Popup, Vietnamese — the same layout with longer labels.',
  },
  {
    name: 'popup-dark-vi',
    page: 'Popup.html?locale=vi',
    width: 384,
    height: 600,
    scale: 2,
    dark: true,
    caption: 'Popup, Vietnamese, dark.',
  },
  {
    name: 'options-vi',
    page: 'Options.html?section=activity&locale=vi',
    width: 1280,
    height: 840,
    scale: 2,
    caption: 'Options · Activity, Vietnamese.',
  },
  {
    name: 'palette-vi',
    page: 'Options.html?section=account&locale=vi',
    width: 1280,
    height: 840,
    scale: 2,
    caption: 'Command palette, Vietnamese.',
    after: async (session) => {
      await session.send('Runtime.evaluate', {
        expression: `window.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'k', code: 'KeyK', ctrlKey: true, bubbles: true, cancelable: true
        }))`,
      });
      await delay(220);
    },
  },
];

/* ------------------------------------------------------------------ *
 * Chrome discovery
 * ------------------------------------------------------------------ */

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];

function findChrome() {
  for (const candidate of CANDIDATES) {
    if (candidate && existsSync(candidate)) return candidate;
  }
  throw new Error('Chrome not found — set CHROME_PATH to the executable.');
}

const delay = (ms) => new Promise((done) => setTimeout(done, ms));

/* ------------------------------------------------------------------ *
 * Minimal CDP client (flat sessions)
 * ------------------------------------------------------------------ */

class Cdp {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.waiters = new Set();

    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve: done, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(`${message.error.message} (${message.error.code})`));
        else done(message.result);
        return;
      }
      if (!message.method) return;
      for (const waiter of [...this.waiters]) {
        if (waiter.method !== message.method) continue;
        if (waiter.sessionId && waiter.sessionId !== message.sessionId) continue;
        this.waiters.delete(waiter);
        waiter.resolve(message.params);
      }
    });
  }

  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
    });
  }

  once(method, sessionId) {
    return new Promise((resolve) => this.waiters.add({ method, sessionId, resolve }));
  }
}

async function waitForPort(port, timeoutMs = 15_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return (await response.json()).webSocketDebuggerUrl;
    } catch {
      /* not up yet */
    }
    await delay(120);
  }
  throw new Error(`Chrome did not open the debugging port (${port}).`);
}

/* ------------------------------------------------------------------ *
 * Capture
 * ------------------------------------------------------------------ */

async function shoot(cdp, shot) {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const session = {
    send: (method, params) => cdp.send(method, params, sessionId),
    once: (method) => cdp.once(method, sessionId),
  };

  try {
    await session.send('Page.enable');
    await session.send('Runtime.enable');

    // A fresh, exact viewport — never inherit the browser window size.
    await session.send('Emulation.setDeviceMetricsOverride', {
      width: shot.width,
      height: shot.height,
      deviceScaleFactor: shot.scale ?? 2,
      mobile: false,
    });
    await session.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-color-scheme', value: shot.dark ? 'dark' : 'light' }],
    });

    // `page` may carry a query string (deep links), which must stay outside the
    // file path — pathToFileURL would otherwise escape the `?` into the name.
    const [file, search = ''] = shot.page.split('?');
    const url = `${pathToFileURL(join(DIST, file)).href}${search ? `?${search}` : ''}`;
    const loaded = session.once('Page.loadEventFired');
    await session.send('Page.navigate', { url });
    await loaded;

    // Fonts and the first paint of the mock bridge both land after load.
    await session.send('Runtime.evaluate', { expression: 'document.fonts.ready', awaitPromise: true });
    await delay(420);

    // Never inherit a scroll offset from a previous interaction.
    await session.send('Runtime.evaluate', {
      expression: 'document.documentElement.scrollTop = 0; document.body.scrollTop = 0;',
    });

    if (shot.after) await shot.after(session);

    const { data } = await session.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: false,
    });

    const bytes = Buffer.from(data, 'base64');
    writeFileSync(join(OUT, `${shot.name}.png`), bytes);
    return bytes.length;
  } finally {
    await cdp.send('Target.closeTarget', { targetId }).catch(() => {});
  }
}

async function main() {
  if (!existsSync(join(DIST, 'Popup.html'))) {
    throw new Error('dist/ is empty — run `node Scripts/Build.mjs` first.');
  }
  mkdirSync(OUT, { recursive: true });

  const only = process.argv.slice(2).filter((arg) => !arg.startsWith('-'));
  const shots = only.length ? SHOTS.filter((shot) => only.includes(shot.name)) : SHOTS;
  if (!shots.length) throw new Error(`No shot matches: ${only.join(', ')}`);

  const profile = mkdtempSync(join(tmpdir(), 'duo-shots-'));
  const chrome = spawn(
    findChrome(),
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--allow-file-access-from-files',
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${profile}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  let cdp;
  try {
    const wsUrl = await waitForPort(PORT);
    const socket = new WebSocket(wsUrl);
    await new Promise((open, fail) => {
      socket.addEventListener('open', open, { once: true });
      socket.addEventListener('error', fail, { once: true });
    });
    cdp = new Cdp(socket);

    for (const shot of shots) {
      const bytes = await shoot(cdp, shot);
      console.log(`[shots] ${shot.name}.png — ${(bytes / 1024).toFixed(0)} kB  ·  ${shot.width}x${shot.height}@${shot.scale ?? 2}x`);
    }
  } finally {
    try {
      cdp?.socket.close();
    } catch {
      /* already gone */
    }
    chrome.kill();
    // Chrome holds handles for a moment after the kill; the profile is
    // disposable, so a failed cleanup is not worth failing the run over.
    setTimeout(() => {
      try {
        rmSync(profile, { recursive: true, force: true });
      } catch {
        /* left in %TEMP% — harmless */
      }
    }, 800).unref();
  }

  console.log(`\n[shots] ${shots.length} screenshot(s) written to docs/screenshots/`);
}

main().catch((error) => {
  console.error(`[shots] ${error.message}`);
  process.exit(1);
});
