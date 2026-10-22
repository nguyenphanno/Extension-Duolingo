// Copyright github.com/nguyenphanno © 2026. All rights reserved
/**
 * ContentScript.ts — a small, self-contained pill on duolingo.com.
 *
 * Rendered inside a shadow root so Duolingo's CSS (which is aggressive) cannot
 * reach it, and so we never leak our styles into their page.
 */
import { PORT_NAME } from '@Shared/Constants';
import type { StreamEvent, UiState } from '@Shared/Protocol';
import type { UiRequest } from '@Shared/Protocol';

const HOST_ID = 'duo-assist-root';

if (!document.getElementById(HOST_ID)) {
  mount();
}

function mount(): void {
  const host = document.createElement('div');
  host.id = HOST_ID;
  host.style.cssText = 'all:initial;position:fixed;right:20px;bottom:20px;z-index:2147483000;';
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });
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
      .value { font-size: 15px; font-weight: 800; color: #3c3c3c; }
      .flame { color: #ff9600; }
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
      @media (prefers-color-scheme: dark) {
        .pill, .card { background: #202f36; border-color: #37464f; }
        .value, .name, .stat b { color: #f1f7fb; }
        .stat { background: #131f24; }
        .bar { background: #37464f; }
        .status { color: #8fa6b2; }
        .btn.ghost { background: #202f36; }
      }
    </style>
    <div class="wrap">
      <div class="card" id="card">
        <div class="head">
          <div class="avatar">🦉</div>
          <div class="who">
            <div class="name" id="name">Duo Assist</div>
            <div class="sub" id="sub">Connecting…</div>
          </div>
        </div>
        <div class="stats">
          <div class="stat"><b id="s-streak">–</b><span>Streak</span></div>
          <div class="stat"><b id="s-xp">–</b><span>XP</span></div>
          <div class="stat"><b id="s-gems">–</b><span>Gems</span></div>
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
          <span class="value"><span class="flame" id="pill-streak">–</span> <span id="pill-state">idle</span></span>
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

  let state: UiState | null = null;

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
}
