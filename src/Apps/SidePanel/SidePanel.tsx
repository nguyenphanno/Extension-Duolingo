// Copyright github.com/nguyenphanno © 2026. All rights reserved
/**
 * SidePanel.tsx — the live console you keep open while a run happens.
 *
 * Wide, tall, and dense: progress on top, task timeline in the middle, log
 * filling whatever space is left.
 */
import { useEffect, useState } from 'react';
import { formatCompact, formatNumber } from '@Shared/Utils/Format';
import { formatDuration, formatRelative } from '@Shared/Utils/Time';
import type { RunPhase, TaskOutcome, TaskKey } from '@Shared/Types';
import { useAppState } from '@Ui/Hooks/UseAppState';
import { useTheme } from '@Ui/Hooks/UseTheme';
import { useLocale } from '@Ui/Hooks/UseLocale';
import { useT } from '@Ui/I18n/I18n';
import type { MessageKey } from '@Ui/I18n/Messages';
import { BrandMark } from '@Ui/Components/BrandMark';
import { Button, IconButton } from '@Ui/Components/Button';
import { Card, CardHeader } from '@Ui/Components/Card';
import { ProgressBar, Pill, Stat, EmptyState } from '@Ui/Components/Display';
import { Toggle } from '@Ui/Components/Controls';
import { LogConsole } from '@Ui/Components/LogConsole';
import { ToastStack } from '@Ui/Components/Toast';
import {
  AlertIcon,
  CheckIcon,
  ClockIcon,
  HistoryIcon,
  PlayIcon,
  RefreshIcon,
  StopIcon,
  TrashIcon,
} from '@Ui/Icons/Icons';
import { DuoArt } from '@Ui/Icons/DuoArt';
import './SidePanel.css';

