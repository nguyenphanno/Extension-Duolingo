// Copyright github.com/nguyenphanno © 2026. All rights reserved
/**
 * ContentScript.ts — a small, self-contained pill on duolingo.com.
 *
 * Rendered inside a shadow root so Duolingo's CSS (which is aggressive) cannot
 * reach it, and so we never leak our styles into their page.
 */
import { ANSWER_CHANNEL_TAG, AUTO_ANSWER, PORT_NAME } from '@Shared/Constants';
import type { AnswerCaptureMessage, AutoAnswerSettings, Settings } from '@Shared/Types';
import type { StreamEvent, UiState } from '@Shared/Protocol';
import type { UiRequest } from '@Shared/Protocol';
import { isLessonUrl } from '@Shared/Utils/Route';
import { AnswerBook } from '@Core/Storage/AnswerBook';
import { LessonPilot, type PilotStats } from './Lesson/Pilot';

const HOST_ID = 'duo-assist-root';

if (!document.getElementById(HOST_ID)) {
  mount();
}

function mount(): void {
  const host = document.createElement('div');
  host.id = HOST_ID;
  host.style.cssText = 'all:initial;position:fixed;right:20px;bottom:20px;z-index:2147483647;';
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });

  /**
   * Duolingo's own artwork, shipped in `public/duo/`. It has to go through
   * `getURL` and is listed in `web_accessible_resources` — the shadow root is
   * still page context, so a bare relative path would 404 against duolingo.com.
   */
  const art = (name: string): string => {
    try {
      return chrome.runtime.getURL(`duo/${name}.svg`);
    } catch {
      return '';
    }
  };

  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; }
      .wrap {
        font-family: "din-round", "Nunito", ui-rounded, "Segoe UI", system-ui, sans-serif;
        -webkit-font-smoothing: antialiased;
        display: flex; flex-direction: column; align-items: flex-end; gap: 10px;
      }
      .pill {
        display: flex; align-items: center; gap: 10px;
        background: #fff; border: 2px solid #e5e5e5; border-bottom-width: 4px;
        border-radius: 999px; padding: 6px 14px 6px 8px; cursor: pointer;
        box-shadow: 0 6px 18px rgba(0,0,0,.10); transition: transform .12s ease, box-shadow .12s ease;
        user-select: none;
      }
      .pill:hover { transform: translateY(-1px); box-shadow: 0 10px 24px rgba(0,0,0,.14); }
      .pill:active { transform: translateY(2px); border-bottom-width: 2px; }
      .owl { width: 32px; height: 32px; border-radius: 50%; background: #58cc02; display: grid; place-items: center; flex: none; }
      .owl svg { width: 20px; height: 20px; display: block; }
      .meta { display: flex; flex-direction: column; line-height: 1.05; }
      .label { font-size: 10px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: #afafaf; }
      .value { font-size: 15px; font-weight: 800; color: #3c3c3c; display: flex; align-items: center; gap: 4px; }
      .value__art { height: 16px; width: auto; display: block; }
      .dot { width: 8px; height: 8px; border-radius: 50%; background: #58cc02; box-shadow: 0 0 0 3px rgba(88,204,2,.15); }
      .dot.busy { background: #1cb0f6; box-shadow: 0 0 0 3px rgba(28,176,246,.18); animation: pulse 1.1s ease-in-out infinite; }
      .dot.err { background: #ff4b4b; box-shadow: 0 0 0 3px rgba(255,75,75,.16); }
      @keyframes pulse { 50% { opacity: .35; } }

      .card {
        width: 288px; background: #fff; border: 2px solid #e5e5e5; border-bottom-width: 4px;
        border-radius: 20px; padding: 16px; box-shadow: 0 16px 40px rgba(0,0,0,.16);
        display: none; flex-direction: column; gap: 12px;
        animation: pop .16s ease-out;
      }
      .card.open { display: flex; }
      @keyframes pop { from { opacity: 0; transform: translateY(8px) scale(.98); } }

      .head { display: flex; align-items: center; gap: 10px; }
      .avatar { width: 40px; height: 40px; border-radius: 50%; background: #ddf4ff; display: grid; place-items: center; font-size: 18px; }
      .who { display: flex; flex-direction: column; min-width: 0; }
      .name { font-size: 15px; font-weight: 800; color: #3c3c3c; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .sub { font-size: 12px; font-weight: 700; color: #afafaf; }

      .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
      .stat { background: #f7f7f7; border-radius: 12px; padding: 8px; text-align: center; }
      .stat .art { height: 20px; width: auto; display: block; margin: 0 auto 3px; }
      .stat b { display: block; font-size: 15px; color: #3c3c3c; }
      .stat span { font-size: 10px; font-weight: 800; letter-spacing: .04em; color: #afafaf; text-transform: uppercase; }

      .bar { height: 12px; background: #e5e5e5; border-radius: 999px; overflow: hidden; }
      .bar > i { display: block; height: 100%; width: 0; background: #58cc02; border-radius: 999px; transition: width .3s ease; }
      .status { font-size: 12px; font-weight: 700; color: #777; }

      .btn {
        border: 0; border-bottom: 4px solid #58a700; border-radius: 14px; background: #58cc02; color: #fff;
        font: inherit; font-size: 14px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase;
        padding: 11px 14px; cursor: pointer; transition: filter .12s ease, transform .12s ease;
      }
      .btn:hover { filter: brightness(1.04); }
      .btn:active { transform: translateY(2px); border-bottom-width: 2px; }
      .btn[disabled] { background: #e5e5e5; border-bottom-color: #d4d4d4; color: #afafaf; cursor: not-allowed; }
      .btn.ghost { background: #fff; color: #1cb0f6; border: 2px solid #e5e5e5; border-bottom-width: 4px; }
      .row { display: flex; gap: 8px; }
      .row > * { flex: 1; }

      /* Lesson HUD: appears only while a lesson page is open. */
      .hud {
        position: fixed; top: 16px; right: 16px; width: 268px;
        background: #fff; border: 2px solid #e5e5e5; border-bottom-width: 4px;
        border-radius: 18px; padding: 12px; display: none;
        flex-direction: column; gap: 9px; box-shadow: 0 14px 34px rgba(0,0,0,.14);
      }
      .hud.on { display: flex; }
      .hud__head { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #3c3c3c; }
      .hud__head b { font-size: 13px; font-weight: 800; }
      .hud__phase { margin-left: auto; font-size: 10px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: #afafaf; }
      .hud__bar { height: 10px; background: #e5e5e5; border-radius: 999px; overflow: hidden; }
      .hud__bar > i { display: block; height: 100%; width: 0; background: #58cc02; border-radius: 999px; transition: width .3s ease; }
      .hud__row { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; font-weight: 700; color: #777; }
      .hud .btn { padding: 9px 12px; font-size: 12px; }

      /* Auto-answer row. Deliberately quiet: it is a switch, not a call to
         action, and it sits above the run button so the two are not confused. */
      .hud__answer { display: flex; align-items: center; gap: 8px; }
      .hud__answer .sw {
        margin-left: auto; flex: none; width: 42px; height: 24px; border-radius: 999px; border: 0;
        background: #e5e5e5; padding: 0; cursor: pointer; position: relative;
        transition: background .16s ease;
      }
      .hud__answer .sw::after {
        content: ''; position: absolute; top: 3px; left: 3px; width: 18px; height: 18px;
        border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.2);
        transition: transform .16s ease;
      }
      .hud__answer .sw[aria-checked="true"] { background: #58cc02; }
      .hud__answer .sw[aria-checked="true"]::after { transform: translateX(18px); }
      .hud__answer .sw[disabled] { opacity: .45; cursor: not-allowed; }
      .hud__answer-label { font-size: 12px; font-weight: 800; color: #777; }
      .hud__answer-count { margin-left: 6px; font-size: 11px; font-weight: 800; color: #58cc02; }
      .hud__note { font-size: 11px; font-weight: 700; color: #afafaf; min-height: 14px; }
      .hud__note b { color: #1cb0f6; font-weight: 800; }

      /* Duolingo has its own theme switch, which is independent of the OS.
         The dark class is set from the page's own background colour, so the
         panel matches the site rather than the operating system. */
      .wrap.dark .pill, .wrap.dark .card, .wrap.dark .hud { background: #202f36; border-color: #37464f; }
      .wrap.dark .value, .wrap.dark .name, .wrap.dark .stat b,
      .wrap.dark .hud__head, .wrap.dark .hud__head b { color: #f1f7fb; }
      .wrap.dark .stat { background: #131f24; }
      .wrap.dark .bar, .wrap.dark .hud__bar { background: #37464f; }
      .wrap.dark .status, .wrap.dark .hud__row { color: #8fa6b2; }
      .wrap.dark .btn.ghost { background: #202f36; }
    </style>
    <div class="wrap">
      <div class="hud" id="hud">
        <div class="hud__head">
          <span class="dot" id="hud-dot"></span>
          <b>Duo Assist</b>
          <span class="hud__phase" id="hud-phase">idle</span>
        </div>
        <div class="hud__bar"><i id="hud-bar"></i></div>
        <div class="hud__row">
          <span id="hud-label">Lesson detected</span>
          <span id="hud-xp">+0 XP</span>
        </div>
        <div class="hud__row hud__answer">
          <span class="hud__answer-label">Auto-answer<span class="hud__answer-count" id="hud-count"></span></span>
          <button class="sw" id="hud-answer" role="switch" aria-checked="false" aria-label="Auto-answer"></button>
        </div>
        <div class="hud__note" id="hud-note"></div>
        <button class="btn" id="hud-run">Auto-pilot</button>
      </div>
      <div class="card" id="card">
        <div class="head">
          <div class="avatar">🦉</div>
          <div class="who">
            <div class="name" id="name">Duo Assist</div>
            <div class="sub" id="sub">Connecting…</div>
          </div>
        </div>
        <div class="stats">
          <div class="stat"><img class="art" src="${art('streak')}" alt="" aria-hidden="true" /><b id="s-streak">–</b><span>Streak</span></div>
          <div class="stat"><img class="art" src="${art('xp')}" alt="" aria-hidden="true" /><b id="s-xp">–</b><span>XP</span></div>
          <div class="stat"><img class="art" src="${art('gem')}" alt="" aria-hidden="true" /><b id="s-gems">–</b><span>Gems</span></div>
        </div>
        <div class="bar"><i id="bar"></i></div>
        <div class="status" id="status">Idle</div>
        <div class="row">
          <button class="btn" id="run">Run now</button>
          <button class="btn ghost" id="panel">Console</button>
        </div>
      </div>
      <div class="pill" id="pill" role="button" tabindex="0" aria-label="Duo Assist">
        <div class="owl">
          <svg viewBox="0 0 24 24" fill="none"><path d="M12 2c1.2 3.2 4.5 5 4.5 8.6 0 3-2 5.4-4.5 5.4s-4.5-2.4-4.5-5.4C7.5 7 10.8 5.2 12 2Z" fill="#fff"/><circle cx="9.7" cy="10" r="1.4" fill="#58cc02"/><circle cx="14.3" cy="10" r="1.4" fill="#58cc02"/><path d="M9.5 21h5" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>
        </div>
        <div class="meta">
          <span class="label">Duo Assist</span>
          <span class="value"><img class="value__art" src="${art('streak')}" alt="" aria-hidden="true" /><span id="pill-streak">–</span> <span id="pill-state">idle</span></span>
        </div>
        <div class="dot" id="dot"></div>
      </div>
    </div>
  `;

  const $ = <T extends HTMLElement>(id: string): T => shadow.getElementById(id) as T;
  const card = $('card');
  const pill = $('pill');
  const runButton = $<HTMLButtonElement>('run');
  const dot = $('dot');
  const hud = $('hud');
  const hudRun = $<HTMLButtonElement>('hud-run');

  let state: UiState | null = null;
  let lessonOpen = isLessonUrl(location.href);
  let autoStartedFor: string | null = null;

  const isRunningPhase = (phase: string): boolean =>
    phase === 'running' || phase === 'preparing' || phase === 'finishing';

  /* ----------------------------- Auto-answer ----------------------------- */

  /**
   * Mirrors `state.settings.answers`, so the pilot can read the latest value
   * synchronously from inside its own loop instead of chasing the port.
   * These defaults apply only for the second or so before the first state event.
   */
  let answerSettings: AutoAnswerSettings = {
    enabled: false,
    fromPayload: true,
    learnFromSkip: false,
    thinkMs: AUTO_ANSWER.thinkMs,
    maxPerLesson: 0,
    autoSubmit: true,
  };

  const answerBook = new AnswerBook();
  void answerBook.load();

  let pilotStats: PilotStats | null = null;
  let pilotStatus = '';

  const pilot = new LessonPilot(
    () => answerSettings,
    answerBook,
    {
      onStats: (stats) => {
        pilotStats = stats;
        renderAnswer();
      },
      onStatus: (status) => {
        pilotStatus = status;
        renderAnswer();
      },
    },
  );

  let pilotRunning = false;

  /** Auto-answer needs a lesson, permission, and at least one source of answers. */
  function pilotWanted(): boolean {
    if (!lessonOpen || !answerSettings.enabled) return false;
    return answerSettings.fromPayload || answerSettings.learnFromSkip;
  }

  function syncPilot(): void {
    const wanted = pilotWanted();
    if (wanted === pilotRunning) return;

    pilotRunning = wanted;
    if (wanted) pilot.start();
    else pilot.stop();
    renderAnswer();
  }

  function renderAnswer(): void {
    const sw = $<HTMLButtonElement>('hud-answer');
    sw.setAttribute('aria-checked', String(answerSettings.enabled));
    sw.disabled = !lessonOpen;

    const count = $('hud-count');
    count.textContent = pilotStats && pilotStats.answered > 0 ? String(pilotStats.answered) : '';

    const note = $('hud-note');
    if (!lessonOpen) {
      note.textContent = 'Open a lesson to use this';
      return;
    }
    if (!answerSettings.enabled) {
      note.textContent = answerBook.size > 0 ? `${answerBook.size} sentences remembered` : 'Off';
      return;
    }

    const parts: string[] = [];
    if (pilotStats) {
      parts.push(`${pilotStats.answered} answered`);
      if (pilotStats.learned > 0) parts.push(`${pilotStats.learned} learned`);
      if (pilotStats.misses > 0) parts.push(`${pilotStats.misses} missed`);
    }
    if (pilotStatus) parts.push(pilotStatus);
    note.textContent = parts.join(' · ') || 'Watching';
  }

  $<HTMLButtonElement>('hud-answer').addEventListener('click', async () => {
    if (!state) return;
    const next = !answerSettings.enabled;
    answerSettings = { ...answerSettings, enabled: next };
    renderAnswer();

    // Optimistic local flip, then the service worker's state event confirms it.
    await send({ type: 'settings/save', settings: { ...state.settings, answers: answerSettings } });
    syncPilot();
  });

  /**
   * Answers captured from the page. Guarded on `event.source` so a nested
   * iframe cannot feed us a payload, and on the tag so nothing else on the page
   * can trigger a lookup.
   */
  window.addEventListener('message', (event: MessageEvent<AnswerCaptureMessage>) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data[ANSWER_CHANNEL_TAG] !== 1) return;
    if (!Array.isArray(data.pairs) || data.pairs.length === 0) return;
    if (!answerSettings.fromPayload) return;

    pilot.absorb(data.pairs);
    renderAnswer();
  });

  /* ------------------------------ Lesson HUD ----------------------------- */

  hud.classList.toggle('on', lessonOpen);

  const wrap = shadow.querySelector('.wrap') as HTMLElement;

  /**
   * Duolingo's dark mode is a site setting, not the OS preference, so the panel
   * follows the page's own background colour instead of `prefers-color-scheme`.
   */
  function pageIsDark(): boolean {
    const luminance = (element: Element): number | null => {
      const parts = getComputedStyle(element).backgroundColor.match(/[\d.]+/g);
      if (!parts || parts.length < 3) return null;
      const alpha = parts.length > 3 ? Number(parts[3]) : 1;
      if (alpha < 0.1) return null; // transparent — look further up
      const [r, g, b] = parts.map(Number);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };

    const value = luminance(document.body) ?? luminance(document.documentElement);
    if (value !== null) return value < 128;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function syncTheme(): void {
    wrap.classList.toggle('dark', pageIsDark());
  }

  syncTheme();

  /**
   * The HUD lives on lesson pages only. Duolingo is a SPA, so this is polled
   * rather than driven by an event — there is no reliable navigation hook.
   */
  function syncLessonRoute(): void {
    const next = isLessonUrl(location.href);
    if (next === lessonOpen) return;
    lessonOpen = next;
    hud.classList.toggle('on', lessonOpen);
    if (!lessonOpen) autoStartedFor = null;
    // A new lesson starts with a clean slate: counters, stall guard and the
    // "skip is still safe" flag all belong to one lesson, not to the tab.
    pilot.reset();
    renderHud();
    syncPilot();
    renderAnswer();
    maybeAutoStart();
  }

  /** Opt-in: start a run when a lesson opens, once per lesson URL. */
  function maybeAutoStart(): void {
    if (!lessonOpen || !state) return;
    if (!state.settings.behavior.runOnLesson) return;
    if (isRunningPhase(state.run.phase)) return;
    const key = location.pathname + location.search;
    if (autoStartedFor === key) return;
    autoStartedFor = key;
    void send({ type: 'run/start', trigger: 'content-script' });
  }

  function renderHud(): void {
    if (!state) return;
    const { run, lastSummary } = state;
    const running = isRunningPhase(run.phase);

    $('hud-phase').textContent = running ? 'running' : run.phase;
    $('hud-dot').className = `dot${running ? ' busy' : run.phase === 'failed' ? ' err' : ''}`;
    $<HTMLElement>('hud-bar').style.width = `${Math.round((running ? run.progress : run.phase === 'done' ? 1 : 0) * 100)}%`;
    $('hud-label').textContent = running
      ? run.currentLabel
      : run.phase === 'done'
        ? 'Last run complete'
        : run.phase === 'failed'
          ? run.error ?? 'Last run failed'
          : 'Lesson detected';
    $('hud-xp').textContent = `+${lastSummary?.xpGained ?? 0} XP`;
    hudRun.textContent = running ? 'Stop' : run.phase === 'done' ? 'Run again' : 'Auto-pilot';
  }

  hudRun.addEventListener('click', async () => {
    if (!state) return;
    const running = isRunningPhase(state.run.phase);
    hudRun.disabled = true;
    await send(running ? { type: 'run/cancel' } : { type: 'run/start', trigger: 'content-script' });
    hudRun.disabled = false;
  });

  const toggle = () => card.classList.toggle('open');
  pill.addEventListener('click', toggle);
  pill.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggle();
    }
  });

  const send = async (request: UiRequest): Promise<unknown> => {
    try {
      return await chrome.runtime.sendMessage(request);
    } catch {
      return null;
    }
  };

  runButton.addEventListener('click', async () => {
    runButton.disabled = true;
    runButton.textContent = 'Starting…';
    await send({ type: 'run/start', trigger: 'content-script' });
    runButton.textContent = 'Run now';
    runButton.disabled = false;
  });

  $('panel').addEventListener('click', () => {
    void send({ type: 'panel/open' });
  });

  function render(): void {
    if (!state) return;
    const { profile, run, stats } = state;
    $('name').textContent = profile ? `@${profile.username}` : 'Not signed in';
    $('sub').textContent = profile
      ? `${profile.learningLanguage.toUpperCase()} · ${profile.hasPlus ? 'Super' : 'Free'}`
      : 'Open duolingo.com in a tab and sign in';
    $('s-streak').textContent = profile ? String(profile.streak) : '–';
    $('s-xp').textContent = profile ? String(profile.totalXp) : '–';
    $('s-gems').textContent = profile ? String(profile.gems) : '–';
    $('pill-streak').textContent = profile ? String(profile.streak) : '–';

    const busy = run.phase === 'running' || run.phase === 'preparing' || run.phase === 'finishing';
    dot.className = `dot${busy ? ' busy' : run.phase === 'failed' ? ' err' : ''}`;
    $('pill-state').textContent = busy ? 'running' : run.phase;

    $<HTMLElement>('bar').style.width = `${Math.round((busy ? run.progress : run.phase === 'done' ? 1 : 0) * 100)}%`;
    $('status').textContent = busy
      ? run.currentLabel
      : run.phase === 'done'
        ? `Last run +${state.lastSummary?.xpGained ?? 0} XP · ${stats.runs} runs total`
        : run.phase === 'failed'
          ? run.error ?? 'Last run failed'
          : 'Idle — ready when you are';

    runButton.disabled = busy;
    runButton.textContent = busy ? 'Running…' : 'Run now';

    renderHud();
    syncAnswerSettings(state.settings);
    maybeAutoStart();
  }

  /** Keep the pilot's view of the settings current, then start or stop it. */
  function syncAnswerSettings(settings: Settings): void {
    const next = settings.answers;
    const changed =
      next.enabled !== answerSettings.enabled ||
      next.fromPayload !== answerSettings.fromPayload ||
      next.learnFromSkip !== answerSettings.learnFromSkip ||
      next.thinkMs !== answerSettings.thinkMs ||
      next.maxPerLesson !== answerSettings.maxPerLesson ||
      next.autoSubmit !== answerSettings.autoSubmit;

    answerSettings = next;
    if (changed && !next.enabled && pilotRunning) pilot.reset();
    syncPilot();
    renderAnswer();
  }

  const port = chrome.runtime.connect({ name: PORT_NAME });
  port.onMessage.addListener((event: StreamEvent) => {
    if (event.type === 'hello' || event.type === 'state') {
      state = event.state;
      render();
    } else if (event.type === 'run' && state) {
      state = { ...state, run: event.run };
      render();
    } else if (event.type === 'profile' && state) {
      state = { ...state, profile: event.profile };
      render();
    }
  });

  void (async () => {
    const response = (await send({ type: 'state/get' })) as { ok?: boolean; value?: UiState } | null;
    if (response?.ok && response.value) {
      state = response.value;
      render();
    }
  })();

  // Duolingo navigates without a reload, so the route and the page theme are
  // checked on a timer.
  setInterval(() => {
    syncTheme();
    syncLessonRoute();
  }, 1200);
}
