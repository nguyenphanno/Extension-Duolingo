/**
 * SidePanel.tsx — the live console you keep open while a run happens.
 *
 * Wide, tall, and dense: progress on top, task timeline in the middle, log
 * filling whatever space is left.
 */
import { useEffect, useState } from 'react';
import { formatCompact, formatNumber } from '@Shared/Utils/Format';
import { formatDuration, formatRelative } from '@Shared/Utils/Time';
import type { TaskOutcome } from '@Shared/Types';
import { useAppState } from '@Ui/Hooks/UseAppState';
import { useTheme } from '@Ui/Hooks/UseTheme';
import { BrandMark } from '@Ui/Components/BrandMark';
import { Button, IconButton } from '@Ui/Components/Button';
import { Card, CardHeader } from '@Ui/Components/Card';
import { ProgressBar, Pill, Stat, EmptyState } from '@Ui/Components/Display';
import { Toggle } from '@Ui/Components/Controls';
import { LogConsole } from '@Ui/Components/LogConsole';
import { ToastStack } from '@Ui/Components/Toast';
import {
  AlertIcon,
  BoltIcon,
  CheckIcon,
  ClockIcon,
  FlameIcon,
  GemIcon,
  HeartIcon,
  HistoryIcon,
  OwlIcon,
  PlayIcon,
  RefreshIcon,
  StopIcon,
  TrashIcon,
} from '@Ui/Icons/Icons';
import './SidePanel.css';

export function SidePanel() {
  const app = useAppState();
  useTheme(app.state?.settings.ui.theme);
  const [now, setNow] = useState(Date.now());

  const run = app.state?.run;
  const busy = run?.phase === 'running' || run?.phase === 'preparing' || run?.phase === 'finishing';

  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [busy]);

  if (!app.state) {
    return <div className="panel panel--loading">Loading console…</div>;
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
            <strong>Live console</strong>
            <span>{state.profile ? `@${state.profile.username}` : 'not signed in'}</span>
          </div>
        </div>
        <div className="panel__head-actions">
          <Pill tone={busy ? 'blue' : run?.phase === 'failed' ? 'red' : 'green'}>
            {busy ? 'running' : run?.phase ?? 'idle'}
          </Pill>
          <label className="panel__dry">
            <span>Dry run</span>
            <Toggle
              label=""
              checked={state.settings.behavior.dryRun}
              onChange={(next) => void app.patchSettings((draft) => void (draft.behavior.dryRun = next))}
            />
          </label>
          <IconButton label="Refresh profile" onClick={() => void app.refreshProfile()}>
            <RefreshIcon size={17} />
          </IconButton>
        </div>
      </header>

      <div className="panel__body">
        <Card tone={busy ? 'blue' : 'default'} className="panel__run">
          <div className="panel__run-top">
            <div>
              <span className="u-upper u-faint">{busy ? 'Current step' : 'Ready'}</span>
              <h2>{busy ? run?.currentLabel : run?.phase === 'done' ? 'Run complete' : 'Idle'}</h2>
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
              <Pill tone="green">{state.settings.practice.sessions} sessions</Pill>
              <Pill tone="blue">{state.settings.rewards.enabled ? 'rewards on' : 'rewards off'}</Pill>
              <Pill tone="gold">{state.settings.freeze.enabled ? 'freeze on' : 'freeze off'}</Pill>
              <Pill tone="neutral">{state.settings.behavior.dryRun ? 'dry run' : 'live'}</Pill>
            </div>
          )}
          <div className="panel__run-actions">
            {busy ? (
              <Button variant="danger" icon={<StopIcon size={15} />} onClick={() => void app.cancelRun()}>
                Cancel
              </Button>
            ) : (
              <Button icon={<PlayIcon size={15} />} onClick={() => void app.startRun()}>
                Start run
              </Button>
            )}
            <Button
              variant="secondary"
              icon={<TrashIcon size={15} />}
              onClick={() => void app.clearLogs()}
            >
              Clear log
            </Button>
          </div>
        </Card>

        <div className="panel__stats">
          <Stat icon={<BoltIcon size={15} />} value={formatCompact(state.profile?.totalXp ?? 0)} label="XP" tone="gold" compact />
          <Stat icon={<GemIcon size={15} />} value={formatCompact(state.profile?.gems ?? 0)} label="Gems" tone="blue" compact />
          <Stat icon={<FlameIcon size={15} />} value={state.profile?.streak ?? 0} label="Streak" tone="orange" compact />
          <Stat icon={<HeartIcon size={15} />} value={state.profile?.hearts ?? 5} label="Hearts" tone="red" compact />
        </div>

        <Card>
          <CardHeader
            title="Task timeline"
            subtitle={summary ? `${formatNumber(summary.xpGained)} XP · ${summary.rewardsClaimed} rewards · ${summary.gemsClaimed} gems` : 'No run yet'}
            icon={<HistoryIcon size={18} />}
            action={summary ? <Pill tone="neutral">{formatRelative(summary.finishedAt)}</Pill> : undefined}
          />
          {tasks.length === 0 ? (
            <EmptyState
              icon={<HistoryIcon size={22} />}
              title="Nothing recorded yet"
              body="Start a run and each task will appear here with its result."
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
          <CardHeader title="Output" subtitle={`${state.logs.length} lines buffered`} icon={<AlertIcon size={18} />} />
          <LogConsole logs={state.logs} height={300} />
        </Card>
      </div>

      <ToastStack items={app.toasts} onDismiss={app.dismissToast} />
    </div>
  );
}

function TimelineRow({ task }: { task: TaskOutcome }) {
  const icon =
    task.status === 'done' ? <CheckIcon size={14} /> : task.status === 'failed' ? <AlertIcon size={14} /> : <ClockIcon size={14} />;
  const duration = Math.max(0, task.finishedAt - task.startedAt);
  return (
    <li className={`timeline__row timeline__row--${task.status}`}>
      <span className="timeline__dot">{icon}</span>
      <div className="timeline__text">
        <strong>{task.label}</strong>
        <span>{task.headline}</span>
        {task.detail ? <em>{task.detail}</em> : null}
      </div>
      <span className="timeline__time">{duration > 0 ? formatDuration(duration) : '—'}</span>
    </li>
  );
}