export function SidePanel() {
  const app = useAppState();
  const t = useT();
  useTheme(app.state?.settings.ui.theme);
  useLocale(app.state?.settings.ui.locale);
  const [now, setNow] = useState(Date.now());

  const run = app.state?.run;
  const busy = run?.phase === 'running' || run?.phase === 'preparing' || run?.phase === 'finishing';

  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [busy]);

  if (!app.state) {
    return <div className="panel panel--loading">{t('panel.loading')}</div>;
  }

  const { state } = app;
  const summary = state.run.summary ?? state.lastSummary;
  const tasks = summary?.tasks ?? [];
  const elapsed = run?.startedAt ? (run.finishedAt ?? now) - run.startedAt : 0;

  return (
    <div className="panel">
      <header className="panel__head">
        <div className="panel__brand">
          <BrandMark size={34} />
          <div>
            <strong>{t('panel.title')}</strong>
            <span>{state.profile ? `@${state.profile.username}` : t('panel.notSignedIn')}</span>
          </div>
        </div>
        <div className="panel__head-actions">
          <Pill tone={busy ? 'blue' : run?.phase === 'failed' ? 'red' : 'green'}>
            {t(`phase.${(run?.phase ?? 'idle') as RunPhase}` as MessageKey)}
          </Pill>
          <label className="panel__dry">
            <span>{t('panel.dryRun')}</span>
            <Toggle
              label=""
              checked={state.settings.behavior.dryRun}
              onChange={(next) => void app.patchSettings((draft) => void (draft.behavior.dryRun = next))}
            />
          </label>
          <IconButton label={t('popup.refresh')} onClick={() => void app.refreshProfile()}>
            <RefreshIcon size={17} />
          </IconButton>
        </div>
      </header>

      <div className="panel__body">
        <Card tone={busy ? 'blue' : 'default'} className="panel__run">
          <div className="panel__run-top">
            <div>
              <span className="u-upper u-faint">{busy ? t('panel.currentStep') : t('panel.ready')}</span>
              <h2>{busy ? run?.currentLabel : run?.phase === 'done' ? t('panel.complete') : t('panel.idle')}</h2>
            </div>
            <div className="panel__run-time">
              <ClockIcon size={15} />
              <b>{formatDuration(elapsed)}</b>
            </div>
          </div>
          {busy || run?.phase === 'done' ? (
            <ProgressBar value={busy ? run?.progress ?? 0 : 1} animated={busy} height={18} />
          ) : (
            <div className="panel__plan">
              <Pill tone="green">{t('panel.sessions', { n: state.settings.practice.sessions })}</Pill>
              <Pill tone="blue">{state.settings.rewards.enabled ? t('panel.rewardsOn') : t('panel.rewardsOff')}</Pill>
              <Pill tone="gold">{state.settings.freeze.enabled ? t('panel.freezeOn') : t('panel.freezeOff')}</Pill>
              <Pill tone="neutral">{state.settings.behavior.dryRun ? t('panel.dry') : t('panel.live')}</Pill>
            </div>
          )}
          <div className="panel__run-actions">
            {busy ? (
              <Button variant="danger" icon={<StopIcon size={15} />} onClick={() => void app.cancelRun()}>
                {t('panel.cancel')}
              </Button>
            ) : (
              <Button icon={<PlayIcon size={15} />} onClick={() => void app.startRun()}>
                {t('panel.start')}
              </Button>
            )}
            <Button variant="secondary" icon={<TrashIcon size={15} />} onClick={() => void app.clearLogs()}>
              {t('panel.clearLog')}
            </Button>
          </div>
        </Card>

        <div className="panel__stats">
          <Stat
            icon={<DuoArt name="xp" size={24} />}
            value={formatCompact(state.profile?.totalXp ?? 0)}
            label={t('popup.statXp')}
            tone="gold"
            compact
          />
          <Stat
            icon={<DuoArt name="gem" size={24} />}
            value={formatCompact(state.profile?.gems ?? 0)}
            label={t('popup.statGems')}
            tone="blue"
            compact
          />
          <Stat
            icon={<DuoArt name="streak" size={24} />}
            value={state.profile?.streak ?? 0}
            label={t('popup.dayStreak')}
            tone="orange"
            compact
          />
          <Stat
            icon={<DuoArt name="heart" size={26} />}
            value={state.profile?.hearts ?? 5}
            label={t('popup.statHearts')}
            tone="red"
            compact
          />
        </div>

        <Card>
          <CardHeader
            title={t('panel.timeline')}
            subtitle={
              summary
                ? t('panel.summaryLine', {
                    xp: formatNumber(summary.xpGained),
                    rewards: summary.rewardsClaimed,
                    gems: summary.gemsClaimed,
                  })
                : t('panel.noRun')
            }
            icon={<HistoryIcon size={18} />}
            action={summary ? <Pill tone="neutral">{formatRelative(summary.finishedAt)}</Pill> : undefined}
          />
          {tasks.length === 0 ? (
            <EmptyState
              icon={<HistoryIcon size={22} />}
              title={t('panel.emptyTitle')}
              body={t('panel.emptyBody')}
            />
          ) : (
            <ol className="timeline">
              {tasks.map((task) => (
                <TimelineRow key={`${task.task}-${task.startedAt}`} task={task} />
              ))}
            </ol>
          )}
        </Card>

        <Card className="panel__log-card">
          <CardHeader
            title={t('panel.output')}
            subtitle={t('panel.buffered', { n: state.logs.length })}
            icon={<DuoArt name="console" size={22} />}
          />
          <LogConsole logs={state.logs} height={300} />
        </Card>
      </div>

      <ToastStack items={app.toasts} onDismiss={app.dismissToast} />
    </div>
  );
}

const TASK_LABEL: Record<TaskKey, MessageKey> = {
  practice: 'task.practice',
  rewards: 'task.rewards',
  badge: 'task.badge',
  boost: 'task.boost',
  super: 'task.super',
  freeze: 'task.freeze',
};

function TimelineRow({ task }: { task: TaskOutcome }) {
  const t = useT();
  const icon =
    task.status === 'done' ? (
      <CheckIcon size={14} />
    ) : task.status === 'failed' ? (
      <AlertIcon size={14} />
    ) : (
      <ClockIcon size={14} />
    );
  const duration = Math.max(0, task.finishedAt - task.startedAt);
  return (
    <li className={`timeline__row timeline__row--${task.status}`}>
      <span className="timeline__dot">{icon}</span>
      <div className="timeline__text">
        <strong>{t(TASK_LABEL[task.task])}</strong>
        <span>{task.headline}</span>
        {task.detail ? <em>{task.detail}</em> : null}
      </div>
      <span className="timeline__time">{duration > 0 ? formatDuration(duration) : '—'}</span>
    </li>
  );
}
