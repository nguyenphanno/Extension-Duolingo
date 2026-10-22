/**
 * Options.tsx — the full settings surface.
 *
 * Every control writes through `patchSettings`, which round-trips to the
 * service worker and re-renders from the authoritative state. No local form
 * state to drift out of sync.
 */
import { useEffect, useMemo, useState } from 'react';
import { formatCompact, formatNumber } from '@Shared/Utils/Format';
import { dayKey, formatDuration, formatRelative } from '@Shared/Utils/Time';
import { achievementSummary, computeAchievements } from '@Shared/Utils/Achievements';
import { forecastFromProfile } from '@Shared/Utils/Forecast';
import type { Locale, RunSummary, TaskKey, ThemePreference } from '@Shared/Types';
import { bridge } from '@Shared/Bridge/ExtensionBridge';
import { useAppState } from '@Ui/Hooks/UseAppState';
import { useTheme } from '@Ui/Hooks/UseTheme';
import { useLocale } from '@Ui/Hooks/UseLocale';
import { BrandMark } from '@Ui/Components/BrandMark';
import { Button, IconButton } from '@Ui/Components/Button';
import { Card, CardHeader } from '@Ui/Components/Card';
import { CommandPalette, type PaletteAction } from '@Ui/Components/CommandPalette';
import { Field, Segmented, Select, Stepper, Toggle } from '@Ui/Components/Controls';
import { Bars, Divider, EmptyState, Pill, ProgressBar, Stat } from '@Ui/Components/Display';
import { Heatmap } from '@Ui/Components/Heatmap';
import { AchievementGrid, StreakForecastStrip } from '@Ui/Components/Insights';
import { LogConsole } from '@Ui/Components/LogConsole';
import { ToastStack } from '@Ui/Components/Toast';
import {
  AlertIcon,
  BoltIcon,
  CalendarIcon,
  ChartIcon,
  CheckIcon,
  ChevronRightIcon,
  ClockIcon,
  CopyIcon,
  DownloadIcon,
  ExternalIcon,
  FlameIcon,
  GemIcon,
  GlobeIcon,
  HeartIcon,
  HistoryIcon,
  KeyIcon,
  LinkIcon,
  MoonIcon,
  OwlIcon,
  PlayIcon,
  RefreshIcon,
  RocketIcon,
  ShieldIcon,
  SlidersIcon,
  SparkleIcon,
  SunIcon,
  TargetIcon,
  TrashIcon,
  TrophyIcon,
  UploadIcon,
} from '@Ui/Icons/Icons';
import { modKey } from '@Ui/Utils/Platform';
import './Options.css';

type Section =
  | 'account'
  | 'practice'
  | 'activity'
  | 'rewards'
  | 'schedule'
  | 'safety'
  | 'appearance'
  | 'data'
  | 'about';

const NAV: Array<{ id: Section; label: string; icon: JSX.Element }> = [
  { id: 'account', label: 'Account', icon: <KeyIcon size={17} /> },
  { id: 'practice', label: 'Practice', icon: <BoltIcon size={17} /> },
  { id: 'activity', label: 'Activity', icon: <ChartIcon size={17} /> },
  { id: 'rewards', label: 'Rewards & badges', icon: <TrophyIcon size={17} /> },
  { id: 'schedule', label: 'Schedule', icon: <CalendarIcon size={17} /> },
  { id: 'safety', label: 'Safety & PRO', icon: <ShieldIcon size={17} /> },
  { id: 'appearance', label: 'Appearance', icon: <SparkleIcon size={17} /> },
  { id: 'data', label: 'Data', icon: <DownloadIcon size={17} /> },
  { id: 'about', label: 'About', icon: <OwlIcon size={17} /> },
];

/** Section ids are deep-linkable: `Options.html?section=activity`. */
function sectionFromLocation(): Section {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('section') ?? window.location.hash.replace(/^#/, '');
  const match = NAV.find((item) => item.id === raw);
  return match ? match.id : 'account';
}

function rememberSection(id: Section): void {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('section', id);
    window.history.replaceState(null, '', url.toString());
  } catch {
    /* file:// and sandboxed contexts may refuse — deep links are a bonus */
  }
}

