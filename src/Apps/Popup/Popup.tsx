/**
 * Popup.tsx — the 384px dashboard.
 *
 * Layout: identity header -> tab body (Home / Tasks / Log) -> bottom tab bar,
 * mirroring Duolingo's own mobile navigation rhythm.
 */
import { useEffect, useMemo, useState } from 'react';
import { formatCompact, formatNumber, languageName } from '@Shared/Utils/Format';
import { formatDuration, formatRelative } from '@Shared/Utils/Time';
import { forecastFromProfile } from '@Shared/Utils/Forecast';
import { RUN_PRESETS } from '@Shared/Presets';
import type { Settings, TaskKey } from '@Shared/Types';
import { useAppState } from '@Ui/Hooks/UseAppState';
import { useTheme } from '@Ui/Hooks/UseTheme';
import { useLocale } from '@Ui/Hooks/UseLocale';
import { BrandMark } from '@Ui/Components/BrandMark';
import { Button, IconButton } from '@Ui/Components/Button';
import { Card, CardHeader } from '@Ui/Components/Card';
import { ProgressBar, Pill, Ring, Skeleton, Stat, Bars, EmptyState, Divider } from '@Ui/Components/Display';
import { StreakForecastStrip } from '@Ui/Components/Insights';
import { Toggle } from '@Ui/Components/Controls';
import { LogConsole } from '@Ui/Components/LogConsole';
import { ToastStack } from '@Ui/Components/Toast';
import {
  AlertIcon,
  BoltIcon,
  ChartIcon,
  CheckIcon,
  ClockIcon,
  FlameIcon,
  GemIcon,
  HeartIcon,
  HistoryIcon,
  KeyIcon,
  OwlIcon,
  PlayIcon,
  RefreshIcon,
  RocketIcon,
  SlidersIcon,
  SparkleIcon,
  StopIcon,
  TargetIcon,
  TrophyIcon,
} from '@Ui/Icons/Icons';
import './Popup.css';

type Tab = 'home' | 'tasks' | 'log';

const TASK_META: Record<TaskKey, { label: string; hint: string; icon: JSX.Element }> = {
  practice: { label: 'Practice sessions', hint: 'Open and finish lessons for XP', icon: <BoltIcon size={18} /> },
  rewards: { label: 'Reward sweep', hint: 'Claim chests, quests and prizes', icon: <GemIcon size={18} /> },
  badge: { label: 'Monthly badges', hint: 'Report missing badges', icon: <TrophyIcon size={18} /> },
  boost: { label: 'Double XP boost', hint: 'Needs the PRO bridge', icon: <SparkleIcon size={18} /> },
  super: { label: 'Super activation', hint: 'Needs the PRO bridge', icon: <RocketIcon size={18} /> },
  freeze: { label: 'Streak freeze', hint: 'Top up freeze inventory', icon: <TargetIcon size={18} /> },
};

