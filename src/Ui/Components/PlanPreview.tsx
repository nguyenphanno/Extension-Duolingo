// Copyright github.com/nguyenphanno © 2026. All rights reserved
/**
 * PlanPreview.tsx — "what would happen if a run started right now?"
 *
 * Reads `planFor()` and `blockReason()` from the automation core, both of which
 * are pure functions, and renders the answer as a card. No storage, no
 * side-effects — it is a read-only projection of the current settings.
 */
import type { Settings } from '@Shared/Types';
import { planFor } from '@Core/Automation/TaskRegistry';
import type { ScheduleBlock } from '@Background/Scheduler';
import { CheckIcon, ClockIcon, AlertIcon } from '@Ui/Icons/Icons';
import { Pill } from './Display';
import { useT } from '@Ui/I18n/I18n';
import type { MessageKey } from '@Ui/I18n/Messages';
import { formatRelative } from '@Shared/Utils/Time';

interface PlanPreviewProps {
  settings: Settings;
  block: ScheduleBlock;
  nextRunAt: number | null;
}

const BLOCK_KEY: Record<Exclude<ScheduleBlock, null>, MessageKey> = {
  disabled: 'plan.blockDisabled',
  paused: 'plan.blockPaused',
  'quiet-hours': 'plan.blockQuiet',
  'off-day': 'plan.blockOffDay',
};

export function PlanPreview({ settings, block, nextRunAt }: PlanPreviewProps) {
  const t = useT();
  const plan = planFor(settings);
  const blocked = block !== null;

  return (
    <div className="plan-preview">
      <div className="plan-preview__status">
        {blocked ? (
          <AlertIcon size={16} />
        ) : (
          <CheckIcon size={16} />
        )}
        <span className={blocked ? 'is-blocked' : 'is-ok'}>
          {blocked ? t('plan.blocked') : t('plan.willRun')}
        </span>
        {blocked ? (
          <Pill tone="red">{t(BLOCK_KEY[block])}</Pill>
        ) : plan.length > 0 ? (
          <Pill tone="green">{t('plan.taskCount', { n: plan.length })}</Pill>
        ) : (
          <Pill tone="neutral">{t('plan.empty')}</Pill>
        )}
      </div>

      <div className="plan-preview__tasks">
        {plan.length > 0 ? (
          plan.map((task) => (
            <div key={task.key} className="plan-task">
              <span className="plan-task__dot" />
              <span>{t(`task.${task.key}` as MessageKey)}</span>
              <em>{task.weight}</em>
            </div>
          ))
        ) : (
          <p className="hint">{t('plan.empty')}</p>
        )}
      </div>

      <div className="plan-preview__alarm">
        <ClockIcon size={14} />
        <span>
          {nextRunAt
            ? t('plan.nextAlarm') + ': ' + formatRelative(nextRunAt)
            : t('plan.noAlarm')}
        </span>
      </div>
    </div>
  );
}
