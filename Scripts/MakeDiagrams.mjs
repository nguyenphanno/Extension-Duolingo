// Copyright github.com/nguyenphanno © 2026. All rights reserved
/**
 * MakeDiagrams.mjs — generates the README diagrams as standalone SVG.
 *
 * Hand-placing two dozen boxes in raw SVG is how diagrams end up misaligned, so
 * the layout is computed here instead: bands, rows and arrows are data, the
 * coordinates are arithmetic, and re-running the script reproduces byte-equal
 * output. No Mermaid, no external renderer — the SVGs display anywhere an
 * `<img>` does, including GitHub, VS Code and a plain browser.
 *
 *   docs/diagrams/architecture.svg    layered runtime architecture
 *   docs/diagrams/run-lifecycle.svg   one run, as a sequence diagram
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '..', 'docs', 'diagrams');

const UI = "'Segoe UI', system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif";
const MONO = "ui-monospace, 'Cascadia Mono', 'SF Mono', Menlo, Consolas, monospace";

const C = {
  ink: '#3c3c3c',
  muted: '#777777',
  faint: '#afafaf',
  line: '#e5e5e5',
  paper: '#ffffff',
  green: '#58cc02',
  greenInk: '#3f9400',
  greenTint: '#f1fce4',
  blue: '#1cb0f6',
  blueInk: '#0f83bd',
  blueTint: '#eaf8ff',
  gold: '#ffc800',
  goldInk: '#a67c00',
  goldTint: '#fff9e3',
  purple: '#ce82ff',
  purpleInk: '#8d4fbd',
  purpleTint: '#faf0ff',
  red: '#ff4b4b',
  redTint: '#fff0f0',
  slate: '#131f24',
  greyTint: '#f7f7f7',
};

const esc = (value) =>
  String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* ------------------------------------------------------------------ *
 * Primitives
 * ------------------------------------------------------------------ */

function text(x, y, content, { size = 13, weight = 600, fill = C.ink, anchor = 'start', family = UI, spacing, opacity } = {}) {
  const attrs = [
    `x="${x}"`,
    `y="${y}"`,
    `font-family="${family}"`,
    `font-size="${size}"`,
    `font-weight="${weight}"`,
    `fill="${fill}"`,
    `text-anchor="${anchor}"`,
  ];
  if (spacing) attrs.push(`letter-spacing="${spacing}"`);
  if (opacity) attrs.push(`opacity="${opacity}"`);
  return `<text ${attrs.join(' ')}>${esc(content)}</text>`;
}

function rect(x, y, w, h, { r = 12, fill = C.paper, stroke = C.line, sw = 2, dash } = {}) {
  const attrs = [
    `x="${x}"`,
    `y="${y}"`,
    `width="${w}"`,
    `height="${h}"`,
    `rx="${r}"`,
    `fill="${fill}"`,
    `stroke="${stroke}"`,
    `stroke-width="${sw}"`,
  ];
  if (dash) attrs.push(`stroke-dasharray="${dash}"`);
  return `<rect ${attrs.join(' ')}/>`;
}

function line(x1, y1, x2, y2, { stroke = C.line, sw = 2, dash, marker } = {}) {
  const attrs = [`x1="${x1}"`, `y1="${y1}"`, `x2="${x2}"`, `y2="${y2}"`, `stroke="${stroke}"`, `stroke-width="${sw}"`];
  if (dash) attrs.push(`stroke-dasharray="${dash}"`);
  if (marker) attrs.push(`marker-end="url(#${marker})"`);
  return `<line ${attrs.join(' ')}/>`;
}

function path(d, { stroke = C.line, sw = 2, dash, fill = 'none', marker } = {}) {
  const attrs = [`d="${d}"`, `fill="${fill}"`, `stroke="${stroke}"`, `stroke-width="${sw}"`, 'stroke-linecap="round"'];
  if (dash) attrs.push(`stroke-dasharray="${dash}"`);
  if (marker) attrs.push(`marker-end="url(#${marker})"`);
  return `<path ${attrs.join(' ')}/>`;
}