export function Popup() {
  const app = useAppState();
  const theme = app.state?.settings.ui.theme;
  useTheme(theme);
  useLocale(app.state?.settings.ui.locale);

  const [tab, setTab] = useState<Tab>('home');
  const [now, setNow] = useState(Date.now());

  const running = app.state?.run.phase === 'running' || app.state?.run.phase === 'preparing' || app.state?.run.phase === 'finishing';

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);

  if (app.loading || !app.state) {
    return (
      <div className="popup popup--loading">
        <Skeleton height={54} />
        <Skeleton height={120} />
        <Skeleton height={80} />
        <Skeleton height={140} />
      </div>
    );
  }

  const { state } = app;
  const { profile, run, stats, settings, token } = state;
  const elapsed = run.startedAt ? now - run.startedAt : 0;
  const todayXp = stats.daily[stats.daily.length - 1]?.xp ?? 0;
  const dailyGoal = Math.max(1, settings.practice.dailyXpGoal);
  const atRisk = (profile?.streak ?? 0) > 0 && todayXp === 0 && new Date().getHours() >= 19;
  const forecast = forecastFromProfile(profile, todayXp, dailyGoal);
  const failedTasks = [...new Set((state.lastSummary?.tasks ?? []).filter((task) => task.status === 'failed').map((task) => task.task))];

  return (
    <div className="popup">
      <header className="topbar">
        <div className="topbar__brand">
          <BrandMark size={34} />
          <div className="topbar__text">
            <strong>Duo Assist</strong>
            <span>v{state.version}</span>
          </div>
        </div>
        <div className="topbar__actions">
          <IconButton label="Refresh profile" onClick={() => void app.refreshProfile()}>
            <RefreshIcon size={18} />
          </IconButton>
          <IconButton label="Settings" onClick={() => openOptions()}>
            <SlidersIcon size={18} />
          </IconButton>
        </div>
      </header>

      <main className="popup__body">
        {!token.valid ? (
          <Card tone="gold" className="notice">
            <div className="notice__row">
              <KeyIcon size={18} />
              <div>
                <strong>No live session</strong>
                <p>{token.message}</p>
              </div>
            </div>
            <Button
              size="sm"
              variant="secondary"
              full
              onClick={() => openOptions()}
            >
              Fix in settings
            </Button>
          </Card>
        ) : null}

        {tab === 'home' ? (
          <>
            {atRisk ? (
              <Card tone="gold" className="notice">
                <div className="notice__row">
                  <FlameIcon size={18} />
                  <div>
                    <strong>Streak at risk</strong>
                    <p>
                      No XP today and your {profile?.streak}-day streak is on the line. One short lesson keeps it alive.
                    </p>
                  </div>
                </div>
                <Button size="sm" variant="secondary" full onClick={() => void app.startRun()}>
                  Save my streak
                </Button>
              </Card>
            ) : null}

            <section className="identity">
              <div className="identity__avatar">{profile?.displayName?.charAt(0).toUpperCase() ?? '?'}</div>
              <div className="identity__text">
                <div className="identity__name">
                  {profile ? `@${profile.username}` : 'Not signed in'}
                  {profile?.hasPlus ? <Pill tone="purple">Super</Pill> : null}
                </div>
                <div className="identity__meta">
                  {profile ? (
                    <>
                      {languageName(profile.learningLanguage)} from {languageName(profile.fromLanguage)}
                      <span className="dot-sep" />
                      {profile.league ?? 'No league'}
                    </>
                  ) : (
                    'Sign in at duolingo.com to load your profile'
                  )}
                </div>
              </div>
              <div className="identity__streak">
                <FlameIcon size={16} />
                <b>{profile?.streak ?? 0}</b>
              </div>
            </section>

            <div className="stat-grid">
              <Stat icon={<BoltIcon size={16} />} value={formatCompact(profile?.totalXp ?? 0)} label="Total XP" tone="gold" />
              <Stat icon={<GemIcon size={16} />} value={formatCompact(profile?.gems ?? 0)} label="Gems" tone="blue" />
              <Stat
                icon={<HeartIcon size={16} />}
                value={`${profile?.hearts ?? 5}/${profile?.maxHearts ?? 5}`}
                label="Hearts"
                tone="red"
              />
            </div>

            <Card tone={running ? 'blue' : 'default'} className="run-card">
              <div className="run-card__head">
                <div>
                  <span className="u-upper u-faint">{running ? 'Running now' : 'Automation'}</span>
                  <h2 className="run-card__title">
                    {running ? run.currentLabel : run.phase === 'done' ? 'All done' : run.phase === 'failed' ? 'Last run failed' : 'Ready to go'}
                  </h2>
                </div>
                {running ? <Pill tone="blue">{formatDuration(elapsed)}</Pill> : settings.behavior.dryRun ? <Pill tone="gold">Dry run</Pill> : null}
              </div>

              {running || run.phase === 'done' ? (
                <ProgressBar value={running ? run.progress : 1} animated={running} height={16} />
              ) : (
                <div className="run-card__plan">
                  <Pill tone="green">{settings.practice.sessions} sessions</Pill>
                  <Pill tone="blue">{settings.rewards.enabled ? 'rewards' : 'no rewards'}</Pill>
                  <Pill tone="gold">{settings.freeze.enabled ? 'freeze' : 'no freeze'}</Pill>
                  <Pill tone="neutral">{settings.schedule.enabled ? 'scheduled' : 'manual'}</Pill>
                </div>
              )}

              <div className="run-card__meta">
                {running ? (
                  <span>
                    {Math.round(run.progress * 100)}% · {run.trigger ?? 'manual'}
                  </span>
                ) : state.lastSummary ? (
                  <span>
                    Last run {formatRelative(state.lastSummary.finishedAt)} · +{state.lastSummary.xpGained} XP ·{' '}
                    {state.lastSummary.rewardsClaimed} rewards
                  </span>
                ) : (
                  <span>{settings.practice.sessions} sessions queued · {settings.behavior.dryRun ? 'dry run' : 'live'}</span>
                )}
              </div>

              <div className="run-card__actions">
                {running ? (
                  <Button variant="danger" full icon={<StopIcon size={16} />} onClick={() => void app.cancelRun()}>
                    Cancel run
                  </Button>
                ) : (
                  <Button full size="lg" icon={<PlayIcon size={16} />} onClick={() => void app.startRun()}>
                    Start automation
                  </Button>
                )}
              </div>

              {!running && failedTasks.length > 0 ? (
                <button type="button" className="run-card__retry" onClick={() => void app.startRun(failedTasks)}>
                  <RefreshIcon size={13} />
                  Retry {failedTasks.length} failed task{failedTasks.length === 1 ? '' : 's'} only
                </button>
              ) : null}
            </Card>

            <Card>
              <CardHeader
                title="This fortnight"
                subtitle={`${formatNumber(stats.xp)} XP across ${stats.runs} runs`}
                icon={<ChartIcon size={18} />}
                action={<Pill tone="green">{stats.successRate}% ok</Pill>}
              />
              <Bars data={stats.daily.map((point) => ({ label: point.day, value: point.xp }))} height={72} />
              <div className="bars-legend">
                <span>14 days ago</span>
                <span>Today</span>
              </div>
            </Card>

            <div className="goal-row">
              <Card className="goal-row__ring">
                <Ring value={Math.min(1, todayXp / dailyGoal)} size={84} tone="green">
                  <div className="ring-label">
                    <b>{todayXp}</b>
                    <span>of {dailyGoal}</span>
                  </div>
                </Ring>
                <div className="goal-row__caption">
                  <strong>Daily goal</strong>
                  <span>{todayXp >= dailyGoal ? 'Reached — nice' : `${dailyGoal - todayXp} XP to go`}</span>
                </div>
              </Card>
              <Card className="goal-row__streak">
                <div className="streak-big">
                  <FlameIcon size={22} />
                  <b>{profile?.streak ?? 0}</b>
                </div>
                <span className="u-upper u-faint">Day streak</span>
                <div className="freeze-dots">
                  {[0, 1].map((index) => (
                    <span key={index} className={index < (profile?.streakFreezes ?? 0) ? 'is-on' : ''} />
                  ))}
                </div>
                <span className="u-faint">{(profile?.streakFreezes ?? 0)} freeze(s) ready</span>
              </Card>
            </div>

            <Card>
              <CardHeader
                title="Streak safety"
                subtitle={forecast.headline}
                icon={<FlameIcon size={18} />}
                action={<Pill tone={forecast.slack > 0 ? 'green' : 'red'}>{forecast.slack}d slack</Pill>}
              />
              <StreakForecastStrip forecast={forecast} dense showHeadline={false} />
            </Card>
          </>
        ) : null}

        {tab === 'tasks' ? (
          <>
            <Card>
              <CardHeader title="Run shape" subtitle="Reshape the next run in one tap" icon={<SparkleIcon size={18} />} />
              <div className="preset-row">
                {RUN_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className="preset"
                    onClick={() => void app.patchSettings((draft) => preset.apply(draft))}
                  >
                    <b>{preset.label}</b>
                    <span>{preset.hint}</span>
                  </button>
                ))}
              </div>
            </Card>

            <Card>
              <CardHeader
                title="Run plan"
                subtitle="What the next run will do, in order"
                icon={<RocketIcon size={18} />}
                action={<Pill tone="blue">{Object.values(settings).length > 0 ? 'Live' : 'Idle'}</Pill>}
              />
              <div className="task-list">
                {(Object.keys(TASK_META) as TaskKey[]).map((key) => {
                  const meta = TASK_META[key];
                  const enabled = isTaskEnabled(key, settings);
                  return (
                    <div key={key} className={`task-row${enabled ? '' : ' is-off'}`}>
                      <span className={`task-row__icon${enabled ? ' is-on' : ''}`}>{meta.icon}</span>
                      <div className="task-row__text">
                        <strong>{meta.label}</strong>
                        <span>{meta.hint}</span>
                      </div>
                      <span className={`task-row__state${enabled ? ' is-on' : ''}`}>
                        {enabled ? <CheckIcon size={16} /> : <span className="task-row__dash">—</span>}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card>
              <CardHeader title="Quick toggles" subtitle="Changes save instantly" icon={<SlidersIcon size={18} />} />
              <Toggle
                label="Dry run"
                hint="Simulate the plan without touching your account"
                checked={settings.behavior.dryRun}
                onChange={(next) => void app.patchSettings((draft) => void (draft.behavior.dryRun = next))}
              />
              <Toggle
                label="Reward sweep"
                hint="Claim everything waiting in your account"
                checked={settings.rewards.enabled}
                onChange={(next) => void app.patchSettings((draft) => void (draft.rewards.enabled = next))}
              />
              <Toggle
                label="Streak freeze"
                hint={`Keep ${settings.freeze.targetCount} in inventory`}
                checked={settings.freeze.enabled}
                onChange={(next) => void app.patchSettings((draft) => void (draft.freeze.enabled = next))}
              />
              <Toggle
                label="Scheduled runs"
                hint={`Every ${settings.schedule.intervalMinutes} minutes`}
                checked={settings.schedule.enabled}
                onChange={(next) => void app.patchSettings((draft) => void (draft.schedule.enabled = next))}
              />
            </Card>
          </>
        ) : null}

        {tab === 'log' ? (
          <Card>
            <CardHeader
              title="Live console"
              subtitle={run.currentLabel}
              icon={<HistoryIcon size={18} />}
              action={
                <IconButton label="Clear log" onClick={() => void app.clearLogs()}>
                  <AlertIcon size={16} />
                </IconButton>
              }
            />
            <LogConsole logs={state.logs} height={330} />
          </Card>
        ) : null}

        <Divider />
        <footer className="popup__footer">
          <ClockIcon size={14} />
          <span>
            {settings.schedule.enabled
              ? state.schedule.nextRunAt
                ? `Next run ${formatRelative(state.schedule.nextRunAt)}`
                : 'Schedule armed'
              : 'Scheduler off'}
          </span>
          <span className="dot-sep" />
          <span>{daySummary(settings.schedule.days)}</span>
          <span className="dot-sep" />
          <span>{formatNumber(stats.runs)} runs</span>
        </footer>
      </main>

      <nav className="tabbar" aria-label="Sections">
        <TabButton active={tab === 'home'} onClick={() => setTab('home')} icon={<TargetIcon size={18} />} label="Home" />
        <TabButton active={tab === 'tasks'} onClick={() => setTab('tasks')} icon={<RocketIcon size={18} />} label="Tasks" />
        <TabButton active={tab === 'log'} onClick={() => setTab('log')} icon={<HistoryIcon size={18} />} label="Log" />
      </nav>

      <ToastStack items={app.toasts} onDismiss={app.dismissToast} />
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: JSX.Element; label: string }) {
  return (
    <button type="button" className={`tabbar__item${active ? ' is-active' : ''}`} onClick={onClick} aria-current={active}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

function isTaskEnabled(key: TaskKey, settings: Settings): boolean {
  switch (key) {
    case 'practice':
      return settings.practice.enabled && settings.practice.sessions > 0;
    case 'rewards':
      return settings.rewards.enabled;
    case 'badge':
      return settings.badges.enabled;
    case 'freeze':
      return settings.freeze.enabled;
    case 'super':
      return settings.super.enabled;
    case 'boost':
      return settings.boost.enabled;
    default:
      return false;
  }
}

/** Opens the options page when running as an extension; no-op in preview. */
export function openOptions(): void {
  if (typeof chrome !== 'undefined' && chrome.runtime?.openOptionsPage) {
    void chrome.runtime.openOptionsPage();
  }
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "every day" / "Mon Wed Fri" — compact enough for the popup footer. */
function daySummary(days: number[]): string {
  if (days.length === 0) return 'no days';
  if (days.length === 7) return 'every day';
  return days.map((day) => DAY_NAMES[day] ?? '?').join(' ');
}
