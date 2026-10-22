// Copyright github.com/nguyenphanno © 2026. All rights reserved
/**
 * Options.tsx — the full settings surface.
 *
 * Every control writes through `patchSettings`, which round-trips to the
 * service worker and re-renders from the authoritative state. No local form
 * state to drift out of sync.
 *
 * All copy comes from the message catalogue; the language switch re-renders the
 * page in place, including the command palette.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatCompact, formatNumber } from '@Shared/Utils/Format';
import type { AnswerBookStats } from '@Core/Storage/AnswerBook';
import { dayKey, formatDuration, formatRelative } from '@Shared/Utils/Time';
import { achievementSummary, computeAchievements } from '@Shared/Utils/Achievements';
import { forecastFromProfile } from '@Shared/Utils/Forecast';
import { isPausedOn } from '@Shared/Utils/Pause';
import { describeError } from '@Shared/Result';
import type { ShopItemView } from '@Shared/ShopCatalog';
import type { Locale, RunSummary, TaskKey, ThemePreference } from '@Shared/Types';
import { bridge } from '@Shared/Bridge/ExtensionBridge';
import { useAppState } from '@Ui/Hooks/UseAppState';
import { useTheme } from '@Ui/Hooks/UseTheme';
import { useLocale } from '@Ui/Hooks/UseLocale';
import { tp, useT } from '@Ui/I18n/I18n';
import type { MessageKey } from '@Ui/I18n/Messages';
import { BrandMark } from '@Ui/Components/BrandMark';
import { Button, IconButton } from '@Ui/Components/Button';
import { Card, CardHeader } from '@Ui/Components/Card';
import { CommandPalette, type PaletteAction } from '@Ui/Components/CommandPalette';
import { Field, Segmented, Select, Stepper, Toggle } from '@Ui/Components/Controls';
import { Bars, Divider, EmptyState, Pill, ProgressBar, Stat } from '@Ui/Components/Display';
import { Heatmap } from '@Ui/Components/Heatmap';
import { AchievementGrid, StreakForecastStrip } from '@Ui/Components/Insights';
import { LogConsole } from '@Ui/Components/LogConsole';
import { PlanPreview } from '@Ui/Components/PlanPreview';
import { ToastStack } from '@Ui/Components/Toast';
import { WeeklyReport } from '@Ui/Components/WeeklyReport';
import {
  AlertIcon,
  ChartIcon,
  CheckIcon,
  ChevronRightIcon,
  ClockIcon,
  CopyIcon,
  DownloadIcon,
  ExternalIcon,
  GlobeIcon,
  HistoryIcon,
  LinkIcon,
  MoonIcon,
  PlayIcon,
  RefreshIcon,
  ShieldIcon,
  SlidersIcon,
  SparkleIcon,
  SunIcon,
  TrashIcon,
  UploadIcon,
} from '@Ui/Icons/Icons';
import { modKey } from '@Ui/Utils/Platform';
import { DuoArt } from '@Ui/Icons/DuoArt';
import './Options.css';

type Section =
  | 'account'
  | 'practice'
  | 'answers'
  | 'activity'
  | 'rewards'
  | 'shop'
  | 'schedule'
  | 'safety'
  | 'appearance'
  | 'data'
  | 'about';

interface ShopResponse {
  items: ShopItemView[];
  source: 'live' | 'catalog';
  error?: string;
}

const NAV: Array<{ id: Section; labelKey: MessageKey; icon: JSX.Element }> = [
  { id: 'account', labelKey: 'nav.account', icon: <DuoArt name="navAccount" size={22} /> },
  { id: 'practice', labelKey: 'nav.practice', icon: <DuoArt name="navPractice" size={22} /> },
  { id: 'answers', labelKey: 'nav.answers', icon: <DuoArt name="key" size={22} /> },
  { id: 'activity', labelKey: 'nav.activity', icon: <DuoArt name="navActivity" size={22} /> },
  { id: 'rewards', labelKey: 'nav.rewards', icon: <DuoArt name="navRewards" size={22} /> },
  { id: 'shop', labelKey: 'nav.shop', icon: <DuoArt name="navShop" size={22} /> },
  { id: 'schedule', labelKey: 'nav.schedule', icon: <DuoArt name="navSchedule" size={22} /> },
  { id: 'safety', labelKey: 'nav.safety', icon: <DuoArt name="navSafety" size={22} /> },
  { id: 'appearance', labelKey: 'nav.appearance', icon: <DuoArt name="navAppearance" size={22} /> },
  { id: 'data', labelKey: 'nav.data', icon: <DuoArt name="navData" size={22} /> },
  { id: 'about', labelKey: 'nav.about', icon: <DuoArt name="navAbout" size={22} /> },
];

const DAY_KEYS: MessageKey[] = [
  'weekday.sun',
  'weekday.mon',
  'weekday.tue',
  'weekday.wed',
  'weekday.thu',
  'weekday.fri',
  'weekday.sat',
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
  const t = useT();
  const [open, setOpen] = useState(false);
  const failed = run.tasks.filter((task) => task.status === 'failed').length;
  const status = run.error ? 'failed' : failed > 0 ? 'warn' : 'ok';
  const retryable = [...new Set(run.tasks.filter((task) => task.status === 'failed').map((task) => task.task))];

  const totalDuration = run.finishedAt - run.startedAt;
  const xpDelta = run.before && run.after ? run.after.totalXp - run.before.totalXp : run.xpGained;
  const gemDelta = run.before && run.after ? run.after.gems - run.before.gems : run.gemsClaimed;
  const streakDelta = run.before && run.after ? run.after.streak - run.before.streak : 0;

  return (
    <li className={`run-row run-row--${status}`}>
      <button type="button" className="run-row__head" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span className="run-row__dot" />
        <span className="run-row__when">
          <b>{formatRelative(run.startedAt)}</b>
          <em>
            {t(`trigger.${run.trigger}` as MessageKey)}
            {run.dryRun ? t('run.drySuffix') : ''}
          </em>
        </span>
        <span className="run-row__nums">
          <b>+{run.xpGained}</b> XP
          <em>
            {run.rewardsClaimed} · {run.gemsClaimed}
          </em>
        </span>
        <span className="run-row__time">{formatDuration(totalDuration)}</span>
        <ChevronRightIcon size={14} className={open ? 'is-open' : ''} />
      </button>
      {open ? (
        <div className="run-row__detail">
          <div className="run-detail__summary">
            <div className="kv kv--tight">
              <div>
                <span>{t('run.xpGained')}</span>
                <b>+{run.xpGained}</b>
              </div>
              <div>
                <span>{t('run.rewardsClaimed')}</span>
                <b>{run.rewardsClaimed}</b>
              </div>
              <div>
                <span>{t('run.gemsClaimed')}</span>
                <b>{run.gemsClaimed}</b>
              </div>
              <div>
                <span>{t('run.duration')}</span>
                <b>{formatDuration(totalDuration)}</b>
              </div>
            </div>

            {(run.before || run.after) && (
              <div className="run-detail__snapshots">
                {run.before && (
                  <div className="snapshot">
                    <span>{t('run.before')}</span>
                    <b>XP {formatNumber(run.before.totalXp)}</b>
                    <em>{run.before.streak} streak · {run.before.gems} gems</em>
                  </div>
                )}
                <span className="snapshot__arrow">→</span>
                {run.after && (
                  <div className="snapshot">
                    <span>{t('run.after')}</span>
                    <b>XP {formatNumber(run.after.totalXp)}</b>
                    <em>
                      {run.after.streak} streak
                      {streakDelta !== 0 ? ` (${streakDelta > 0 ? '+' : ''}${streakDelta})` : ''}
                      {' · '}
                      {run.after.gems} gems
                      {gemDelta !== 0 ? ` (${gemDelta > 0 ? '+' : ''}${gemDelta})` : ''}
                    </em>
                  </div>
                )}
                <div className="snapshot">
                  <span>{t('run.delta')}</span>
                  <b>+{formatNumber(xpDelta)}</b>
                  <em>XP</em>
                </div>
              </div>
            )}
          </div>

          {run.sessions.length > 0 && (
            <div className="run-detail__sessions">
              <span className="run-detail__label">{t('run.sessions')}</span>
              <div className="session-chips">
                {run.sessions.map((session) => (
                  <span key={session.sessionId} className={`session-chip session-chip--${session.ok ? 'ok' : 'fail'}`}>
                    <b>{t('run.sessionIndex', { n: session.index + 1 })}</b>
                    <em>{session.xp} XP · {formatDuration(session.durationMs)}</em>
                    <span>{session.ok ? t('run.sessionOk') : t('run.sessionFail')}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="run-detail__tasks">
            {run.tasks.length > 0 ? (
              run.tasks.map((task) => (
                <div key={`${task.task}-${task.startedAt}`} className={`run-task run-task--${task.status}`}>
                  <div className="run-task__head">
                    <span className="run-task__name">{t(`task.${task.task}` as MessageKey)}</span>
                    <em>{task.headline}</em>
                    <span className="run-task__time">{formatDuration(task.finishedAt - task.startedAt)}</span>
                  </div>
                  {task.detail ? <p className="run-task__detail">{task.detail}</p> : null}
                  {Object.keys(task.metrics).length > 0 ? (
                    <div className="run-task__metrics">
                      {Object.entries(task.metrics).map(([key, value]) => (
                        <span key={key} className="metric-chip">
                          <b>{value}</b> <em>{key}</em>
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="hint">{t('run.noTasks')}</p>
            )}
          </div>

          {run.error ? (
            <div className="run-task run-task--failed">
              <span>{t('run.error')}</span>
              <em>{run.error}</em>
            </div>
          ) : null}
          {onRetry && retryable.length > 0 ? (
            <div className="run-row__retry">
              <span>{retryable.length === 1 ? t('run.retryOne') : t('run.retryMany', { n: retryable.length })}</span>
              <Button size="sm" variant="secondary" icon={<RefreshIcon size={14} />} onClick={() => onRetry(retryable)}>
                {t('common.retry')}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function WeekdayPicker({ value, onChange }: { value: number[]; onChange: (next: number[]) => void }) {
  const t = useT();
  const toggle = (day: number) => {
    const next = value.includes(day) ? value.filter((item) => item !== day) : [...value, day].sort((a, b) => a - b);
    onChange(next);
  };
  return (
    <div className="weekdays">
      <div className="weekdays__head">
        <span className="weekdays__label">{t('weekday.active')}</span>
        <button type="button" className="weekdays__preset" onClick={() => onChange([1, 2, 3, 4, 5])}>
          {t('weekday.weekdays')}
        </button>
        <button type="button" className="weekdays__preset" onClick={() => onChange([0, 1, 2, 3, 4, 5, 6])}>
          {t('weekday.all')}
        </button>
      </div>
      <div className="weekdays__row">
        {DAY_KEYS.map((key, day) => (
          <button
            key={key}
            type="button"
            className={`weekdays__day${value.includes(day) ? ' is-on' : ''}`}
            aria-pressed={value.includes(day)}
            onClick={() => toggle(day)}
          >
            {t(key)}
          </button>
        ))}
      </div>
      <p className="hint">{value.length === 0 ? t('weekday.none') : tp('weekday.count', value.length)}</p>
    </div>
  );
}

export function Options() {
  const app = useAppState();
  const t = useT();
  const [section, setSection] = useState<Section>(sectionFromLocation);
  const [tokenDraft, setTokenDraft] = useState('');
  const [importDraft, setImportDraft] = useState('');
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shop, setShop] = useState<ShopResponse | null>(null);
  const [shopBusy, setShopBusy] = useState<string | null>(null);
  const [answers, setAnswers] = useState<AnswerBookStats | null>(null);

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

  // The shop is fetched lazily: it costs a network round-trip and most visits
  // never open that section.
  useEffect(() => {
    if (section !== 'shop' || shop) return;
    void bridge.send<ShopResponse>({ type: 'shop/list' }).then((result) => {
      if (result.ok) setShop(result.value);
    });
  }, [section, shop]);

  // The answer book is read on demand too: it lives in its own storage key, and
  // a settings save does not touch it, so there is nothing to subscribe to.
  const loadAnswers = useCallback(() => {
    void bridge.send<AnswerBookStats>({ type: 'answers/stats' }).then((result) => {
      if (result.ok) setAnswers(result.value);
    });
  }, []);

  useEffect(() => {
    if (section !== 'answers') return;
    loadAnswers();
  }, [section, loadAnswers]);

  const clearAnswerBook = async (): Promise<void> => {
    const result = await bridge.send({ type: 'answers/clear' });
    if (result.ok) {
      setAnswers({ count: 0, recent: [] });
      app.toast('success', t('opt.answers.bookCleared'));
    } else {
      app.toast('error', describeError(result.error));
    }
  };

  const buyShopItem = async (itemId: string): Promise<void> => {
    setShopBusy(itemId);
    const result = await bridge.send({ type: 'shop/buy', itemId });
    setShopBusy(null);
    if (!result.ok) {
      app.toast('error', describeError(result.error));
      return;
    }
    app.toast('success', t('shop.bought'));
    // Prices and the gem balance both moved, so refetch rather than patch.
    setShop(null);
  };

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

  // Plan preview — what the scheduler would do right now.
  const schedulerBlock = useMemo((): 'disabled' | 'quiet-hours' | 'off-day' | null => {
    const settings = app.state?.settings;
    if (!settings) return 'disabled';
    if (!settings.schedule.enabled) return 'disabled';
    const now = new Date();
    const days = settings.schedule.days;
    if (days.length === 0 || !days.includes(now.getDay())) return 'off-day';
    const quiet = settings.schedule.quietHours;
    if (quiet.enabled) {
      const hour = now.getHours();
      if (quiet.startHour < quiet.endHour) {
        if (hour >= quiet.startHour && hour < quiet.endHour) return 'quiet-hours';
      } else if (hour >= quiet.startHour || hour < quiet.endHour) {
        return 'quiet-hours';
      }
    }
    return null;
  }, [app.state?.settings]);

  if (!app.state) {
    return (
      <div className="options options--loading">
        <div className="options__side" />
        <div className="options__main">{t('common.loading')}</div>
      </div>
    );
  }

  const { state } = app;
  const s = state.settings;
  const patch = app.patchSettings;
  const badgeCount = achievementSummary(achievements);
  const todayXp = state.stats.daily[state.stats.daily.length - 1]?.xp ?? 0;

  const go = (id: Section) => {
    setSection(id);
    rememberSection(id);
  };

  const paletteActions: PaletteAction[] = [
    ...NAV.map((item) => ({
      id: `nav-${item.id}`,
      label: t(item.labelKey),
      hint: t('palette.jump', { section: t(item.labelKey).toLowerCase() }),
      group: t('palette.navigate'),
      icon: item.icon,
      keywords: 'go open page tab',
      run: () => go(item.id),
    })),
    {
      id: 'run-now',
      label: t('palette.runNow'),
      hint: t('palette.runNowHint'),
      group: t('palette.run'),
      icon: <PlayIcon size={15} />,
      keywords: 'start execute begin',
      trailing: s.behavior.dryRun ? t('palette.dry') : t('palette.live'),
      run: () => void app.startRun(),
    },
    {
      id: 'run-dry',
      label: s.behavior.dryRun ? t('palette.dryOff') : t('palette.dryOn'),
      hint: t('palette.dryHint'),
      group: t('palette.run'),
      icon: <ShieldIcon size={15} />,
      keywords: 'simulate preview safety',
      trailing: s.behavior.dryRun ? t('palette.on') : t('palette.off'),
      run: () => void patch((draft) => void (draft.behavior.dryRun = !draft.behavior.dryRun)),
    },
    {
      id: 'refresh',
      label: t('palette.refresh'),
      hint: t('palette.refreshHint'),
      group: t('palette.run'),
      icon: <RefreshIcon size={15} />,
      keywords: 'sync reload',
      run: () => void app.refreshProfile(),
    },
    {
      id: 'retry-failed',
      label: t('palette.retry'),
      hint: t('palette.retryHint'),
      group: t('palette.run'),
      icon: <RefreshIcon size={15} />,
      keywords: 'again fix',
      run: () => {
        const failed = [
          ...new Set((state.lastSummary?.tasks ?? []).filter((task) => task.status === 'failed').map((task) => task.task)),
        ];
        if (failed.length === 0) {
          app.toast('info', t('palette.retryNone'));
          return;
        }
        void app.startRun(failed);
      },
    },
    {
      id: 'theme-dark',
      label: s.ui.theme === 'dark' ? t('palette.themeLight') : t('palette.themeDark'),
      hint: t('palette.themeHint'),
      group: t('palette.appearance'),
      icon: s.ui.theme === 'dark' ? <SunIcon size={15} /> : <MoonIcon size={15} />,
      keywords: 'night mode colors',
      run: () => void patch((draft) => void (draft.ui.theme = draft.ui.theme === 'dark' ? 'light' : 'dark')),
    },
    {
      id: 'locale',
      label: t('palette.locale', { language: s.ui.locale === 'vi' ? 'English' : 'Tiếng Việt' }),
      hint: t('palette.localeHint'),
      group: t('palette.appearance'),
      icon: <GlobeIcon size={15} />,
      keywords: 'language locale ngon ngu',
      trailing: s.ui.locale.toUpperCase(),
      run: () => void patch((draft) => void (draft.ui.locale = draft.ui.locale === 'vi' ? 'en' : 'vi')),
    },
    {
      id: 'export-history',
      label: t('palette.exportHistory'),
      hint: t('palette.exportHistoryHint'),
      group: t('palette.data'),
      icon: <DownloadIcon size={15} />,
      keywords: 'backup save json',
      run: async () => {
        const result = await bridge.send<RunSummary[]>({ type: 'history/list' });
        if (result.ok) exportHistory(result.value);
      },
    },
    {
      id: 'copy-settings',
      label: t('palette.copySettings'),
      hint: t('palette.copySettingsHint'),
      group: t('palette.data'),
      icon: <CopyIcon size={15} />,
      keywords: 'backup clipboard export',
      run: async () => {
        const result = await bridge.send<{ json: string }>({ type: 'settings/export' });
        if (!result.ok) return;
        await navigator.clipboard?.writeText(result.value.json).catch(() => undefined);
        app.toast('success', t('opt.data.copied'));
      },
    },
    {
      id: 'clear-history',
      label: t('palette.clearHistory'),
      hint: t('palette.clearHistoryHint'),
      group: t('palette.data'),
      icon: <TrashIcon size={15} />,
      keywords: 'delete wipe reset',
      run: () => void app.clearHistory(),
    },
    {
      id: 'reset',
      label: t('palette.reset'),
      hint: t('palette.resetHint'),
      group: t('palette.data'),
      icon: <AlertIcon size={15} />,
      keywords: 'factory defaults restore',
      run: () => void app.resetSettings(),
    },
    {
      id: 'panel',
      label: t('palette.panel'),
      hint: t('palette.panelHint'),
      group: t('palette.navigate'),
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
              <span>{t(item.labelKey)}</span>
              <ChevronRightIcon size={14} className="side__chev" />
            </button>
          ))}
        </nav>

        <div className="side__status">
          <div className="side__status-row">
            <span className={`dot${s.schedule.enabled ? ' is-on' : ''}`} />
            <span>
              {s.schedule.enabled ? t('opt.sidebarEvery', { n: s.schedule.intervalMinutes }) : t('opt.sidebarOff')}
            </span>
          </div>
          <div className="side__status-row">
            <DuoArt name="streak" size={18} />
            <span>{tp('opt.sidebarStreak', state.profile?.streak ?? 0)}</span>
          </div>
          <ProgressBar value={state.stats.successRate / 100} height={8} tone="green" />
          <span className="side__hint">{t('opt.sidebarClean', { rate: state.stats.successRate })}</span>
        </div>
      </aside>

      <main className="options__main">
        <header className="hero">
          <div className="hero__left">
            <span className="hero__avatar">{state.profile?.displayName?.charAt(0).toUpperCase() ?? '?'}</span>
            <div>
              <h1>{state.profile ? `@${state.profile.username}` : t('opt.connectAccount')}</h1>
              <p>
                {state.token.valid
                  ? state.token.daysLeft
                    ? t('opt.sessionLine', { source: state.token.source, days: Math.floor(state.token.daysLeft) })
                    : t('opt.sessionNoExpiry', { source: state.token.source })
                  : state.token.message}
              </p>
            </div>
          </div>
          <div className="hero__stats">
            <Stat icon={<DuoArt name="xp" size={24} />} value={formatCompact(state.profile?.totalXp ?? 0)} label="XP" tone="gold" compact />
            <Stat
              icon={<DuoArt name="gem" size={24} />}
              value={formatCompact(state.profile?.gems ?? 0)}
              label={t('popup.statGems')}
              tone="blue"
              compact
            />
            <Stat icon={<DuoArt name="heart" size={26} />} value={state.profile?.hearts ?? 5} label={t('popup.statHearts')} tone="red" compact />
            <Stat
              icon={<DuoArt name="streak" size={24} />}
              value={state.profile?.streak ?? 0}
              label={t('popup.dayStreak')}
              tone="orange"
              compact
            />
          </div>
          <div className="hero__actions">
            <button type="button" className="hero__palette" onClick={() => setPaletteOpen(true)}>
              <span>{t('opt.searchActions')}</span>
              <kbd>{modKey()}</kbd>
              <kbd>K</kbd>
            </button>
            <Button size="sm" variant="secondary" icon={<RefreshIcon size={15} />} onClick={() => void app.refreshProfile()}>
              {t('common.refresh')}
            </Button>
            <Button size="sm" icon={<PlayIcon size={15} />} onClick={() => void app.startRun()}>
              {t('opt.runNow')}
            </Button>
          </div>
        </header>

        {section === 'account' ? (
          <div className="stack">
            <Card>
              <CardHeader
                title={t('opt.account.sourceTitle')}
                subtitle={t('opt.account.sourceSub')}
                icon={<DuoArt name="key" size={22} />}
                action={
                  <Pill tone={state.token.valid ? 'green' : 'red'}>
                    {state.token.valid ? t('opt.account.live') : t('opt.account.missing')}
                  </Pill>
                }
              />
              <Segmented
                label={t('opt.account.tokenSource')}
                value={s.tokenSource}
                onChange={(value) => void patch((draft) => void (draft.tokenSource = value))}
                options={[
                  { value: 'cookie', label: t('opt.account.cookie') },
                  { value: 'manual', label: t('opt.account.manual') },
                ]}
              />
              <p className="hint">{t('opt.account.cookieHint')}</p>
              <Divider />
              <Field
                label={t('opt.account.jwt')}
                mono
                type="password"
                placeholder="eyJhbGciOi…"
                value={tokenDraft}
                onChange={setTokenDraft}
                hint={t('opt.account.jwtHint')}
                action={
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void app.setToken(tokenDraft).then((ok) => ok && setTokenDraft(''))}
                  >
                    {t('common.save')}
                  </Button>
                }
              />
              <div className="token-state">
                <span className={`dot${state.token.valid ? ' is-on' : ''}`} />
                <span>{state.token.message}</span>
                {state.token.expiresAt ? (
                  <span className="u-faint">{t('opt.account.expires', { when: formatRelative(state.token.expiresAt) })}</span>
                ) : null}
              </div>
            </Card>

            <Card>
              <CardHeader
                title={t('opt.account.cacheTitle')}
                subtitle={t('opt.account.cacheSub')}
                icon={<DuoArt name="archive" size={22} />}
              />
              <div className="kv">
                <div>
                  <span>{t('opt.account.username')}</span>
                  <b>{state.profile?.username ?? t('common.dash')}</b>
                </div>
                <div>
                  <span>{t('opt.account.course')}</span>
                  <b>
                    {state.profile
                      ? `${state.profile.learningLanguage.toUpperCase()} ← ${state.profile.fromLanguage.toUpperCase()}`
                      : t('common.dash')}
                  </b>
                </div>
                <div>
                  <span>{t('opt.account.fetched')}</span>
                  <b>{state.profile ? formatRelative(state.profile.fetchedAt) : t('common.dash')}</b>
                </div>
                <div>
                  <span>{t('opt.account.freezes')}</span>
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
                title={t('opt.practice.title')}
                subtitle={t('opt.practice.sub')}
                icon={<DuoArt name="navPractice" size={22} />}
                action={
                  <Toggle
                    label=""
                    checked={s.practice.enabled}
                    onChange={(next) => void patch((draft) => void (draft.practice.enabled = next))}
                  />
                }
              />
              <Stepper
                label={t('opt.practice.sessions')}
                hint={t('opt.practice.sessionsHint')}
                value={s.practice.sessions}
                min={0}
                max={30}
                onChange={(next) => void patch((draft) => void (draft.practice.sessions = next))}
              />
              <Stepper
                label={t('opt.practice.minDuration')}
                suffix="s"
                value={s.practice.minDurationSec}
                min={20}
                max={300}
                step={5}
                onChange={(next) => void patch((draft) => void (draft.practice.minDurationSec = next))}
              />
              <Stepper
                label={t('opt.practice.maxDuration')}
                suffix="s"
                value={s.practice.maxDurationSec}
                min={20}
                max={300}
                step={5}
                onChange={(next) => void patch((draft) => void (draft.practice.maxDurationSec = next))}
              />
              <Stepper
                label={t('opt.practice.gap')}
                suffix="ms"
                value={s.practice.delayMinMs}
                min={0}
                max={30_000}
                step={250}
                onChange={(next) => void patch((draft) => void (draft.practice.delayMinMs = next))}
              />
              <Stepper
                label={t('opt.practice.hearts')}
                hint={t('opt.practice.heartsHint')}
                value={s.practice.heartsLeft}
                min={0}
                max={5}
                onChange={(next) => void patch((draft) => void (draft.practice.heartsLeft = next))}
              />
              <Stepper
                label={t('opt.practice.dailyGoal')}
                hint={t('opt.practice.dailyGoalHint')}
                suffix="XP"
                value={s.practice.dailyXpGoal}
                min={10}
                max={500}
                step={10}
                onChange={(next) => void patch((draft) => void (draft.practice.dailyXpGoal = next))}
              />
              <Stepper
                label={t('opt.practice.budget')}
                hint={t('opt.practice.budgetHint')}
                suffix="XP"
                value={s.practice.xpBudget}
                min={0}
                max={2000}
                step={25}
                onChange={(next) => void patch((draft) => void (draft.practice.xpBudget = next))}
              />
              <Toggle
                label={t('opt.practice.stopOnError')}
                hint={t('opt.practice.stopOnErrorHint')}
                checked={s.practice.stopOnError}
                onChange={(next) => void patch((draft) => void (draft.practice.stopOnError = next))}
              />
            </Card>

            <Card tone={s.practice.stopAtDailyGoal ? 'green' : 'default'}>
              <CardHeader
                title={t('opt.practice.goalTitle')}
                subtitle={t('opt.practice.goalSub')}
                icon={<DuoArt name="target" size={22} />}
                action={
                  <Toggle
                    label=""
                    checked={s.practice.stopAtDailyGoal}
                    onChange={(next) => void patch((draft) => void (draft.practice.stopAtDailyGoal = next))}
                  />
                }
              />
              <p className="hint">
                {s.practice.stopAtDailyGoal
                  ? t('opt.practice.goalOn', { goal: s.practice.dailyXpGoal })
                  : t('opt.practice.goalOff', { n: s.practice.sessions })}
              </p>
              <p className="hint">{t('opt.practice.goalCounting', { today: todayXp })}</p>
            </Card>

            <Card tone={s.practice.autoSize ? 'purple' : 'default'}>
              <CardHeader
                title={t('opt.practice.autoSize')}
                subtitle={t('opt.practice.autoSizeHint')}
                icon={<SparkleIcon size={18} />}
                action={
                  <Toggle
                    label=""
                    checked={s.practice.autoSize}
                    onChange={(next) => void patch((draft) => void (draft.practice.autoSize = next))}
                  />
                }
              />
              <p className="hint">
                {s.practice.autoSize ? t('opt.practice.autoSizeOn') : t('opt.practice.autoSizeOff')}
              </p>
            </Card>

            <Card tone="blue">
              <div className="callout">
                <ClockIcon size={18} />
                <p>
                  {t('opt.practice.eta', {
                    n: s.practice.sessions,
                    minutes: Math.round(
                      (s.practice.sessions * ((s.practice.minDurationSec + s.practice.maxDurationSec) / 2 + 3.5)) / 60,
                    ),
                  })}
                </p>
              </div>
            </Card>
          </div>
        ) : null}

        {section === 'answers' ? (
          <div className="stack">
            <Card tone="gold">
              <CardHeader title={t('opt.answers.readTitle')} subtitle={t('opt.answers.sub')} icon={<DuoArt name="warning" size={22} />} />
              <p className="hint">{t('opt.answers.readBody')}</p>
            </Card>

            <Card>
              <CardHeader
                title={t('opt.answers.title')}
                subtitle={t('opt.answers.enableHint')}
                icon={<DuoArt name="key" size={22} />}
                action={
                  <Toggle
                    label=""
                    checked={s.answers.enabled}
                    onChange={(next) => void patch((draft) => void (draft.answers.enabled = next))}
                  />
                }
              />
              <div className="kv">
                <div>
                  <span>{t('opt.answers.cap')}</span>
                  <b>{s.answers.maxPerLesson === 0 ? '—' : s.answers.maxPerLesson}</b>
                </div>
                <div>
                  <span>{t('opt.answers.think')}</span>
                  <b>{(s.answers.thinkMs / 1000).toFixed(1)}s</b>
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader title={t('opt.answers.sourceTitle')} subtitle={t('opt.answers.sourceSub')} icon={<DuoArt name="console" size={22} />} />
              <Toggle
                label={t('opt.answers.fromPayload')}
                hint={t('opt.answers.fromPayloadHint')}
                checked={s.answers.fromPayload}
                disabled={!s.answers.enabled}
                onChange={(next) => void patch((draft) => void (draft.answers.fromPayload = next))}
              />
              <Toggle
                label={t('opt.answers.learnFromSkip')}
                hint={t('opt.answers.learnFromSkipHint')}
                checked={s.answers.learnFromSkip}
                disabled={!s.answers.enabled}
                onChange={(next) => void patch((draft) => void (draft.answers.learnFromSkip = next))}
              />
              {!s.answers.fromPayload && !s.answers.learnFromSkip ? (
                <p className="hint">{t('opt.answers.noSource')}</p>
              ) : null}            </Card>

            <Card>
              <CardHeader title={t('opt.answers.behaviourTitle')} subtitle={t('opt.answers.behaviourSub')} icon={<DuoArt name="sliders" size={22} />} />
              <Stepper
                label={t('opt.answers.think')}
                hint={t('opt.answers.thinkHint')}
                suffix="ms"
                value={s.answers.thinkMs}
                min={0}
                max={8000}
                step={100}
                disabled={!s.answers.enabled}
                onChange={(next) => void patch((draft) => void (draft.answers.thinkMs = next))}
              />
              <Stepper
                label={t('opt.answers.cap')}
                hint={t('opt.answers.capHint')}
                value={s.answers.maxPerLesson}
                min={0}
                max={60}
                step={5}
                disabled={!s.answers.enabled}
                onChange={(next) => void patch((draft) => void (draft.answers.maxPerLesson = next))}
              />
              <Toggle
                label={t('opt.answers.autoSubmit')}
                hint={t('opt.answers.autoSubmitHint')}
                checked={s.answers.autoSubmit}
                disabled={!s.answers.enabled}
                onChange={(next) => void patch((draft) => void (draft.answers.autoSubmit = next))}
              />
            </Card>

            <Card>
              <CardHeader
                title={t('opt.answers.bookTitle')}
                subtitle={t('opt.answers.bookSub')}
                icon={<DuoArt name="archive" size={22} />}
                action={
                  answers && answers.count > 0 ? (
                    <Button size="sm" variant="ghost" icon={<TrashIcon size={15} />} onClick={() => void clearAnswerBook()}>
                      {t('opt.answers.bookClear')}
                    </Button>
                  ) : null
                }
              />
              {answers && answers.count > 0 ? (
                <>
                  <div className="kv">
                    <div>
                      <span>{t('opt.answers.bookTitle')}</span>
                      <b>{formatNumber(answers.count)}</b>
                    </div>
                  </div>
                  <ul className="answer-list">
                    {answers.recent.map((entry) => (
                      <li key={entry.prompt}>
                        <b>{entry.prompt}</b>
                        <em>{entry.text}</em>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <EmptyState icon={<DuoArt name="archive" size={28} />} title={t('opt.answers.bookTitle')} body={t('opt.answers.bookEmpty')} />
              )}
            </Card>

            <Card tone="blue">
              <CardHeader title={t('opt.answers.typesTitle')} icon={<DuoArt name="tasks" size={22} />} />
              <p className="hint">{t('opt.answers.typesSupported')}</p>
              <Divider />
              <p className="hint">{t('opt.answers.typesRefused')}</p>
            </Card>
          </div>
        ) : null}

        {section === 'rewards' ? (
          <div className="stack">
            <Card>
              <CardHeader
                title={t('opt.rewards.title')}
                subtitle={t('opt.rewards.sub')}
                icon={<DuoArt name="gem" size={24} />}
                action={
                  <Toggle
                    label=""
                    checked={s.rewards.enabled}
                    onChange={(next) => void patch((draft) => void (draft.rewards.enabled = next))}
                  />
                }
              />
              <Stepper
                label={t('opt.rewards.maxClaims')}
                value={s.rewards.maxClaims}
                min={0}
                max={100}
                step={5}
                onChange={(next) => void patch((draft) => void (draft.rewards.maxClaims = next))}
              />
            </Card>

            <Card>
              <CardHeader
                title={t('opt.rewards.badges')}
                subtitle={t('opt.rewards.badgesSub')}
                icon={<DuoArt name="badge" size={22} />}
                action={
                  <Toggle
                    label=""
                    checked={s.badges.enabled}
                    onChange={(next) => void patch((draft) => void (draft.badges.enabled = next))}
                  />
                }
              />
              <Toggle
                label={t('opt.rewards.request')}
                hint={t('opt.rewards.requestHint')}
                checked={s.badges.request}
                onChange={(next) => void patch((draft) => void (draft.badges.request = next))}
              />
              <div className="field-grid">
                <Field
                  label={t('opt.rewards.timezone')}
                  value={s.badges.timezone}
                  onChange={(value) => void patch((draft) => void (draft.badges.timezone = value))}
                  hint={t('opt.rewards.timezoneHint')}
                />
                <Field
                  label={t('opt.rewards.years')}
                  value={s.badges.years.join(', ')}
                  onChange={(value) =>
                    void patch((draft) => {
                      draft.badges.years = value
                        .split(',')
                        .map((part) => Number(part.trim()))
                        .filter((year) => Number.isInteger(year) && year > 2000);
                    })
                  }
                  hint={t('opt.rewards.yearsHint')}
                />
              </div>
              <Stepper
                label={t('opt.rewards.perRun')}
                value={s.badges.maxRequestsPerRun}
                min={0}
                max={12}
                onChange={(next) => void patch((draft) => void (draft.badges.maxRequestsPerRun = next))}
              />
            </Card>

            <Card>
              <CardHeader
                title={t('opt.rewards.freeze')}
                subtitle={t('opt.rewards.freezeSub')}
                icon={<DuoArt name="freeze" size={22} />}
              />
              <Toggle
                label={t('opt.rewards.freezeToggle')}
                hint={t('opt.rewards.freezeHint')}
                checked={s.freeze.enabled}
                onChange={(next) => void patch((draft) => void (draft.freeze.enabled = next))}
              />
              <Stepper
                label={t('opt.rewards.target')}
                value={s.freeze.targetCount}
                min={0}
                max={2}
                onChange={(next) => void patch((draft) => void (draft.freeze.targetCount = next))}
              />
              <Toggle
                label={t('opt.rewards.insure')}
                hint={t('opt.rewards.insureHint')}
                checked={s.freeze.autoInsure}
                onChange={(next) => void patch((draft) => void (draft.freeze.autoInsure = next))}
              />
            </Card>
          </div>
        ) : null}

        {section === 'shop' ? (
          <div className="stack">
            <Card tone="gold">
              <CardHeader
                title={t('shop.title')}
                subtitle={t('shop.sub')}
                icon={<DuoArt name="gem" size={20} />}
                action={<Pill tone="gold">{t('shop.balance', { gems: state.profile?.gems ?? 0 })}</Pill>}
              />
              <p className="hint">{shop?.source === 'live' ? t('shop.live') : t('shop.reference')}</p>
              {shop?.error ? <p className="hint">{shop.error}</p> : null}
            </Card>

            <Card>
              {!shop ? (
                <p className="hint">{t('shop.loading')}</p>
              ) : shop.items.length === 0 ? (
                <p className="hint">{t('shop.empty')}</p>
              ) : (
                shop.items.map((item) => (
                  <div className="shop-row" key={item.id}>
                    <div className="shop-row__meta">
                      <b>{item.name}</b>
                      {item.note ? <span className="hint">{item.note}</span> : null}
                    </div>
                    <div className="shop-row__buy">
                      {item.priceGems !== null ? (
                        <Pill tone="gold">{t('shop.price', { gems: item.priceGems })}</Pill>
                      ) : null}
                      <Button
                        variant="secondary"
                        loading={shopBusy === item.id}
                        disabled={shopBusy !== null}
                        onClick={() => void buyShopItem(item.id)}
                      >
                        {t('shop.buy')}
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </Card>
          </div>
        ) : null}

        {section === 'activity' ? (
          <div className="stack">
            <WeeklyReport stats={state.stats} dailyGoal={s.practice.dailyXpGoal} />

            {forecast ? (
              <Card tone={forecast.tone === 'red' ? 'red' : forecast.tone === 'gold' ? 'gold' : 'green'}>
                <CardHeader
                  title={t('opt.activity.forecast')}
                  subtitle={t(forecast.headline.key as MessageKey, forecast.headline.vars)}
                  icon={<DuoArt name="streak" size={24} />}
                  action={
                    <Pill tone={forecast.slack > 0 ? 'green' : 'red'}>
                      {forecast.slack === 1 ? t('forecast.daysSlackOne') : t('forecast.daysSlack', { n: forecast.slack })}
                    </Pill>
                  }
                />
                <StreakForecastStrip forecast={forecast} />
              </Card>
            ) : null}

            <Card>
              <CardHeader
                title={t('opt.activity.heatmap')}
                subtitle={t('opt.activity.heatmapSub')}
                icon={<DuoArt name="heatmap" size={22} />}
                action={<Pill tone="green">{t('opt.activity.logged', { xp: formatNumber(state.stats.xp) })}</Pill>}
              />
              <div className="heat-wrap">
                <Heatmap data={heatCells} weeks={8} />
                <div className="heat-facts">
                  <div className="heat-fact">
                    <b>{heatFacts.activeDays}</b>
                    <span>{t('opt.activity.activeDays')}</span>
                  </div>
                  <div className="heat-fact">
                    <b>{formatNumber(heatFacts.best)}</b>
                    <span>{t('opt.activity.bestDay')}</span>
                  </div>
                  <div className="heat-fact">
                    <b>{formatNumber(heatFacts.average)}</b>
                    <span>{t('opt.activity.average')}</span>
                  </div>
                </div>
              </div>
            </Card>
            <Card>
              <CardHeader
                title={t('opt.activity.achievements')}
                subtitle={t('opt.activity.unlocked', { n: badgeCount.unlocked, total: badgeCount.total })}
                icon={<DuoArt name="badge" size={22} />}
                action={
                  <Pill tone={badgeCount.unlocked > 0 ? 'gold' : 'neutral'}>{Math.round(badgeCount.ratio * 100)}%</Pill>
                }
              />
              <AchievementGrid items={achievements} />
            </Card>

            <Card>
              <CardHeader
                title={t('opt.activity.history')}
                subtitle={t('opt.activity.historySub', { n: runs.length })}
                icon={<DuoArt name="log" size={22} />}
                action={
                  <Button size="sm" variant="secondary" icon={<DownloadIcon size={15} />} onClick={() => exportHistory(runs)}>
                    {t('common.export')}
                  </Button>
                }
              />
              {runs.length === 0 ? (
                <EmptyState icon={<DuoArt name="log" size={34} />} title={t('opt.activity.noRuns')} body={t('opt.activity.noRunsBody')} />
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
                title={t('opt.schedule.title')}
                subtitle={t('opt.schedule.sub')}
                icon={<DuoArt name="navSchedule" size={22} />}
                action={
                  <Toggle
                    label=""
                    checked={s.schedule.enabled}
                    onChange={(next) => void patch((draft) => void (draft.schedule.enabled = next))}
                  />
                }
              />
              <Stepper
                label={t('opt.schedule.interval')}
                suffix="min"
                value={s.schedule.intervalMinutes}
                min={15}
                max={1440}
                step={15}
                onChange={(next) => void patch((draft) => void (draft.schedule.intervalMinutes = next))}
              />
              <WeekdayPicker value={s.schedule.days} onChange={(next) => void patch((draft) => void (draft.schedule.days = next))} />
              <Toggle
                label={t('opt.schedule.runOnStartup')}
                hint={t('opt.schedule.runOnStartupHint')}
                checked={s.schedule.runOnStartup}
                onChange={(next) => void patch((draft) => void (draft.schedule.runOnStartup = next))}
              />
              <div className="next-run">
                <ClockIcon size={16} />
                <span>
                  {state.schedule.nextRunAt
                    ? t('opt.schedule.next', { when: formatRelative(state.schedule.nextRunAt) })
                    : t('opt.schedule.none')}
                </span>
              </div>
            </Card>

            <Card tone={s.schedule.guard.enabled ? 'green' : 'default'}>
              <CardHeader
                title={t('opt.schedule.guard')}
                subtitle={t('opt.schedule.guardSub')}
                icon={<DuoArt name="streak" size={24} />}
                action={
                  <Toggle
                    label=""
                    checked={s.schedule.guard.enabled}
                    onChange={(next) => void patch((draft) => void (draft.schedule.guard.enabled = next))}
                  />
                }
              />
              <div className="field-grid">
                <Stepper
                  label={t('opt.schedule.guardHour')}
                  suffix="h"
                  value={s.schedule.guard.hour}
                  min={0}
                  max={23}
                  onChange={(next) => void patch((draft) => void (draft.schedule.guard.hour = next))}
                />
                <Stepper
                  label={t('opt.schedule.guardMinute')}
                  suffix="min"
                  value={s.schedule.guard.minute}
                  min={0}
                  max={30}
                  step={30}
                  onChange={(next) => void patch((draft) => void (draft.schedule.guard.minute = next))}
                />
              </div>
              <p className="hint">{t('opt.schedule.guardHint')}</p>
              <div className="next-run">
                <ClockIcon size={16} />
                <span>
                  {s.schedule.guard.enabled
                    ? state.schedule.guardAt
                      ? t('opt.schedule.guardAt', { when: formatRelative(state.schedule.guardAt) })
                      : t('opt.schedule.guardTime')
                    : t('opt.schedule.guardOff')}
                </span>
              </div>
            </Card>

            <Card tone={s.schedule.watch.enabled ? 'blue' : 'default'}>
              <CardHeader
                title={t('opt.schedule.watch')}
                subtitle={t('opt.schedule.watchSub')}
                icon={<DuoArt name="bell" size={22} />}
                action={
                  <Toggle
                    label=""
                    checked={s.schedule.watch.enabled}
                    onChange={(next) => void patch((draft) => void (draft.schedule.watch.enabled = next))}
                  />
                }
              />
              <div className="field-grid">
                <Stepper
                  label={t('opt.schedule.guardHour')}
                  suffix="h"
                  value={s.schedule.watch.hour}
                  min={0}
                  max={23}
                  onChange={(next) => void patch((draft) => void (draft.schedule.watch.hour = next))}
                />
                <Stepper
                  label={t('opt.schedule.guardMinute')}
                  suffix="min"
                  value={s.schedule.watch.minute}
                  min={0}
                  max={30}
                  step={30}
                  onChange={(next) => void patch((draft) => void (draft.schedule.watch.minute = next))}
                />
              </div>
              <p className="hint">{t('opt.schedule.watchHint')}</p>
              <div className="next-run">
                <ClockIcon size={16} />
                <span>
                  {s.schedule.watch.enabled
                    ? state.schedule.watchAt
                      ? t('opt.schedule.watchAt', { when: formatRelative(state.schedule.watchAt) })
                      : t('opt.schedule.watchTime')
                    : t('opt.schedule.watchOff')}
                </span>
              </div>
            </Card>

            <Card tone={isPausedOn(s.schedule.pause, dayKey(Date.now())) ? 'gold' : 'default'}>
              <CardHeader
                title={t('opt.schedule.pause')}
                subtitle={t('opt.schedule.pauseSub')}
                icon={<DuoArt name="navSchedule" size={22} />}
                action={
                  <Toggle
                    label=""
                    checked={s.schedule.pause.enabled}
                    onChange={(next) => void patch((draft) => void (draft.schedule.pause.enabled = next))}
                  />
                }
              />
              <div className="field-grid">
                <Field
                  label={t('opt.schedule.pauseFrom')}
                  type="date"
                  value={s.schedule.pause.from}
                  onChange={(next) => void patch((draft) => void (draft.schedule.pause.from = next))}
                />
                <Field
                  label={t('opt.schedule.pauseTo')}
                  type="date"
                  value={s.schedule.pause.to}
                  onChange={(next) => void patch((draft) => void (draft.schedule.pause.to = next))}
                />
              </div>
              <p className="hint">{t('opt.schedule.pauseHint')}</p>
              {isPausedOn(s.schedule.pause, dayKey(Date.now())) ? (
                <p className="hint">{t('opt.schedule.pauseActive', { to: s.schedule.pause.to || '—' })}</p>
              ) : null}
            </Card>

            <Card>
              <CardHeader title={t('opt.schedule.quiet')} subtitle={t('opt.schedule.quietSub')} icon={<DuoArt name="moon" size={22} />} />
              <Toggle
                label={t('opt.schedule.quietToggle')}
                checked={s.schedule.quietHours.enabled}
                onChange={(next) => void patch((draft) => void (draft.schedule.quietHours.enabled = next))}
              />
              <div className="field-grid">
                <Stepper
                  label={t('opt.schedule.from')}
                  suffix="h"
                  value={s.schedule.quietHours.startHour}
                  min={0}
                  max={23}
                  onChange={(next) => void patch((draft) => void (draft.schedule.quietHours.startHour = next))}
                />
                <Stepper
                  label={t('opt.schedule.to')}
                  suffix="h"
                  value={s.schedule.quietHours.endHour}
                  min={0}
                  max={23}
                  onChange={(next) => void patch((draft) => void (draft.schedule.quietHours.endHour = next))}
                />
              </div>
            </Card>

            <Card>
              <CardHeader
                title={t('plan.title')}
                subtitle={t('plan.sub')}
                icon={<DuoArt name="target" size={22} />}
              />
              <PlanPreview
                settings={s}
                block={schedulerBlock}
                nextRunAt={state.schedule.nextRunAt}
              />
            </Card>
          </div>
        ) : null}

        {section === 'safety' ? (
          <div className="stack">
            <Card tone="gold">
              <CardHeader title={t('opt.safety.readTitle')} subtitle={t('opt.safety.readSub')} icon={<DuoArt name="warning" size={22} />} />
              <p className="hint">{t('opt.safety.readBody')}</p>
            </Card>

            <Card>
              <CardHeader
                title={t('opt.safety.behaviour')}
                subtitle={t('opt.safety.behaviourSub')}
                icon={<DuoArt name="navSafety" size={22} />}
              />
              <Toggle
                label={t('opt.safety.dryRun')}
                hint={t('opt.safety.dryRunHint')}
                checked={s.behavior.dryRun}
                onChange={(next) => void patch((draft) => void (draft.behavior.dryRun = next))}
              />
              <Toggle
                label={t('opt.safety.notifications')}
                hint={t('opt.safety.notificationsHint')}
                checked={s.behavior.notifications}
                onChange={(next) => void patch((draft) => void (draft.behavior.notifications = next))}
              />
              <Toggle
                label={t('opt.safety.badge')}
                hint={t('opt.safety.badgeHint')}
                checked={s.behavior.badgeText}
                onChange={(next) => void patch((draft) => void (draft.behavior.badgeText = next))}
              />
              <Stepper
                label={t('opt.safety.cooldown')}
                hint={t('opt.safety.cooldownHint')}
                suffix="s"
                value={s.behavior.cooldownSeconds}
                min={0}
                max={600}
                step={15}
                onChange={(next) => void patch((draft) => void (draft.behavior.cooldownSeconds = next))}
              />
              <Toggle
                label={t('opt.safety.keepAlive')}
                hint={t('opt.safety.keepAliveHint')}
                checked={s.behavior.keepServiceWorkerAlive}
                onChange={(next) => void patch((draft) => void (draft.behavior.keepServiceWorkerAlive = next))}
              />
              <Toggle
                label={t('opt.safety.runOnLesson')}
                hint={t('opt.safety.runOnLessonHint')}
                checked={s.behavior.runOnLesson}
                onChange={(next) => void patch((draft) => void (draft.behavior.runOnLesson = next))}
              />
            </Card>

            <Card tone={state.pacing.rateLimitHits > 0 ? 'gold' : 'default'}>
              <CardHeader
                title={t('opt.safety.pacing')}
                subtitle={t('opt.safety.pacingSub')}
                icon={<DuoArt name="gauge" size={22} />}
                action={
                  <Pill tone={state.pacing.rateLimitHits > 0 ? 'gold' : 'green'}>
                    ×{state.pacing.factor}
                  </Pill>
                }
              />
              <div className="kv">
                <div>
                  <span>{t('opt.safety.pacingFactor')}</span>
                  <b>×{state.pacing.factor}</b>
                </div>
                <div>
                  <span>{t('opt.safety.pacingHits')}</span>
                  <b>{state.pacing.rateLimitHits}</b>
                </div>
              </div>
              <p className="hint">
                {state.pacing.holdUntil
                  ? t('opt.safety.pacingHold', { when: formatRelative(state.pacing.holdUntil) })
                  : state.pacing.rateLimitHits === 0
                    ? t('opt.safety.pacingIdle')
                    : t('opt.safety.pacingNote')}
              </p>
            </Card>

            <Card tone="red">
              <CardHeader title={t('opt.safety.pro')} subtitle={t('opt.safety.proSub')} icon={<DuoArt name="plug" size={22} />} />
              <p className="hint">{t('opt.safety.proBody')}</p>
              <Toggle
                label={t('opt.safety.proEnable')}
                checked={s.pro.enabled}
                onChange={(next) => void patch((draft) => void (draft.pro.enabled = next))}
              />
              <Toggle
                label={t('opt.safety.proRisk')}
                hint={t('opt.safety.proRiskHint')}
                checked={s.pro.acknowledgeRisk}
                onChange={(next) => void patch((draft) => void (draft.pro.acknowledgeRisk = next))}
              />
              <Divider />
              <Toggle
                label={t('opt.safety.super')}
                checked={s.super.enabled}
                onChange={(next) => void patch((draft) => void (draft.super.enabled = next))}
              />
              <Toggle
                label={t('opt.safety.boost')}
                checked={s.boost.enabled}
                onChange={(next) => void patch((draft) => void (draft.boost.enabled = next))}
              />
            </Card>
          </div>
        ) : null}

        {section === 'appearance' ? (
          <div className="stack">
            <Card>
              <CardHeader title={t('opt.appearance.theme')} subtitle={t('opt.appearance.themeSub')} icon={<DuoArt name="navAppearance" size={22} />} />
              <Segmented<ThemePreference>
                value={s.ui.theme}
                onChange={(value) => void patch((draft) => void (draft.ui.theme = value))}
                options={[
                  { value: 'system', label: t('opt.appearance.system'), icon: <GlobeIcon size={14} /> },
                  { value: 'light', label: t('opt.appearance.light'), icon: <SunIcon size={14} /> },
                  { value: 'dark', label: t('opt.appearance.dark'), icon: <MoonIcon size={14} /> },
                ]}
              />
              <Divider />
              <Segmented<Locale>
                label={t('opt.appearance.language')}
                value={s.ui.locale}
                onChange={(value) => void patch((draft) => void (draft.ui.locale = value))}
                options={[
                  { value: 'vi', label: 'Tiếng Việt' },
                  { value: 'en', label: 'English' },
                ]}
              />
              <p className="hint">{t('opt.appearance.languageHint')}</p>
              <Toggle
                label={t('opt.appearance.reduceMotion')}
                hint={t('opt.appearance.reduceMotionHint')}
                checked={s.ui.reduceMotion}
                onChange={(next) => void patch((draft) => void (draft.ui.reduceMotion = next))}
              />
            </Card>

            <Card>
              <CardHeader title={t('opt.appearance.palette')} subtitle={t('opt.appearance.paletteSub')} icon={<DuoArt name="palette" size={22} />} />
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
                title={t('opt.data.history')}
                subtitle={t('opt.data.historySub', { runs: formatNumber(state.stats.runs), xp: formatNumber(state.stats.xp) })}
                icon={<DuoArt name="log" size={22} />}
                action={
                  <Button size="sm" variant="ghost" icon={<TrashIcon size={15} />} onClick={() => void app.clearHistory()}>
                    {t('common.clear')}
                  </Button>
                }
              />
              <Bars data={state.stats.daily.map((point) => ({ label: point.day, value: point.xp }))} height={84} tone="blue" />
              <Divider />
              <div className="kv">
                <div>
                  <span>{t('opt.data.rewardsClaimed')}</span>
                  <b>{formatNumber(state.stats.rewards)}</b>
                </div>
                <div>
                  <span>{t('opt.data.gems')}</span>
                  <b>{formatNumber(state.stats.gems)}</b>
                </div>
                <div>
                  <span>{t('opt.data.clean')}</span>
                  <b>{state.stats.successRate}%</b>
                </div>
                <div>
                  <span>{t('opt.data.last')}</span>
                  <b>{state.stats.lastRunAt ? formatRelative(state.stats.lastRunAt) : t('common.dash')}</b>
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader title={t('opt.data.backup')} subtitle={t('opt.data.backupSub')} icon={<DuoArt name="archive" size={22} />} />
              <div className="row-actions">
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<DownloadIcon size={15} />}
                  onClick={async () => {
                    const result = await bridge.send<{ json: string }>({ type: 'settings/export' });
                    if (result.ok) {
                      await navigator.clipboard?.writeText(result.value.json).catch(() => undefined);
                      app.toast('success', t('opt.data.copied'));
                    }
                  }}
                >
                  {t('common.export')}
                </Button>
                <Button size="sm" variant="ghost" icon={<UploadIcon size={15} />} onClick={() => go('data')}>
                  {t('opt.data.importBelow')}
                </Button>
                <Button size="sm" variant="danger" icon={<TrashIcon size={15} />} onClick={() => void app.resetSettings()}>
                  {t('opt.data.resetAll')}
                </Button>
              </div>
              <Field
                label={t('opt.data.paste')}
                value={importDraft}
                onChange={setImportDraft}
                hint={t('opt.data.pasteHint')}
                action={
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      const result = await bridge.send({ type: 'settings/import', payload: importDraft });
                      app.toast(result.ok ? 'success' : 'error', result.ok ? t('opt.data.imported') : t('opt.data.invalid'));
                    }}
                  >
                    {t('common.import')}
                  </Button>
                }
              />
            </Card>

            <Card>
              <CardHeader title={t('opt.data.recent')} subtitle={t('opt.data.recentSub')} icon={<DuoArt name="console" size={22} />} />
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
                  <p>{t('opt.about.tagline')}</p>
                  <div className="about__tags">
                    <Pill tone="green">{t('opt.about.tagMv3')}</Pill>
                    <Pill tone="blue">{t('opt.about.tagTs')}</Pill>
                    <Pill tone="purple">{t('opt.about.tagLocal')}</Pill>
                    <Pill tone="neutral">{t('opt.about.tagTelemetry')}</Pill>
                  </div>
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader title={t('opt.about.what')} subtitle={t('opt.about.whatSub')} icon={<DuoArt name="navAbout" size={22} />} />
              <div className="about__grid">
                <div>
                  <b>{t('task.practice')}</b>
                  <span>{t('opt.about.practiceBody')}</span>
                </div>
                <div>
                  <b>{t('task.rewards')}</b>
                  <span>{t('opt.about.rewardsBody')}</span>
                </div>
                <div>
                  <b>{t('task.badge')}</b>
                  <span>{t('opt.about.badgesBody')}</span>
                </div>
                <div>
                  <b>{t('task.freeze')}</b>
                  <span>{t('opt.about.freezeBody')}</span>
                </div>
                <div>
                  <b>{t('opt.schedule.title')}</b>
                  <span>{t('opt.about.schedulerBody')}</span>
                </div>
                <div>
                  <b>{t('opt.activity.achievements')}</b>
                  <span>{t('opt.about.observabilityBody')}</span>
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader title={t('opt.about.shortcuts')} icon={<DuoArt name="keyboard" size={22} />} />
              <div className="kv">
                <div>
                  <span>{t('opt.about.shortcutRun')}</span>
                  <b>
                    <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>D</kbd>
                  </b>
                </div>
                <div>
                  <span>{t('opt.about.shortcutConsole')}</span>
                  <b>
                    <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>C</kbd>
                  </b>
                </div>
                <div>
                  <span>{t('opt.about.shortcutPalette')}</span>
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
                <p>{t('opt.about.disclaimer')}</p>
              </div>
            </Card>
          </div>
        ) : null}

        <footer className="options__footer">
          <span>
            <CheckIcon size={14} /> {t('opt.autosave')}
          </span>
          <span className="u-faint">{t('opt.runsRecorded', { n: state.stats.runs })}</span>
        </footer>
      </main>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} actions={paletteActions} />
      <ToastStack items={app.toasts} onDismiss={app.dismissToast} />
    </div>
  );
}