function exportHistory(runs: RunSummary[]): void {
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), runs }, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `duo-assist-history-${dayKey(Date.now())}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function RunRow({ run, onRetry }: { run: RunSummary; onRetry?: (only: TaskKey[]) => void }) {
  const [open, setOpen] = useState(false);
  const failed = run.tasks.filter((task) => task.status === 'failed').length;
  const status = run.error ? 'failed' : failed > 0 ? 'warn' : 'ok';
  const retryable = [...new Set(run.tasks.filter((task) => task.status === 'failed').map((task) => task.task))];

  return (
    <li className={`run-row run-row--${status}`}>
      <button type="button" className="run-row__head" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span className="run-row__dot" />
        <span className="run-row__when">
          <b>{formatRelative(run.startedAt)}</b>
          <em>{run.trigger}{run.dryRun ? ' · dry' : ''}</em>
        </span>
        <span className="run-row__nums">
          <b>+{run.xpGained}</b> XP
          <em>{run.rewardsClaimed} rewards · {run.gemsClaimed} gems</em>
        </span>
        <span className="run-row__time">{formatDuration(run.finishedAt - run.startedAt)}</span>
        <ChevronRightIcon size={14} className={open ? 'is-open' : ''} />
      </button>
      {open ? (
        <div className="run-row__detail">
          {run.tasks.map((task) => (
            <div key={`${task.task}-${task.startedAt}`} className={`run-task run-task--${task.status}`}>
              <span>{task.label}</span>
              <em>{task.headline}</em>
            </div>
          ))}
          {run.error ? <div className="run-task run-task--failed"><span>Error</span><em>{run.error}</em></div> : null}
          {onRetry && retryable.length > 0 ? (
            <div className="run-row__retry">
              <span>
                Retry only the {retryable.length} failed task{retryable.length === 1 ? '' : 's'}
              </span>
              <Button size="sm" variant="secondary" icon={<RefreshIcon size={14} />} onClick={() => onRetry(retryable)}>
                Retry
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

function WeekdayPicker({ value, onChange }: { value: number[]; onChange: (next: number[]) => void }) {
  const toggle = (day: number) => {
    const next = value.includes(day) ? value.filter((item) => item !== day) : [...value, day].sort((a, b) => a - b);
    onChange(next);
  };
  return (
    <div className="weekdays">
      <div className="weekdays__head">
        <span className="weekdays__label">Active days</span>
        <button type="button" className="weekdays__preset" onClick={() => onChange([1, 2, 3, 4, 5])}>
          Weekdays
        </button>
        <button type="button" className="weekdays__preset" onClick={() => onChange([0, 1, 2, 3, 4, 5, 6])}>
          All
        </button>
      </div>
      <div className="weekdays__row">
        {WEEKDAYS.map((label, day) => (
          <button
            key={label}
            type="button"
            className={`weekdays__day${value.includes(day) ? ' is-on' : ''}`}
            aria-pressed={value.includes(day)}
            onClick={() => toggle(day)}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="hint">{value.length === 0 ? 'Nothing selected — the scheduler will never fire.' : `${value.length} day(s) active`}</p>
    </div>
  );
}

export function Options() {
  const app = useAppState();
  const [section, setSection] = useState<Section>(sectionFromLocation);
  const [tokenDraft, setTokenDraft] = useState('');
  const [importDraft, setImportDraft] = useState('');
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useTheme(app.state?.settings.ui.theme);
  useLocale(app.state?.settings.ui.locale);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((value) => !value);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (section !== 'activity' && section !== 'data') return;
    void bridge.send<RunSummary[]>({ type: 'history/list' }).then((result) => {
      if (result.ok) setRuns(result.value);
    });
  }, [section]);

  const heatCells = useMemo(() => {
    const totals = new Map<string, number>();
    for (const run of runs) {
      const key = dayKey(run.startedAt);
      totals.set(key, (totals.get(key) ?? 0) + run.xpGained);
    }
    return [...totals].map(([day, xp]) => ({ day, xp }));
  }, [runs]);

  const heatFacts = useMemo(() => {
    const active = heatCells.filter((cell) => cell.xp > 0);
    const total = heatCells.reduce((sum, cell) => sum + cell.xp, 0);
    const best = active.reduce((max, cell) => Math.max(max, cell.xp), 0);
    return {
      activeDays: active.length,
      best,
      average: active.length === 0 ? 0 : Math.round(total / active.length),
    };
  }, [heatCells]);

  const forecast = useMemo(() => {
    const snapshot = app.state;
    if (!snapshot) return null;
    const todayXp = snapshot.stats.daily[snapshot.stats.daily.length - 1]?.xp ?? 0;
    return forecastFromProfile(snapshot.profile, todayXp, snapshot.settings.practice.dailyXpGoal);
  }, [app.state]);

  const achievements = useMemo(() => {
    const snapshot = app.state;
    if (!snapshot) return [];
    return computeAchievements({ stats: snapshot.stats, profile: snapshot.profile, settings: snapshot.settings });
  }, [app.state]);

  if (!app.state) {
    return (
      <div className="options options--loading">
        <div className="options__side" />
        <div className="options__main">Loading…</div>
      </div>
    );
  }

  const { state } = app;
  const s = state.settings;
  const patch = app.patchSettings;
  const badgeCount = achievementSummary(achievements);

  const go = (id: Section) => {
    setSection(id);
    rememberSection(id);
  };

  const paletteActions: PaletteAction[] = [
    ...NAV.map((item) => ({
      id: `nav-${item.id}`,
      label: item.label,
      hint: `Jump to the ${item.label.toLowerCase()} section`,
      group: 'Navigate',
      icon: item.icon,
      keywords: 'go open page tab',
      run: () => go(item.id),
    })),
    {
      id: 'run-now',
      label: 'Run automation now',
      hint: 'Execute the full enabled plan',
      group: 'Run',
      icon: <PlayIcon size={15} />,
      keywords: 'start execute begin',
      trailing: s.behavior.dryRun ? 'dry' : 'live',
      run: () => void app.startRun(),
    },
    {
      id: 'run-dry',
      label: s.behavior.dryRun ? 'Turn dry run off' : 'Turn dry run on',
      hint: 'Simulate without touching the account',
      group: 'Run',
      icon: <ShieldIcon size={15} />,
      keywords: 'simulate preview safety',
      trailing: s.behavior.dryRun ? 'on' : 'off',
      run: () => void patch((draft) => void (draft.behavior.dryRun = !draft.behavior.dryRun)),
    },
    {
      id: 'refresh',
      label: 'Refresh profile',
      hint: 'Re-read the account from Duolingo',
      group: 'Run',
      icon: <RefreshIcon size={15} />,
      keywords: 'sync reload',
      run: () => void app.refreshProfile(),
    },
    {
      id: 'retry-failed',
      label: 'Retry failed tasks',
      hint: 'Re-run only what failed in the last run',
      group: 'Run',
      icon: <RefreshIcon size={15} />,
      keywords: 'again fix',
      run: () => {
        const failed = [...new Set((state.lastSummary?.tasks ?? []).filter((task) => task.status === 'failed').map((task) => task.task))];
        if (failed.length === 0) {
          app.toast('info', 'Nothing failed in the last run.');
          return;
        }
        void app.startRun(failed);
      },
    },
    {
      id: 'theme-dark',
      label: s.ui.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
      hint: 'Toggle the interface theme',
      group: 'Appearance',
      icon: s.ui.theme === 'dark' ? <SunIcon size={15} /> : <MoonIcon size={15} />,
      keywords: 'night mode colors',
      run: () => void patch((draft) => void (draft.ui.theme = draft.ui.theme === 'dark' ? 'light' : 'dark')),
    },
    {
      id: 'locale',
      label: s.ui.locale === 'vi' ? 'Switch to English' : 'Chuyển sang Tiếng Việt',
      hint: 'Change number and date formatting',
      group: 'Appearance',
      icon: <GlobeIcon size={15} />,
      keywords: 'language locale ngon ngu',
      trailing: s.ui.locale,
      run: () => void patch((draft) => void (draft.ui.locale = draft.ui.locale === 'vi' ? 'en' : 'vi')),
    },
    {
      id: 'export-history',
      label: 'Export run history',
      hint: 'Download every stored run as JSON',
      group: 'Data',
      icon: <DownloadIcon size={15} />,
      keywords: 'backup save json',
      run: async () => {
        const result = await bridge.send<RunSummary[]>({ type: 'history/list' });
        if (result.ok) exportHistory(result.value);
      },
    },
    {
      id: 'copy-settings',
      label: 'Copy settings JSON',
      hint: 'Clipboard backup of the current configuration',
      group: 'Data',
      icon: <CopyIcon size={15} />,
      keywords: 'backup clipboard export',
      run: async () => {
        const result = await bridge.send<{ json: string }>({ type: 'settings/export' });
        if (!result.ok) return;
        await navigator.clipboard?.writeText(result.value.json).catch(() => undefined);
        app.toast('success', 'Settings JSON copied');
      },
    },
    {
      id: 'clear-history',
      label: 'Clear run history',
      hint: 'Removes every stored run — cannot be undone',
      group: 'Data',
      icon: <TrashIcon size={15} />,
      keywords: 'delete wipe reset',
      run: () => void app.clearHistory(),
    },
    {
      id: 'reset',
      label: 'Reset all settings',
      hint: 'Back to factory defaults',
      group: 'Data',
      icon: <AlertIcon size={15} />,
      keywords: 'factory defaults restore',
      run: () => void app.resetSettings(),
    },
    {
      id: 'panel',
      label: 'Open side panel',
      hint: 'Live console alongside any tab',
      group: 'Navigate',
      icon: <ChartIcon size={15} />,
      keywords: 'console live dock',
      run: () => void bridge.send({ type: 'panel/open' }),
    },
  ];

  return (
    <div className="options">
      <aside className="options__side">
        <div className="side__brand">
          <BrandMark size={38} />
          <div>
            <strong>Duo Assist</strong>
            <span>v{state.version}</span>
          </div>
        </div>

        <nav className="side__nav">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`side__link${section === item.id ? ' is-active' : ''}`}
              onClick={() => go(item.id)}
            >
              {item.icon}
              <span>{item.label}</span>
              <ChevronRightIcon size={14} className="side__chev" />
            </button>
          ))}
        </nav>

        <div className="side__status">
          <div className="side__status-row">
            <span className={`dot${s.schedule.enabled ? ' is-on' : ''}`} />
            <span>{s.schedule.enabled ? `Every ${s.schedule.intervalMinutes}m` : 'Scheduler off'}</span>
          </div>
          <div className="side__status-row">
            <FlameIcon size={14} />
            <span>{state.profile?.streak ?? 0} day streak</span>
          </div>
          <ProgressBar value={state.stats.successRate / 100} height={8} tone="green" />
          <span className="side__hint">{state.stats.successRate}% of runs clean</span>
        </div>
      </aside>

      <main className="options__main">
        <header className="hero">
          <div className="hero__left">
            <span className="hero__avatar">{state.profile?.displayName?.charAt(0).toUpperCase() ?? '?'}</span>
            <div>
              <h1>{state.profile ? `@${state.profile.username}` : 'Connect your account'}</h1>
              <p>
                {state.token.valid
                  ? `Session ${state.token.source} · ${state.token.daysLeft ? `${Math.floor(state.token.daysLeft)} days left` : 'no expiry'}`
                  : state.token.message}
              </p>
            </div>
          </div>
          <div className="hero__stats">
            <Stat icon={<BoltIcon size={15} />} value={formatCompact(state.profile?.totalXp ?? 0)} label="XP" tone="gold" compact />
            <Stat icon={<GemIcon size={15} />} value={formatCompact(state.profile?.gems ?? 0)} label="Gems" tone="blue" compact />
            <Stat icon={<HeartIcon size={15} />} value={state.profile?.hearts ?? 5} label="Hearts" tone="red" compact />
            <Stat icon={<FlameIcon size={15} />} value={state.profile?.streak ?? 0} label="Streak" tone="orange" compact />
          </div>
          <div className="hero__actions">
            <button type="button" className="hero__palette" onClick={() => setPaletteOpen(true)}>
              <span>Search actions</span>
              <kbd>{modKey()}</kbd>
              <kbd>K</kbd>
            </button>
            <Button size="sm" variant="secondary" icon={<RefreshIcon size={15} />} onClick={() => void app.refreshProfile()}>
              Refresh
            </Button>
            <Button size="sm" icon={<PlayIcon size={15} />} onClick={() => void app.startRun()}>
              Run now
            </Button>
          </div>
        </header>

        {section === 'account' ? (
          <div className="stack">
            <Card>
              <CardHeader
                title="Session source"
                subtitle="Where the Duolingo token comes from"
                icon={<KeyIcon size={18} />}
                action={<Pill tone={state.token.valid ? 'green' : 'red'}>{state.token.valid ? 'Live' : 'Missing'}</Pill>}
              />
              <Segmented
                label="Token source"
                value={s.tokenSource}
                onChange={(value) => void patch((draft) => void (draft.tokenSource = value))}
                options={[
                  { value: 'cookie', label: 'Browser cookie' },
                  { value: 'manual', label: 'Manual token' },
                ]}
              />
              <p className="hint">
                Browser cookie reads <code>jwt_token</code> from duolingo.com automatically — nothing is stored. Manual mode
                keeps a token you paste yourself.
              </p>
              <Divider />
              <Field
                label="Manual JWT"
                mono
                type="password"
                placeholder="eyJhbGciOi…"
                value={tokenDraft}
                onChange={setTokenDraft}
                hint="Stored locally in chrome.storage. Treat it like a password."
                action={
                  <Button size="sm" variant="secondary" onClick={() => void app.setToken(tokenDraft).then((ok) => ok && setTokenDraft(''))}>
                    Save
                  </Button>
                }
              />
              <div className="token-state">
                <span className={`dot${state.token.valid ? ' is-on' : ''}`} />
                <span>{state.token.message}</span>
                {state.token.expiresAt ? <span className="u-faint">expires {formatRelative(state.token.expiresAt)}</span> : null}
              </div>
            </Card>

            <Card>
              <CardHeader title="Profile cache" subtitle="Last known account state" icon={<HistoryIcon size={18} />} />
              <div className="kv">
                <div>
                  <span>Username</span>
                  <b>{state.profile?.username ?? '—'}</b>
                </div>
                <div>
                  <span>Course</span>
                  <b>
                    {state.profile ? `${state.profile.learningLanguage.toUpperCase()} ← ${state.profile.fromLanguage.toUpperCase()}` : '—'}
                  </b>
                </div>
                <div>
                  <span>Fetched</span>
                  <b>{state.profile ? formatRelative(state.profile.fetchedAt) : '—'}</b>
                </div>
                <div>
                  <span>Streak freezes</span>
                  <b>{state.profile?.streakFreezes ?? 0}/2</b>
                </div>
              </div>
            </Card>
          </div>
        ) : null}

        {section === 'practice' ? (
          <div className="stack">
            <Card>
              <CardHeader
                title="Practice sessions"
                subtitle="Open and complete lessons to earn XP"
                icon={<BoltIcon size={18} />}
                action={
                  <Toggle
                    label=""
                    checked={s.practice.enabled}
                    onChange={(next) => void patch((draft) => void (draft.practice.enabled = next))}
                  />
                }
              />
              <Stepper
                label="Sessions per run"
                hint="0 disables practice entirely"
                value={s.practice.sessions}
                min={0}
                max={30}
                onChange={(next) => void patch((draft) => void (draft.practice.sessions = next))}
              />
              <Stepper
                label="Shortest lesson"
                suffix="s"
                value={s.practice.minDurationSec}
                min={20}
                max={300}
                step={5}
                onChange={(next) => void patch((draft) => void (draft.practice.minDurationSec = next))}
              />
              <Stepper
                label="Longest lesson"
                suffix="s"
                value={s.practice.maxDurationSec}
                min={20}
                max={300}
                step={5}
                onChange={(next) => void patch((draft) => void (draft.practice.maxDurationSec = next))}
              />
              <Stepper
                label="Gap between sessions"
                suffix="ms"
                value={s.practice.delayMinMs}
                min={0}
                max={30_000}
                step={250}
                onChange={(next) => void patch((draft) => void (draft.practice.delayMinMs = next))}
              />
              <Stepper
                label="Hearts reported"
                hint="Duolingo shows 5 in a clean lesson"
                value={s.practice.heartsLeft}
                min={0}
                max={5}
                onChange={(next) => void patch((draft) => void (draft.practice.heartsLeft = next))}
              />
              <Stepper
                label="Daily XP goal"
                hint="Drives the ring on the popup"
                suffix="XP"
                value={s.practice.dailyXpGoal}
                min={10}
                max={500}
                step={10}
                onChange={(next) => void patch((draft) => void (draft.practice.dailyXpGoal = next))}
              />
              <Stepper
                label="XP budget per run"
                hint="Stop early once this much XP is earned. 0 disables the cap."
                suffix="XP"
                value={s.practice.xpBudget}
                min={0}
                max={2000}
                step={25}
                onChange={(next) => void patch((draft) => void (draft.practice.xpBudget = next))}
              />
              <Toggle
                label="Stop on first failure"
                hint="Otherwise the run keeps going and reports failures at the end"
                checked={s.practice.stopOnError}
                onChange={(next) => void patch((draft) => void (draft.practice.stopOnError = next))}
              />
            </Card>

            <Card tone="blue">
              <div className="callout">
                <ClockIcon size={18} />
                <p>
                  A 5-session run takes roughly {Math.round((s.practice.sessions * ((s.practice.minDurationSec + s.practice.maxDurationSec) / 2 + 3.5)) / 60)} minutes
                  including randomised pauses.
                </p>
              </div>
            </Card>
          </div>
        ) : null}

        {section === 'rewards' ? (
          <div className="stack">
            <Card>
              <CardHeader
                title="Reward sweep"
                subtitle="Chests, quests, tournament prizes, monthly challenges"
                icon={<GemIcon size={18} />}
                action={
                  <Toggle label="" checked={s.rewards.enabled} onChange={(next) => void patch((draft) => void (draft.rewards.enabled = next))} />
                }
              />
              <Stepper
                label="Maximum claims per run"
                value={s.rewards.maxClaims}
                min={0}
                max={100}
                step={5}
                onChange={(next) => void patch((draft) => void (draft.rewards.maxClaims = next))}
              />
            </Card>

            <Card>
              <CardHeader
                title="Monthly badges"
                subtitle="Reads goals-api and can request a missing badge"
                icon={<TrophyIcon size={18} />}
                action={
                  <Toggle label="" checked={s.badges.enabled} onChange={(next) => void patch((draft) => void (draft.badges.enabled = next))} />
                }
              />
              <Toggle
                label="Request missing badges"
                hint="Uses the third-party PRO bridge — needs it enabled below"
                checked={s.badges.request}
                onChange={(next) => void patch((draft) => void (draft.badges.request = next))}
              />
              <div className="field-grid">
                <Field
                  label="Timezone"
                  value={s.badges.timezone}
                  onChange={(value) => void patch((draft) => void (draft.badges.timezone = value))}
                  hint="IANA name, e.g. Asia/Ho_Chi_Minh"
                />
                <Field
                  label="Years to scan"
                  value={s.badges.years.join(', ')}
                  onChange={(value) =>
                    void patch((draft) => {
                      draft.badges.years = value
                        .split(',')
                        .map((part) => Number(part.trim()))
                        .filter((year) => Number.isInteger(year) && year > 2000);
                    })
                  }
                  hint="Comma separated"
                />
              </div>
              <Stepper
                label="Requests per run"
                value={s.badges.maxRequestsPerRun}
                min={0}
                max={12}
                onChange={(next) => void patch((draft) => void (draft.badges.maxRequestsPerRun = next))}
              />
            </Card>

            <Card>
              <CardHeader title="Streak freeze" subtitle="Buy a freeze when inventory is low" icon={<ShieldIcon size={18} />} />
              <Toggle
                label="Auto top-up"
                hint="Stops at the target count"
                checked={s.freeze.enabled}
                onChange={(next) => void patch((draft) => void (draft.freeze.enabled = next))}
              />
              <Stepper
                label="Target inventory"
                value={s.freeze.targetCount}
                min={0}
                max={2}
                onChange={(next) => void patch((draft) => void (draft.freeze.targetCount = next))}
              />
            </Card>
          </div>
        ) : null}

        {section === 'activity' ? (
          <div className="stack">
            {forecast ? (
              <Card tone={forecast.tone === 'red' ? 'red' : forecast.tone === 'gold' ? 'gold' : 'green'}>
                <CardHeader
                  title="Streak forecast"
                  subtitle={forecast.headline}
                  icon={<FlameIcon size={18} />}
                  action={<Pill tone={forecast.slack > 0 ? 'green' : 'red'}>{forecast.slack} day(s) slack</Pill>}
                />
                <StreakForecastStrip forecast={forecast} />
              </Card>
            ) : null}

            <Card>
              <CardHeader
                title="XP heatmap"
                subtitle="Eight weeks of activity"
                icon={<ChartIcon size={18} />}
                action={<Pill tone="green">{formatNumber(state.stats.xp)} XP logged</Pill>}
              />
              <div className="heat-wrap">
                <Heatmap data={heatCells} weeks={8} />
                <div className="heat-facts">
                  <div className="heat-fact">
                    <b>{heatFacts.activeDays}</b>
                    <span>Active days</span>
                  </div>
                  <div className="heat-fact">
                    <b>{formatNumber(heatFacts.best)}</b>
                    <span>Best day XP</span>
                  </div>
                  <div className="heat-fact">
                    <b>{formatNumber(heatFacts.average)}</b>
                    <span>Avg per active day</span>
                  </div>
                </div>
              </div>
            </Card>
            <Card>
              <CardHeader
                title="Achievements"
                subtitle={`${badgeCount.unlocked} of ${badgeCount.total} unlocked`}
                icon={<TrophyIcon size={18} />}
                action={<Pill tone={badgeCount.unlocked > 0 ? 'gold' : 'neutral'}>{Math.round(badgeCount.ratio * 100)}%</Pill>}
              />
              <AchievementGrid items={achievements} />
            </Card>

            <Card>
              <CardHeader
                title="Run history"
                subtitle={`${runs.length} run(s) stored locally`}
                icon={<HistoryIcon size={18} />}
                action={
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<DownloadIcon size={15} />}
                    onClick={() => exportHistory(runs)}
                  >
                    Export
                  </Button>
                }
              />
              {runs.length === 0 ? (
                <EmptyState icon={<HistoryIcon size={22} />} title="No runs yet" body="Every run you start is recorded here." />
              ) : (
                <ul className="run-list">
                  {runs.slice(0, 25).map((run) => (
                    <RunRow key={run.id} run={run} onRetry={(only) => void app.startRun(only)} />
                  ))}
                </ul>
              )}
            </Card>
          </div>
        ) : null}

        {section === 'schedule' ? (
          <div className="stack">
            <Card>
              <CardHeader
                title="Scheduled runs"
                subtitle="Backed by chrome.alarms — survives browser restarts"
                icon={<CalendarIcon size={18} />}
                action={
                  <Toggle label="" checked={s.schedule.enabled} onChange={(next) => void patch((draft) => void (draft.schedule.enabled = next))} />
                }
              />
              <Stepper
                label="Interval"
                suffix="min"
                value={s.schedule.intervalMinutes}
                min={15}
                max={1440}
                step={15}
                onChange={(next) => void patch((draft) => void (draft.schedule.intervalMinutes = next))}
              />
              <WeekdayPicker
                value={s.schedule.days}
                onChange={(next) => void patch((draft) => void (draft.schedule.days = next))}
              />
              <Toggle
                label="Run once on browser start"
                hint="Useful after a reboot, skipped during quiet hours"
                checked={s.schedule.runOnStartup}
                onChange={(next) => void patch((draft) => void (draft.schedule.runOnStartup = next))}
              />
              <div className="next-run">
                <ClockIcon size={16} />
                <span>
                  {state.schedule.nextRunAt ? `Next run ${formatRelative(state.schedule.nextRunAt)}` : 'No run scheduled'}
                </span>
              </div>
            </Card>

            <Card>
              <CardHeader title="Quiet hours" subtitle="Never touch your account at night" icon={<MoonIcon size={18} />} />
              <Toggle
                label="Enable quiet hours"
                checked={s.schedule.quietHours.enabled}
                onChange={(next) => void patch((draft) => void (draft.schedule.quietHours.enabled = next))}
              />
              <div className="field-grid">
                <Stepper
                  label="From"
                  suffix="h"
                  value={s.schedule.quietHours.startHour}
                  min={0}
                  max={23}
                  onChange={(next) => void patch((draft) => void (draft.schedule.quietHours.startHour = next))}
                />
                <Stepper
                  label="To"
                  suffix="h"
                  value={s.schedule.quietHours.endHour}
                  min={0}
                  max={23}
                  onChange={(next) => void patch((draft) => void (draft.schedule.quietHours.endHour = next))}
                />
              </div>
            </Card>
          </div>
        ) : null}

        {section === 'safety' ? (
          <div className="stack">
            <Card tone="gold">
              <CardHeader title="Read this once" subtitle="Automation is not endorsed by Duolingo" icon={<AlertIcon size={18} />} />
              <p className="hint">
                These calls hit Duolingo's private web endpoints. Automated activity can break the terms of service and, in the
                worst case, get an account limited. Use an account you control and keep session counts modest.
              </p>
            </Card>

            <Card>
              <CardHeader title="Run behaviour" subtitle="How careful the automation is" icon={<ShieldIcon size={18} />} />
              <Toggle
                label="Dry run"
                hint="Walk the whole plan, change nothing"
                checked={s.behavior.dryRun}
                onChange={(next) => void patch((draft) => void (draft.behavior.dryRun = next))}
              />
              <Toggle
                label="Desktop notifications"
                hint="A summary when a run finishes"
                checked={s.behavior.notifications}
                onChange={(next) => void patch((draft) => void (draft.behavior.notifications = next))}
              />
              <Toggle
                label="Streak on the toolbar badge"
                hint="Shows the live streak number on the icon"
                checked={s.behavior.badgeText}
                onChange={(next) => void patch((draft) => void (draft.behavior.badgeText = next))}
              />
              <Stepper
                label="Cooldown between runs"
                hint="Blocks accidental double-runs; scheduled runs are exempt"
                suffix="s"
                value={s.behavior.cooldownSeconds}
                min={0}
                max={600}
                step={15}
                onChange={(next) => void patch((draft) => void (draft.behavior.cooldownSeconds = next))}
              />
              <Toggle
                label="Keep the worker awake"
                hint="Prevents a long run from being suspended mid-way"
                checked={s.behavior.keepServiceWorkerAlive}
                onChange={(next) => void patch((draft) => void (draft.behavior.keepServiceWorkerAlive = next))}
              />
            </Card>

            <Card tone="red">
              <CardHeader title="Third-party PRO bridge" subtitle="api.duolingopro.net" icon={<GlobeIcon size={18} />} />
              <p className="hint">
                Badge requests, Super activation and XP boosts are sent to a third-party service together with your session
                token. Nothing else in this extension contacts that host.
              </p>
              <Toggle
                label="Enable PRO features"
                checked={s.pro.enabled}
                onChange={(next) => void patch((draft) => void (draft.pro.enabled = next))}
              />
              <Toggle
                label="I understand the risk"
                hint="Required before any request is sent"
                checked={s.pro.acknowledgeRisk}
                onChange={(next) => void patch((draft) => void (draft.pro.acknowledgeRisk = next))}
              />
              <Divider />
              <Toggle
                label="Super activation task"
                checked={s.super.enabled}
                onChange={(next) => void patch((draft) => void (draft.super.enabled = next))}
              />
              <Toggle
                label="Double XP boost task"
                checked={s.boost.enabled}
                onChange={(next) => void patch((draft) => void (draft.boost.enabled = next))}
              />
            </Card>
          </div>
        ) : null}

        {section === 'appearance' ? (
          <div className="stack">
            <Card>
              <CardHeader title="Theme" subtitle="Follow the system or pin one" icon={<SunIcon size={18} />} />
              <Segmented<ThemePreference>
                value={s.ui.theme}
                onChange={(value) => void patch((draft) => void (draft.ui.theme = value))}
                options={[
                  { value: 'system', label: 'System', icon: <GlobeIcon size={14} /> },
                  { value: 'light', label: 'Light', icon: <SunIcon size={14} /> },
                  { value: 'dark', label: 'Dark', icon: <MoonIcon size={14} /> },
                ]}
              />
              <Divider />
              <Segmented<Locale>
                value={s.ui.locale}
                onChange={(value) => void patch((draft) => void (draft.ui.locale = value))}
                options={[
                  { value: 'vi', label: 'Tiếng Việt' },
                  { value: 'en', label: 'English' },
                ]}
              />
              <p className="hint">Interface copy currently follows Duolingo's English wording; the locale switch is wired for translations.</p>
              <Toggle
                label="Reduce motion"
                hint="Disables the progress shimmer and press animations"
                checked={s.ui.reduceMotion}
                onChange={(next) => void patch((draft) => void (draft.ui.reduceMotion = next))}
              />
            </Card>

            <Card>
              <CardHeader title="Palette" subtitle="Straight from duolingo.com" icon={<SparkleIcon size={18} />} />
              <div className="swatches">
                {[
                  ['Feather Green', '#58cc02'],
                  ['Macaw', '#1cb0f6'],
                  ['Cardinal', '#ff4b4b'],
                  ['Bee', '#ffc800'],
                  ['Fox', '#ff9600'],
                  ['Beetle', '#ce82ff'],
                  ['Eel', '#4b4b4b'],
                  ['Night', '#131f24'],
                ].map(([name, hex]) => (
                  <div className="swatch" key={hex}>
                    <span style={{ background: hex }} />
                    <b>{name}</b>
                    <em>{hex}</em>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        ) : null}

        {section === 'data' ? (
          <div className="stack">
            <Card>
              <CardHeader
                title="History"
                subtitle={`${formatNumber(state.stats.runs)} runs · ${formatNumber(state.stats.xp)} XP`}
                icon={<HistoryIcon size={18} />}
                action={
                  <Button size="sm" variant="ghost" icon={<TrashIcon size={15} />} onClick={() => void app.clearHistory()}>
                    Clear
                  </Button>
                }
              />
              <Bars data={state.stats.daily.map((point) => ({ label: point.day, value: point.xp }))} height={84} tone="blue" />
              <Divider />
              <div className="kv">
                <div>
                  <span>Rewards claimed</span>
                  <b>{formatNumber(state.stats.rewards)}</b>
                </div>
                <div>
                  <span>Gems earned</span>
                  <b>{formatNumber(state.stats.gems)}</b>
                </div>
                <div>
                  <span>Clean runs</span>
                  <b>{state.stats.successRate}%</b>
                </div>
                <div>
                  <span>Last run</span>
                  <b>{state.stats.lastRunAt ? formatRelative(state.stats.lastRunAt) : '—'}</b>
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader title="Backup" subtitle="Settings only — tokens are never exported" icon={<DownloadIcon size={18} />} />
              <div className="row-actions">
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<DownloadIcon size={15} />}
                  onClick={async () => {
                    const result = await bridge.send<{ json: string }>({ type: 'settings/export' });
                    if (result.ok) {
                      await navigator.clipboard?.writeText(result.value.json).catch(() => undefined);
                      app.toast('success', 'Settings JSON copied to clipboard');
                    }
                  }}
                >
                  Export
                </Button>
                <Button size="sm" variant="ghost" icon={<UploadIcon size={15} />} onClick={() => go('data')}>
                  Import below
                </Button>
                <Button size="sm" variant="danger" icon={<TrashIcon size={15} />} onClick={() => void app.resetSettings()}>
                  Reset all
                </Button>
              </div>
              <Field
                label="Paste settings JSON"
                value={importDraft}
                onChange={setImportDraft}
                hint="Merged over defaults and validated field by field"
                action={
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      const result = await bridge.send({ type: 'settings/import', payload: importDraft });
                      app.toast(result.ok ? 'success' : 'error', result.ok ? 'Settings imported' : 'Invalid JSON');
                    }}
                  >
                    Import
                  </Button>
                }
              />
            </Card>

            <Card>
              <CardHeader title="Recent output" subtitle="Last 150 lines" icon={<SlidersIcon size={18} />} />
              <LogConsole logs={state.logs} height={200} />
            </Card>
          </div>
        ) : null}

        {section === 'about' ? (
          <div className="stack">
            <Card tone="green">
              <div className="about">
                <BrandMark size={64} className="about__mark" />
                <div>
                  <h2>Duo Assist {state.version}</h2>
                  <p>
                    A Manifest V3 extension that runs your Duolingo routine for you — practice sessions, reward claims,
                    monthly badges and streak freezes — inside a UI built on Duolingo's own design language.
                  </p>
                  <div className="about__tags">
                    <Pill tone="green">Manifest V3</Pill>
                    <Pill tone="blue">TypeScript</Pill>
                    <Pill tone="purple">Local-only storage</Pill>
                    <Pill tone="neutral">No telemetry</Pill>
                  </div>
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader title="What it does" subtitle="Six independent tasks, one ordered plan" icon={<RocketIcon size={18} />} />
              <div className="about__grid">
                <div>
                  <b>Practice sessions</b>
                  <span>Opens and completes lessons, with randomised pacing and an optional XP ceiling.</span>
                </div>
                <div>
                  <b>Reward sweep</b>
                  <span>Claims chests, quests, tournament prizes and monthly challenges.</span>
                </div>
                <div>
                  <b>Monthly badges</b>
                  <span>Detects finished months that are still missing a badge.</span>
                </div>
                <div>
                  <b>Streak freeze</b>
                  <span>Tops up freeze inventory so a missed day cannot end the streak.</span>
                </div>
                <div>
                  <b>Scheduler</b>
                  <span>Runs on an interval, on chosen weekdays, outside quiet hours.</span>
                </div>
                <div>
                  <b>Observability</b>
                  <span>Live log stream, run history, XP heatmap and a streak forecast.</span>
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader title="Shortcuts" icon={<TargetIcon size={18} />} />
              <div className="kv">
                <div>
                  <span>Run automation</span>
                  <b>
                    <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>D</kbd>
                  </b>
                </div>
                <div>
                  <span>Open console</span>
                  <b>
                    <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>C</kbd>
                  </b>
                </div>
                <div>
                  <span>Command palette</span>
                  <b>
                    <kbd>{modKey()}</kbd> + <kbd>K</kbd>
                  </b>
                </div>
              </div>
              <Divider />
              <div className="link-list">
                <a href="https://www.duolingo.com/learn" target="_blank" rel="noreferrer">
                  <LinkIcon size={15} /> duolingo.com <ExternalIcon size={13} />
                </a>
                <a href="https://www.duolingopro.net/" target="_blank" rel="noreferrer">
                  <LinkIcon size={15} /> duolingopro.net <ExternalIcon size={13} />
                </a>
              </div>
            </Card>

            <Card tone="gold">
              <div className="callout">
                <AlertIcon size={18} />
                <p>
                  Unofficial project. Not affiliated with Duolingo. Automation may violate their terms — use an account you
                  control and keep runs modest.
                </p>
              </div>
            </Card>
          </div>
        ) : null}

        <footer className="options__footer">
          <span>
            <CheckIcon size={14} /> Changes save automatically
          </span>
          <span className="u-faint">{state.stats.runs} runs recorded</span>
        </footer>
      </main>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} actions={paletteActions} />
      <ToastStack items={app.toasts} onDismiss={app.dismissToast} />
    </div>
  );
}
