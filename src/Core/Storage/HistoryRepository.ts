/**
 * HistoryRepository.ts — run history and derived analytics.
 *
 * Storage holds a bounded array (newest first). Stats are computed on demand
 * from that array, so there is no second source of truth to keep in sync.
 */
import { HISTORY_LIMIT, STORAGE_KEYS } from '@Shared/Constants';
import type { HistoryStats, RunSummary } from '@Shared/Types';
import { dayKey } from '@Shared/Utils/Time';
import { readRaw, writeRaw } from './StorageArea';

const EMPTY_STATS: HistoryStats = {
  runs: 0,
  xp: 0,
  gems: 0,
  rewards: 0,
  successRate: 0,
  currentStreakOfRuns: 0,
  lastRunAt: null,
  daily: [],
};

export class HistoryRepository {
  async list(): Promise<RunSummary[]> {
    const stored = await readRaw<RunSummary[]>('local', STORAGE_KEYS.history);
    return Array.isArray(stored) ? stored : [];
  }

  async last(): Promise<RunSummary | null> {
    const runs = await this.list();
    return runs[0] ?? null;
  }

  async append(run: RunSummary): Promise<RunSummary[]> {
    const runs = await this.list();
    const next = [run, ...runs].slice(0, HISTORY_LIMIT);
    await writeRaw('local', STORAGE_KEYS.history, next);
    return next;
  }

  async clear(): Promise<void> {
    await writeRaw('local', STORAGE_KEYS.history, []);
  }

  async stats(days = 14): Promise<HistoryStats> {
    const runs = await this.list();
    if (runs.length === 0) return { ...EMPTY_STATS, daily: buildDaily([], days) };

    const xp = runs.reduce((sum, run) => sum + run.xpGained, 0);
    const gems = runs.reduce((sum, run) => sum + run.gemsClaimed, 0);
    const rewards = runs.reduce((sum, run) => sum + run.rewardsClaimed, 0);
    const clean = runs.filter((run) => !run.error).length;

    let streak = 0;
    for (const run of runs) {
      if (run.error) break;
      streak += 1;
    }

    return {
      runs: runs.length,
      xp,
      gems,
      rewards,
      successRate: Math.round((clean / runs.length) * 100),
      currentStreakOfRuns: streak,
      lastRunAt: runs[0]?.finishedAt ?? null,
      daily: buildDaily(runs, days),
    };
  }
}

function buildDaily(runs: RunSummary[], days: number): HistoryStats['daily'] {
  const buckets = new Map<string, { xp: number; runs: number }>();
  for (const run of runs) {
    const key = dayKey(run.startedAt);
    const bucket = buckets.get(key) ?? { xp: 0, runs: 0 };
    bucket.xp += run.xpGained;
    bucket.runs += 1;
    buckets.set(key, bucket);
  }

  const out: HistoryStats['daily'] = [];
  const today = new Date();
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - offset);
    const key = dayKey(date.getTime());
    const bucket = buckets.get(key) ?? { xp: 0, runs: 0 };
    out.push({ day: key, xp: bucket.xp, runs: bucket.runs });
  }
  return out;
}

export const historyRepository = new HistoryRepository();
