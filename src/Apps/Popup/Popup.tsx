// Copyright github.com/nguyenphanno © 2026. All rights reserved
/**
 * Popup.tsx — the 384px dashboard.
 *
 * Layout: identity header -> tab body (Home / Tasks / Log) -> bottom tab bar,
 * mirroring Duolingo's own mobile navigation rhythm.
 *
 * All copy comes from the message catalogue, so the whole surface switches
 * language without a reload.
 */
import { useEffect, useState } from 'react';
import { formatCompact, formatNumber, languageName } from '@Shared/Utils/Format';
import { formatDuration, formatRelative } from '@Shared/Utils/Time';
import { forecastFromProfile } from '@Shared/Utils/Forecast';
import { RUN_PRESETS } from '@Shared/Presets';
import type { RunTrigger, Settings, TaskKey } from '@Shared/Types';
import { useAppState } from '@Ui/Hooks/UseAppState';
import { useTheme } from '@Ui/Hooks/UseTheme';
import { useLocale } from '@Ui/Hooks/UseLocale';
import { useT, tp } from '@Ui/I18n/I18n';
import type { MessageKey } from '@Ui/I18n/Messages';
import { BrandMark } from '@Ui/Components/BrandMark';
import { Button, IconButton } from '@Ui/Components/Button';
import { Card, CardHeader } from '@Ui/Components/Card';
import { ProgressBar, Pill, Ring, Skeleton, Stat, Bars, Divider } from '@Ui/Components/Display';
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

const TASK_META: Record<TaskKey, { label: MessageKey; hint: MessageKey; icon: JSX.Element }> = {
  practice: { label: 'task.practice', hint: 'task.practice.hint', icon: <BoltIcon size={18} /> },
  rewards: { label: 'task.rewards', hint: 'task.rewards.hint', icon: <GemIcon size={18} /> },
  badge: { label: 'task.badge', hint: 'task.badge.hint', icon: <TrophyIcon size={18} /> },
  boost: { label: 'task.boost', hint: 'task.boost.hint', icon: <SparkleIcon size={18} /> },
  super: { label: 'task.super', hint: 'task.super.hint', icon: <RocketIcon size={18} /> },
  freeze: { label: 'task.freeze', hint: 'task.freeze.hint', icon: <TargetIcon size={18} /> },
};

const PRESET_LABEL: Record<string, MessageKey> = {
  quick: 'preset.quick.label',
  balanced: 'preset.balanced.label',
  max: 'preset.max.label',
  rewards: 'preset.rewards.label',
};

const PRESET_HINT: Record<string, MessageKey> = {
  quick: 'preset.quick.hint',
  balanced: 'preset.balanced.hint',
  max: 'preset.max.hint',
  rewards: 'preset.rewards.hint',
};