/** Vertical arrow between two bands, with an optional caption on the right. */
function flowArrow(x, y1, y2, label, tone = C.green) {
  const parts = [line(x, y1, x, y2 - 2, { stroke: tone, sw: 2.5, marker: 'arrow' })];
  if (label) parts.push(text(x + 12, y1 + (y2 - y1) / 2 + 4, label, { size: 10.5, weight: 700, fill: C.faint }));
  return parts.join('');
}

/** Small uppercase band caption with a coloured tick. */
function bandCaption(x, y, label, tone) {
  return [
    `<rect x="${x}" y="${y - 9}" width="4" height="12" rx="2" fill="${tone}"/>`,
    text(x + 12, y, label, { size: 10.5, weight: 800, fill: C.faint, spacing: '0.12em' }),
  ].join('');
}

/** A titled card. `sub` is an array of lines so wrapping stays deliberate. */
function card(x, y, w, h, { title, sub = [], tone = C.green, tint = C.paper, dash, titleSize = 14 }) {
  const parts = [
    rect(x, y, w, h, { fill: tint, stroke: dash ? tone : C.line, dash }),
    `<rect x="${x}" y="${y + 14}" width="4" height="${h - 28}" rx="2" fill="${tone}"/>`,
    text(x + 18, y + 30, title, { size: titleSize, weight: 800, fill: C.ink }),
  ];
  // Baselines are pulled up slightly and tightened so a 66px card can hold two
  // sub-lines without the descenders touching the bottom border.
  sub.forEach((entry, index) => {
    parts.push(text(x + 18, y + 46 + index * 13.5, entry, { size: 10.5, weight: 600, fill: C.muted }));
  });
  return parts.join('');
}

function chip(x, y, w, h, label, tone, tint) {
  return [
    rect(x, y, w, h, { r: 9, fill: tint, stroke: tone, sw: 1.5 }),
    text(x + w / 2, y + h / 2 + 4, label, { size: 11, weight: 800, fill: tone, anchor: 'middle' }),
  ].join('');
}