export function Popup() {
  const app = useAppState();
  const t = useT();
  useTheme(app.state?.settings.ui.theme);
  useLocale(app.state?.settings.ui.locale);

  const [tab, setTab] = useState<Tab>('home');
  const [now, setNow] = useState(Date.now());

  const running =
    app.state?.run.phase === 'running' || app.state?.run.phase === 'preparing' || app.state?.run.phase === 'finishing';

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
  const failedTasks = [
    ...new Set((state.lastSummary?.tasks ?? []).filter((task) => task.status === 'failed').map((task) => task.task)),
  ];
  const guard = settings.schedule.guard;

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
          <IconButton label={t('popup.refresh')} onClick={() => void app.refreshProfile()}>
            <RefreshIcon size={18} />
          </IconButton>
          <IconButton label={t('popup.settings')} onClick={() => openOptions()}>
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
                <strong>{t('popup.noSession')}</strong>
                <p>{token.message}</p>
              </div>
            </div>
            <Button size="sm" variant="secondary" full onClick={() => openOptions()}>
              {t('popup.fixInSettings')}
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
                    <strong>{t('popup.riskTitle')}</strong>
                    <p>{t('popup.riskBody', { streak: profile?.streak ?? 0 })}</p>
                  </div>
                </div>
                <Button size="sm" variant="secondary" full onClick={() => void app.startRun()}>
                  {t('popup.riskCta')}
                </Button>
              </Card>
            ) : null}

            <section className="identity">
              <div className="identity__avatar">{profile?.displayName?.charAt(0).toUpperCase() ?? '?'}</div>
              <div className="identity__text">
                <div className="identity__name">
                  {profile ? `@${profile.username}` : t('popup.notSignedIn')}
                  {profile?.hasPlus ? <Pill tone="purple">{t('popup.super')}</Pill> : null}
                </div>
                <div className="identity__meta">
                  {profile ? (
                    <>
                      {t('popup.courseFrom', {
                        learning: languageName(profile.learningLanguage),
                        base: languageName(profile.fromLanguage),
                      })}
                      <span className="dot-sep" />
                      {profile.league ?? t('popup.noLeague')}
                    </>
                  ) : (
                    t('popup.signIn')
                  )}
                </div>
              </div>
              <div className="identity__streak">
                <FlameIcon size={16} />
                <b>{profile?.streak ?? 0}</b>
              </div>
            </section>

            <div className="stat-grid">
              <Stat
                icon={<BoltIcon size={16} />}
                value={formatCompact(profile?.totalXp ?? 0)}
                label={t('popup.statXp')}
                tone="gold"
              />
              <Stat icon={<GemIcon size={16} />} value={formatCompact(profile?.gems ?? 0)} label={t('popup.statGems')} tone="blue" />
              <Stat
                icon={<HeartIcon size={16} />}
                value={`${profile?.hearts ?? 5}/${profile?.maxHearts ?? 5}`}
                label={t('popup.statHearts')}
                tone="red"
              />
            </div>

            <Card tone={running ? 'blue' : 'default'} className="run-card">
              <div className="run-card__head">
                <div>
                  <span className="u-upper u-faint">{running ? t('popup.runningNow') : t('popup.automation')}</span>
                  <h2 className="run-card__title">
                    {running
                      ? run.currentLabel
                      : run.phase === 'done'
                        ? t('popup.allDone')
                        : run.phase === 'failed'
                          ? t('popup.lastFailed')
                          : t('popup.ready')}
                  </h2>
                </div>
                {running ? (
                  <Pill tone="blue">{formatDuration(elapsed)}</Pill>
                ) : settings.behavior.dryRun ? (
                  <Pill tone="gold">{t('common.dryRun')}</Pill>
                ) : null}
              </div>

              {running || run.phase === 'done' ? (
                <ProgressBar value={running ? run.progress : 1} animated={running} height={16} />
              ) : (
                <div className="run-card__plan">
                  <Pill tone="green">{t('popup.sessions', { n: settings.practice.sessions })}</Pill>
                  <Pill tone="blue">{settings.rewards.enabled ? t('popup.rewardsOn') : t('popup.rewardsOff')}</Pill>
                  <Pill tone="gold">{settings.freeze.enabled ? t('popup.freezeOn') : t('popup.freezeOff')}</Pill>
                  <Pill tone="neutral">{settings.schedule.enabled ? t('popup.scheduled') : t('popup.manual')}</Pill>
                  {settings.practice.stopAtDailyGoal ? <Pill tone="purple">{t('popup.goalModeOn')}</Pill> : null}
                </div>
              )}

              <div className="run-card__meta">
                {running ? (
                  <span>
                    {t('popup.progressLine', {
                      percent: Math.round(run.progress * 100),
                      trigger: triggerLabel(run.trigger, t),
                    })}
                  </span>
                ) : state.lastSummary ? (
                  <span>
                    {t('popup.lastRunLine', {
                      when: formatRelative(state.lastSummary.finishedAt),
                      xp: state.lastSummary.xpGained,
                      rewards: state.lastSummary.rewardsClaimed,
                    })}
                  </span>
                ) : (
                  <span>
                    {t('popup.queuedLine', {
                      n: settings.practice.sessions,
                      mode: settings.behavior.dryRun ? t('common.dryRun') : t('common.live'),
                    })}
                  </span>
                )}
              </div>

              <div className="run-card__actions">
                {running ? (
                  <Button variant="danger" full icon={<StopIcon size={16} />} onClick={() => void app.cancelRun()}>
                    {t('popup.cancelRun')}
                  </Button>
                ) : (
                  <Button full size="lg" icon={<PlayIcon size={16} />} onClick={() => void app.startRun()}>
                    {t('popup.start')}
                  </Button>
                )}
              </div>

              {!running && failedTasks.length > 0 ? (
                <button type="button" className="run-card__retry" onClick={() => void app.startRun(failedTasks)}>
                  <RefreshIcon size={13} />
                  {failedTasks.length === 1 ? t('popup.retryOne') : t('popup.retryMany', { n: failedTasks.length })}
                </button>
              ) : null}
            </Card>

            <Card>
              <CardHeader
                title={t('popup.fortnight')}
                subtitle={t('popup.fortnightSub', { xp: formatNumber(stats.xp), runs: stats.runs })}
                icon={<ChartIcon size={18} />}
                action={<Pill tone="green">{t('popup.okRate', { rate: stats.successRate })}</Pill>}
              />
              <Bars data={stats.daily.map((point) => ({ label: point.day, value: point.xp }))} height={72} />
              <div className="bars-legend">
                <span>{t('popup.daysAgo')}</span>
                <span>{t('popup.today')}</span>
              </div>
            </Card>

            <div className="goal-row">
              <Card className="goal-row__ring">
                <Ring value={Math.min(1, todayXp / dailyGoal)} size={84} tone="green">
                  <div className="ring-label">
                    <b>{todayXp}</b>
                    <span>{t('popup.ofGoal', { goal: dailyGoal })}</span>
                  </div>
                </Ring>
                <div className="goal-row__caption">
                  <strong>{t('popup.dailyGoal')}</strong>
                  <span>{todayXp >= dailyGoal ? t('popup.goalReached') : t('popup.goalToGo', { n: dailyGoal - todayXp })}</span>
                </div>
              </Card>
              <Card className="goal-row__streak">
                <div className="streak-big">
                  <FlameIcon size={22} />
                  <b>{profile?.streak ?? 0}</b>
                </div>
                <span className="u-upper u-faint">{t('popup.dayStreak')}</span>
                <div className="freeze-dots">
                  {[0, 1].map((index) => (
                    <span key={index} className={index < (profile?.streakFreezes ?? 0) ? 'is-on' : ''} />
                  ))}
                </div>
                <span className="u-faint">{tp('popup.freezesReady', profile?.streakFreezes ?? 0)}</span>
              </Card>
            </div>

            <Card>
              <CardHeader
                title={t('popup.streakSafety')}
                subtitle={t(forecast.headline.key as MessageKey, forecast.headline.vars)}
                icon={<FlameIcon size={18} />}
                action={<Pill tone={forecast.slack > 0 ? 'green' : 'red'}>{t('popup.slackPill', { n: forecast.slack })}</Pill>}
              />
              <StreakForecastStrip forecast={forecast} dense showHeadline={false} />
            </Card>
          </>
        ) : null}

        {tab === 'tasks' ? (
          <>
            <Card>
              <CardHeader title={t('popup.runShape')} subtitle={t('popup.runShapeHint')} icon={<SparkleIcon size={18} />} />
              <div className="preset-row">
                {RUN_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className="preset"
                    onClick={() => void app.patchSettings((draft) => preset.apply(draft))}
                  >
                    <b>{t(PRESET_LABEL[preset.id])}</b>
                    <span>{t(PRESET_HINT[preset.id])}</span>
                  </button>
                ))}
              </div>
            </Card>

            <Card>
              <CardHeader
                title={t('popup.runPlan')}
                subtitle={t('popup.runPlanHint')}
                icon={<RocketIcon size={18} />}
                action={<Pill tone="blue">{t('common.live')}</Pill>}
              />
              <div className="task-list">
                {(Object.keys(TASK_META) as TaskKey[]).map((key) => {
                  const meta = TASK_META[key];
                  const enabled = isTaskEnabled(key, settings);
                  return (
                    <div key={key} className={`task-row${enabled ? '' : ' is-off'}`}>
                      <span className={`task-row__icon${enabled ? ' is-on' : ''}`}>{meta.icon}</span>
                      <div className="task-row__text">
                        <strong>{t(meta.label)}</strong>
                        <span>{t(meta.hint)}</span>
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
              <CardHeader title={t('popup.quickToggles')} subtitle={t('popup.quickTogglesHint')} icon={<SlidersIcon size={18} />} />
              <Toggle
                label={t('popup.toggleDryRun')}
                hint={t('popup.toggleDryRunHint')}
                checked={settings.behavior.dryRun}
                onChange={(next) => void app.patchSettings((draft) => void (draft.behavior.dryRun = next))}
              />
              <Toggle
                label={t('popup.toggleRewards')}
                hint={t('popup.toggleRewardsHint')}
                checked={settings.rewards.enabled}
                onChange={(next) => void app.patchSettings((draft) => void (draft.rewards.enabled = next))}
              />
              <Toggle
                label={t('popup.toggleFreeze')}
                hint={t('popup.toggleFreezeHint', { n: settings.freeze.targetCount })}
                checked={settings.freeze.enabled}
                onChange={(next) => void app.patchSettings((draft) => void (draft.freeze.enabled = next))}
              />
              <Toggle
                label={t('popup.toggleSchedule')}
                hint={t('popup.toggleScheduleHint', { n: settings.schedule.intervalMinutes })}
                checked={settings.schedule.enabled}
                onChange={(next) => void app.patchSettings((draft) => void (draft.schedule.enabled = next))}
              />
            </Card>
          </>
        ) : null}

        {tab === 'log' ? (
          <Card>
            <CardHeader
              title={t('popup.console')}
              subtitle={run.currentLabel}
              icon={<HistoryIcon size={18} />}
              action={
                <IconButton label={t('popup.clearLog')} onClick={() => void app.clearLogs()}>
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
                ? t('popup.nextRun', { when: formatRelative(state.schedule.nextRunAt) })
                : t('popup.scheduleArmed')
              : t('popup.schedulerOff')}
          </span>
          <span className="dot-sep" />
          <span>{daySummary(settings.schedule.days, t)}</span>
          {guard.enabled ? (
            <>
              <span className="dot-sep" />
              <span>{t('popup.guardOn', { time: clockLabel(guard.hour, guard.minute) })}</span>
            </>
          ) : null}
          <span className="dot-sep" />
          <span>{t('popup.runsCount', { n: stats.runs })}</span>
        </footer>
      </main>

      <nav className="tabbar" aria-label={t('popup.sections')}>
        <TabButton active={tab === 'home'} onClick={() => setTab('home')} icon={<TargetIcon size={18} />} label={t('popup.tabHome')} />
        <TabButton active={tab === 'tasks'} onClick={() => setTab('tasks')} icon={<RocketIcon size={18} />} label={t('popup.tabTasks')} />
        <TabButton active={tab === 'log'} onClick={() => setTab('log')} icon={<HistoryIcon size={18} />} label={t('popup.tabLog')} />
      </nav>

      <ToastStack items={app.toasts} onDismiss={app.dismissToast} />
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: JSX.Element;
  label: string;
}) {
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

/** `20:30` — the guard time, formatted the way the user will read it. */
export function clockLabel(hour: number, minute: number): string {
  return `${`${hour}`.padStart(2, '0')}:${`${minute}`.padStart(2, '0')}`;
}

const DAY_KEYS: MessageKey[] = [
  'weekday.sun',
  'weekday.mon',
  'weekday.tue',
  'weekday.wed',
  'weekday.thu',
  'weekday.fri',
  'weekday.sat',
];

/** "every day" / "Mon Wed Fri" — compact enough for the popup footer. */
function daySummary(days: number[], t: ReturnType<typeof useT>): string {
  if (days.length === 0) return t('popup.noDays');
  if (days.length === 7) return t('popup.everyDay');
  return days.map((day) => t(DAY_KEYS[day] ?? 'weekday.sun')).join(' ');
}

function triggerLabel(trigger: RunTrigger | null, t: ReturnType<typeof useT>): string {
  if (!trigger) return t('trigger.manual');
  return t(`trigger.${trigger}` as MessageKey);
}