function svg({ width, height, title, children }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${esc(title)}">
<defs>
  <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
    <path d="M 0 0 L 10 5 L 0 10 z" fill="${C.green}"/>
  </marker>
  <marker id="arrowBlue" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
    <path d="M 0 0 L 10 5 L 0 10 z" fill="${C.blue}"/>
  </marker>
  <marker id="arrowGrey" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
    <path d="M 0 0 L 10 5 L 0 10 z" fill="${C.faint}"/>
  </marker>
  <filter id="lift" x="-20%" y="-20%" width="140%" height="140%">
    <feDropShadow dx="0" dy="3" stdDeviation="6" flood-color="#0f1720" flood-opacity="0.07"/>
  </filter>
</defs>
<rect width="${width}" height="${height}" fill="${C.paper}"/>
${children}
</svg>
`;
}

function header(title, subtitle, width) {
  return [
    `<circle cx="46" cy="46" r="11" fill="${C.green}"/>`,
    `<circle cx="46" cy="46" r="4.5" fill="${C.paper}"/>`,
    text(70, 52, title, { size: 25, weight: 900 }),
    text(70, 76, subtitle, { size: 12.5, weight: 600, fill: C.muted }),
    line(40, 96, width - 40, 96, { stroke: C.line, sw: 1.5 }),
  ].join('');
}

/* ------------------------------------------------------------------ *
 * 1. Architecture
 * ------------------------------------------------------------------ */

const W = 1240;
const PAD = 40;
const INNER = W - PAD * 2;

/** Evenly distribute `count` cards across the inner width. */
function row(count, gap) {
  const width = (INNER - gap * (count - 1)) / count;
  return { width, x: (index) => PAD + index * (width + gap) };
}

function buildArchitecture() {
  const parts = [header('Duo Assist — runtime architecture', 'Six layers, one direction of control. Every arrow is a real boundary in the code.', W)];

  // --- Surfaces -----------------------------------------------------
  let y = 128;
  parts.push(bandCaption(PAD, y + 10, 'SURFACES', C.green));
  const surfaces = row(4, 20);
  const surfaceCards = [
    { title: 'Popup', sub: ['384×600 dashboard', 'Home · Tasks · Log'] },
    { title: 'Options', sub: ['9 sections', 'Cmd+K palette · deep links'] },
    { title: 'Side panel', sub: ['Live console', 'Run timeline'] },
    { title: 'Content script', sub: ['Shadow-DOM pill', 'on duolingo.com'] },
  ];
  surfaceCards.forEach((cardData, index) => {
    parts.push(card(surfaces.x(index), y + 22, surfaces.width, 72, { ...cardData, tone: C.green, tint: C.greenTint }));
  });
  y += 22 + 72;

  // --- Transport ----------------------------------------------------
  y += 40;
  parts.push(flowArrow(W / 2, y - 38, y + 2, 'sendMessage · connect'));
  parts.push(bandCaption(PAD, y + 10, 'TRANSPORT', C.blue));
  const transport = row(3, 20);
  const transportCards = [
    { title: 'runtime.sendMessage', sub: ['Typed RPC — UiRequest → Result<T>', 'Errors travel as values, never throws'] },
    { title: "runtime.connect('duo.stream')", sub: ['Push channel, worker → UI', 'state · run · log · toast'] },
    { title: 'chrome.storage.local', sub: ['Settings · history · last summary', 'Rehydrated after a worker restart'] },
  ];
  transportCards.forEach((cardData, index) => {
    parts.push(card(transport.x(index), y + 22, transport.width, 66, { ...cardData, tone: C.blue, tint: C.blueTint, titleSize: 13 }));
  });
  y += 22 + 66;

  // --- Service worker -----------------------------------------------
  y += 40;
  parts.push(flowArrow(W / 2, y - 38, y + 2, 'route()'));
  parts.push(bandCaption(PAD, y + 10, 'SERVICE WORKER  ·  background/ServiceWorker.ts', C.purple));
  const worker = row(5, 16);
  const workerCards = [
    { title: 'MessageRouter', sub: ['Exhaustive switch', 'over UiRequest'] },
    { title: 'RunCoordinator', sub: ['One run at a time', 'Cooldown guard'] },
    { title: 'Scheduler', sub: ['chrome.alarms', 'Weekdays + quiet hours'] },
    { title: 'PortHub', sub: ['Broadcast to every', 'open surface'] },
    { title: 'NotificationService', sub: ['Desktop toasts', 'Toolbar badge text'] },
  ];
  workerCards.forEach((cardData, index) => {
    parts.push(card(worker.x(index), y + 22, worker.width, 78, { ...cardData, tone: C.purple, tint: C.purpleTint, titleSize: 13 }));
  });
  y += 22 + 78;

  // --- Automation core ----------------------------------------------
  y += 40;
  parts.push(flowArrow(W / 2, y - 38, y + 2, 'engine.run()'));
  parts.push(bandCaption(PAD, y + 10, 'AUTOMATION CORE', C.gold));
  const engineW = 372;
  const registryW = 236;
  const tasksW = INNER - engineW - registryW - 48;
  parts.push(card(PAD, y + 22, engineW, 104, {
    title: 'AutomationEngine',
    sub: ['Walks the plan, maps per-task progress', 'onto one overall value, emits RunSummary.', 'Owns the AbortSignal for instant cancel.'],
    tone: C.gold,
    tint: C.goldTint,
  }));
  parts.push(card(PAD + engineW + 24, y + 22, registryW, 104, {
    title: 'TaskRegistry',
    sub: ['Ordered plan, weights,', 'and the `only` filter', 'used by retries.'],
    tone: C.gold,
    tint: C.goldTint,
  }));

  const tasksX = PAD + engineW + 24 + registryW + 24;
  parts.push(rect(tasksX, y + 22, tasksW, 104, { fill: C.paper, stroke: C.line }));
  parts.push(text(tasksX + 16, y + 46, 'Tasks · one file each', { size: 12, weight: 800, fill: C.ink }));
  const chipW = (tasksW - 32 - 16) / 3;
  ['Practice', 'Rewards', 'Badges', 'Freeze', 'Boost', 'Super'].forEach((label, index) => {
    const col = index % 3;
    const rowIndex = Math.floor(index / 3);
    parts.push(chip(tasksX + 16 + col * (chipW + 8), y + 58 + rowIndex * 30, chipW, 24, label, C.goldInk, C.goldTint));
  });
  y += 22 + 104;

  // --- Platform core ------------------------------------------------
  y += 40;
  parts.push(flowArrow(W / 2, y - 38, y + 2, 'token · http · storage'));
  parts.push(bandCaption(PAD, y + 10, 'PLATFORM CORE', C.blue));
  const platform = row(3, 20);
  const platformCards = [
    { title: 'TokenProvider + Jwt', sub: ['Reads the jwt_token cookie', 'or a manually pasted JWT'] },
    { title: 'HttpClient', sub: ['Timeout · retry with jitter', 'Retry-After · min write gap'] },
    { title: 'Repositories', sub: ['Settings (clamped) · History', 'bounded to the last 200 runs'] },
  ];
  platformCards.forEach((cardData, index) => {
    parts.push(card(platform.x(index), y + 22, platform.width, 66, { ...cardData, tone: C.blue, tint: C.blueTint, titleSize: 13 }));
  });
  y += 22 + 66;

  // --- External -----------------------------------------------------
  y += 40;
  parts.push(flowArrow(W / 2, y - 38, y + 2, 'HTTPS'));
  parts.push(bandCaption(PAD, y + 10, 'EXTERNAL', C.red));
  const external = row(3, 20);
  parts.push(card(external.x(0), y + 22, external.width, 66, {
    title: 'duolingo.com API',
    sub: ['sessions · rewards · goals · profile', 'Host permission only'],
    tone: C.green,
    tint: C.greenTint,
    titleSize: 13,
  }));
  parts.push(card(external.x(1), y + 22, external.width, 66, {
    title: 'api.duolingopro.net',
    sub: ['Badges · Super · XP boost', 'Opt-in twice, dashed on purpose'],
    tone: C.red,
    tint: C.redTint,
    titleSize: 13,
    dash: '6 4',
  }));
  parts.push(card(external.x(2), y + 22, external.width, 66, {
    title: 'chrome.* APIs',
    sub: ['alarms · cookies · storage', 'sidePanel · contextMenus · commands'],
    tone: C.purple,
    tint: C.purpleTint,
    titleSize: 13,
  }));
  y += 22 + 66;

  const height = y + 56;
  parts.push(line(40, height - 34, W - 40, height - 34, { stroke: C.line, sw: 1.5 }));
  parts.push(text(PAD, height - 14, 'Control flows down; state flows back up through the port. Nothing below the worker imports anything above it.', { size: 11, weight: 600, fill: C.faint }));

  return svg({ width: W, height, title: 'Duo Assist runtime architecture', children: parts.join('\n') });
}

/* ------------------------------------------------------------------ *
 * 2. Run lifecycle
 * ------------------------------------------------------------------ */

function buildLifecycle() {
  const W2 = 1240;
  const parts = [header('One run, end to end', 'What happens between clicking Run and the summary landing in history.', W2)];

  const participants = [
    { name: 'Trigger', sub: 'button · alarm · command' },
    { name: 'RunCoordinator', sub: 'background' },
    { name: 'AutomationEngine', sub: 'core/automation' },
    { name: 'Task ×N', sub: 'practice · rewards · …' },
    { name: 'DuolingoApi', sub: 'HTTPS' },
    { name: 'UI (port)', sub: 'popup · panel' },
  ];

  const span = (W2 - PAD * 2) / participants.length;
  const centers = participants.map((_, index) => PAD + span * (index + 0.5));

  const topY = 118;
  const boxH = 54;
  const lifeTop = topY + boxH;
  const steps = [
    { from: 0, to: 1, label: 'run/start (trigger)', tone: C.green },
    { self: 1, label: 'single-run + cooldown check' },
    { from: 1, to: 2, label: 'new AutomationEngine(token, settings)', tone: C.green },
    { from: 2, to: 4, label: 'GET /users/{id} → profile', tone: C.blue, marker: 'arrowBlue' },
    { from: 2, to: 5, label: 'phase: preparing', tone: C.faint, marker: 'arrowGrey', dash: '5 4' },
    { from: 2, to: 3, label: 'task.run(ctx)', tone: C.green },
    { from: 3, to: 4, label: 'POST /sessions · PUT /sessions/{id}', tone: C.blue, marker: 'arrowBlue' },
    { from: 3, to: 2, label: 'TaskOutcome(metrics)', tone: C.green },
    { from: 2, to: 5, label: 'progress + log lines', tone: C.faint, marker: 'arrowGrey', dash: '5 4' },
    { from: 2, to: 4, label: 'GET profile (after)', tone: C.blue, marker: 'arrowBlue' },
    { from: 2, to: 1, label: 'RunSummary', tone: C.green },
    { from: 1, to: 5, label: 'phase: done · history + notification', tone: C.faint, marker: 'arrowGrey', dash: '5 4' },
  ];

  const rowH = 46;
  const firstY = lifeTop + 62;
  const lastY = firstY + (steps.length - 1) * rowH;

  // Lifelines first so arrows sit on top.
  centers.forEach((cx) => {
    parts.push(line(cx, lifeTop, cx, lastY + 34, { stroke: C.line, sw: 1.5, dash: '4 5' }));
  });

  participants.forEach((participant, index) => {
    const cx = centers[index];
    parts.push(rect(cx - span / 2 + 12, topY, span - 24, boxH, { r: 11, fill: C.greyTint, stroke: C.line }));
    parts.push(text(cx, topY + 24, participant.name, { size: 13, weight: 800, anchor: 'middle' }));
    parts.push(text(cx, topY + 41, participant.sub, { size: 10, weight: 600, fill: C.faint, anchor: 'middle', family: MONO }));
  });

  steps.forEach((step, index) => {
    const y = firstY + index * rowH;
    const marker = step.marker ?? 'arrow';
    const dash = step.dash;

    // Step number badge, left of the diagram.
    parts.push(`<circle cx="${PAD - 6}" cy="${y - 4}" r="10" fill="${C.greyTint}" stroke="${C.line}"/>`);
    parts.push(text(PAD - 6, y, String(index + 1), { size: 9.5, weight: 800, fill: C.muted, anchor: 'middle' }));

    if (step.self !== undefined) {
      const cx = centers[step.self];
      const loop = 22;
      parts.push(path(`M ${cx} ${y} L ${cx + loop} ${y} L ${cx + loop} ${y + 16} L ${cx + 2} ${y + 16}`, {
        stroke: C.muted,
        sw: 1.8,
        marker: 'arrowGrey',
      }));
      parts.push(text(cx + loop + 10, y + 6, step.label, { size: 10.5, weight: 700, fill: C.muted }));
      return;
    }

    const x1 = centers[step.from];
    const x2 = centers[step.to];
    const direction = x2 > x1 ? 1 : -1;
    const start = x1 + direction * 4;
    const end = x2 - direction * 6;

    parts.push(line(start, y, end, y, { stroke: step.tone, sw: 2, dash, marker }));

    const midX = (x1 + x2) / 2;
    const labelY = y - 8;
    // A soft plate keeps the label readable when it crosses a lifeline.
    const labelWidth = step.label.length * 5.6 + 14;
    parts.push(rect(midX - labelWidth / 2, labelY - 11, labelWidth, 16, { r: 5, fill: C.paper, stroke: 'none', sw: 0 }));
    parts.push(text(midX, labelY, step.label, { size: 10.5, weight: 700, fill: step.tone === C.faint ? C.faint : C.ink, anchor: 'middle' }));
  });

  const height = lastY + 90;
  parts.push(line(40, height - 40, W2 - 40, height - 40, { stroke: C.line, sw: 1.5 }));
  parts.push(text(PAD, height - 20, 'Dashed grey arrows are one-way pushes to the UI. Green is control, blue is network — no arrow ever points back up the control path.', { size: 11, weight: 600, fill: C.faint }));

  return svg({ width: W2, height, title: 'Duo Assist run lifecycle', children: parts.join('\n') });
}

/* ------------------------------------------------------------------ *
 * 3. Project structure
 * ------------------------------------------------------------------ */

/** Layer colours, reused from the architecture diagram. */
const LAYER = {
  root: C.slate,
  build: C.faint,
  asset: C.goldInk,
  shared: C.blue,
  core: C.goldInk,
  worker: C.purple,
  ui: C.green,
  apps: C.greenInk,
  out: C.faint,
};

const TREE = [
  { depth: 0, name: 'Extension-Duolingo/', desc: 'Manifest V3 extension — no backend, no build server', tone: LAYER.root, dir: true },
  { depth: 1, name: 'Scripts/', desc: 'Build-time tooling, all plain Node', tone: LAYER.build, dir: true },
  { depth: 2, name: 'Build.mjs', desc: 'esbuild → dist/ · 6 IIFE entries, one CSS bundle each', tone: LAYER.build },
  { depth: 2, name: 'MakeIcons.mjs', desc: 'PNG decode → crop → resample → 16/32/48/128', tone: LAYER.build },
  { depth: 2, name: 'MakeDiagrams.mjs', desc: 'Generates the three SVGs on this page', tone: LAYER.build },

  { depth: 1, name: 'public/', desc: 'Static assets copied verbatim into dist/', tone: LAYER.asset, dir: true },
  { depth: 2, name: 'icon-source.png', desc: 'Artwork master — replace this, then `npm run icons`', tone: LAYER.asset },
  { depth: 2, name: 'icons/', desc: 'Generated icon set', tone: LAYER.asset, dir: true },

  { depth: 1, name: 'src/', desc: 'All TypeScript source', tone: LAYER.shared, dir: true },
  { depth: 2, name: 'Manifest/', desc: 'Manifest.json — version injected from package.json', tone: LAYER.shared, dir: true },

  { depth: 2, name: 'Shared/', desc: 'Dependency-free layer: imports nothing from Core, Ui or Background', tone: LAYER.shared, dir: true },
  { depth: 3, name: 'Types.ts', desc: 'Every shape that crosses a boundary', tone: LAYER.shared },
  { depth: 3, name: 'Protocol.ts', desc: 'UiRequest union · StreamEvent · UiState', tone: LAYER.shared },
  { depth: 3, name: 'Result.ts', desc: 'Result<T> + AppError — errors as values', tone: LAYER.shared },
  { depth: 3, name: 'Constants.ts', desc: 'Endpoints, storage keys, hard limits', tone: LAYER.shared },
  { depth: 3, name: 'Presets.ts', desc: 'Quick / Balanced / Max / Rewards run shapes', tone: LAYER.shared },
  { depth: 3, name: 'Logger.ts', desc: 'Observable log with a bounded ring buffer', tone: LAYER.shared },
  { depth: 3, name: 'Utils/', desc: 'Time · Format · Id · Forecast · Achievements', tone: LAYER.shared, dir: true },
  { depth: 3, name: 'Bridge/', desc: 'ExtensionBridge (chrome.*) or MockData (preview)', tone: LAYER.shared, dir: true },

  { depth: 2, name: 'Core/', desc: 'Pure domain logic — no chrome.* imports, fully testable', tone: LAYER.core, dir: true },
  { depth: 3, name: 'Auth/', desc: 'Jwt claims · TokenProvider (cookie or manual)', tone: LAYER.core, dir: true },
  { depth: 3, name: 'Http/', desc: 'HttpClient · Endpoints · DuolingoApi · ProApi', tone: LAYER.core, dir: true },
  { depth: 3, name: 'Storage/', desc: 'Settings (clamped) · History (bounded 200)', tone: LAYER.core, dir: true },
  { depth: 3, name: 'Automation/', desc: 'Engine · Task · TaskRegistry · Tasks/ (6 files)', tone: LAYER.core, dir: true },

  { depth: 2, name: 'Background/', desc: 'The service worker and its collaborators', tone: LAYER.worker, dir: true },
  { depth: 3, name: 'ServiceWorker.ts', desc: 'Entry point — wires every chrome listener', tone: LAYER.worker },
  { depth: 3, name: 'AppContext.ts', desc: 'Shared state + rehydrate after suspension', tone: LAYER.worker },
  { depth: 3, name: 'RunCoordinator.ts', desc: 'Single-run invariant + cooldown', tone: LAYER.worker },
  { depth: 3, name: 'MessageRouter.ts', desc: 'Exhaustive RPC switch', tone: LAYER.worker },
  { depth: 3, name: 'Scheduler.ts', desc: 'alarms · weekdays · quiet hours', tone: LAYER.worker },
  { depth: 3, name: 'PortHub.ts', desc: 'Fan-out to every open surface', tone: LAYER.worker },
  { depth: 3, name: 'NotificationService.ts', desc: 'Toasts + toolbar badge', tone: LAYER.worker },

  { depth: 2, name: 'Content/', desc: 'Shadow-DOM pill injected into duolingo.com', tone: LAYER.ui, dir: true },
  { depth: 2, name: 'Ui/', desc: 'Design system — tokens, icons, primitives, hooks', tone: LAYER.ui, dir: true },
  { depth: 3, name: 'Tokens/Tokens.css', desc: 'Duolingo palette, type scale, push depth', tone: LAYER.ui },
  { depth: 3, name: 'Icons/Icons.tsx', desc: '~35 hand-built 24px icons', tone: LAYER.ui },
  { depth: 3, name: 'Components/', desc: 'Button · Card · Controls · Display · Insights · Heatmap · Palette', tone: LAYER.ui, dir: true },
  { depth: 3, name: 'Hooks/', desc: 'UseAppState · UseTheme · UseLocale', tone: LAYER.ui, dir: true },

  { depth: 2, name: 'Apps/', desc: 'Four surfaces, each an entry point', tone: LAYER.apps, dir: true },
  { depth: 3, name: 'Popup/', desc: '384×600 · Home / Tasks / Log', tone: LAYER.apps, dir: true },
  { depth: 3, name: 'Options/', desc: '9 sections · Cmd+K palette · deep links', tone: LAYER.apps, dir: true },
  { depth: 3, name: 'SidePanel/', desc: 'Live console + run timeline', tone: LAYER.apps, dir: true },
  { depth: 3, name: 'Preview/', desc: 'Standalone showcase — not referenced by the manifest', tone: LAYER.apps, dir: true },

  { depth: 1, name: 'docs/', desc: 'Screenshots and generated diagrams', tone: LAYER.out, dir: true },
  { depth: 1, name: 'dist/', desc: 'Build output — load unpacked from here', tone: LAYER.out, dir: true },
];

function buildStructure() {
  const W3 = 1240;
  const parts = [header('Project structure', 'Split by responsibility, not by file type. The arrow of imports only ever points down.', W3)];

  const startY = 130;
  const rowH = 27;
  const indent = 26;
  const descX = 560;
  const stack = [];

  TREE.forEach((node, index) => {
    const y = startY + index * rowH;
    const x = PAD + node.depth * indent;

    if (node.depth > 0) {
      const parentY = stack[node.depth - 1] ?? y - rowH;
      const railX = x - 13;
      parts.push(line(railX, parentY + 9, railX, y, { stroke: C.line, sw: 1.5 }));
      parts.push(line(railX, y, x - 7, y, { stroke: C.line, sw: 1.5 }));
    }
    stack[node.depth] = y;
    stack.length = node.depth + 1;

    if (node.dir) {
      parts.push(`<rect x="${x - 4}" y="${y - 6}" width="9" height="9" rx="2.5" fill="${node.tone}"/>`);
    } else {
      parts.push(`<circle cx="${x + 0.5}" cy="${y - 1.5}" r="3.2" fill="${C.paper}" stroke="${node.tone}" stroke-width="2"/>`);
    }

    parts.push(text(x + 14, y + 1, node.name, { size: 12, weight: node.depth <= 1 ? 800 : 700, family: MONO, fill: node.depth <= 1 ? C.ink : C.ink }));
    parts.push(text(descX, y + 1, node.desc, { size: 11, weight: 600, fill: C.muted }));
  });

  const height = startY + TREE.length * rowH + 52;
  parts.push(line(40, height - 36, W3 - 40, height - 36, { stroke: C.line, sw: 1.5 }));
  parts.push(text(PAD, height - 15, 'Naming rule: every source file is PascalCase (ServiceWorker.ts, PracticeTask.ts). Only tool-owned config keeps its own name.', { size: 11, weight: 600, fill: C.faint }));

  return svg({ width: W3, height, title: 'Duo Assist project structure', children: parts.join('\n') });
}

/* ------------------------------------------------------------------ *
 * Entry
 * ------------------------------------------------------------------ */

mkdirSync(OUT, { recursive: true });

const outputs = [
  ['architecture.svg', buildArchitecture()],
  ['run-lifecycle.svg', buildLifecycle()],
  ['project-structure.svg', buildStructure()],
];

for (const [name, content] of outputs) {
  writeFileSync(join(OUT, name), content);
  console.log(`[diagrams] ${name} — ${(content.length / 1024).toFixed(1)} kB`);
}
