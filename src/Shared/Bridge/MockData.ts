// Copyright github.com/nguyenphanno © 2026. All rights reserved
/**
 * MockData.ts — a believable demo state for `Preview.html`.
 *
 * The preview runs outside the extension (no chrome.runtime), so it feeds the
 * exact same React tree with synthetic data. That keeps the UI honest: what
 * you see in the preview is what the popup renders.
 *
 * The run history is generated from a fixed seed, so the heatmap, the bars and
 * the achievement grid all agree with each other and look identical on every
 * reload — a moving demo makes visual regressions impossible to spot.
 */
import { DEFAULT_SETTINGS } from '@Core/Storage/SettingsRepository';
import type { UiState } from '@Shared/Protocol';
import type { HistoryStats, LogEntry, Profile, RunSummary, TaskOutcome } from '@Shared/Types';

const now = Date.now();
const DAY = 86_400_000;

export const MOCK_PROFILE: Profile = {
  userId: '424242',
  username: 'minh.learner',
  displayName: 'Minh',
  streak: 128,
  totalXp: 24_580,
  gems: 1_240,
  hearts: 5,
  maxHearts: 5,
  fromLanguage: 'en',
  learningLanguage: 'ja',
  streakFreezes: 2,
  hasPlus: true,
  league: 'Diamond',
  avatarUrl: null,
  fetchedAt: now,
};

/** Deterministic LCG — same numbers on every load, no Math.random(). */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  };
}

function dayKey(at: number): string {
  const date = new Date(at);
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function buildRun(index: number, startedAt: number, rand: () => number): RunSummary {
  const sessions = 1 + Math.floor(rand() * 4);
  const xpGained = sessions * 15;
  const rewardsClaimed = Math.floor(rand() * 5);
  const gemsClaimed = rewardsClaimed * 20 + Math.floor(rand() * 30);
  const failedPractice = rand() < 0.1;
  const failedBadge = rand() < 0.16;

  const tasks: TaskOutcome[] = [
    {
      task: 'practice',
      label: 'Practice sessions',
      status: failedPractice ? 'failed' : 'done',
      headline: failedPractice ? 'Session 2 rejected by the server' : `${sessions}/${sessions} sessions · +${xpGained} XP`,
      detail: failedPractice ? 'HTTP 429 — too many sessions in a short window.' : undefined,
      metrics: failedPractice ? { xp: 15, sessions: 1, failed: 1 } : { xp: xpGained, sessions, failed: 0 },
      startedAt,
      finishedAt: startedAt + sessions * 42_000,
    },
    {
      task: 'rewards',
      label: 'Reward sweep',
      status: rewardsClaimed > 0 ? 'done' : 'skipped',
      headline: rewardsClaimed > 0 ? `${rewardsClaimed} claimed · +${gemsClaimed} gems` : 'Nothing to claim',
      metrics: { claimed: rewardsClaimed, gems: gemsClaimed },
      startedAt: startedAt + sessions * 42_000,
      finishedAt: startedAt + sessions * 42_000 + 9_000,
    },
    {
      task: 'badge',
      label: 'Monthly badges',
      status: failedBadge ? 'failed' : 'done',
      headline: failedBadge ? 'Badge request refused' : 'All current badges present',
      metrics: { missing: failedBadge ? 1 : 0 },
      startedAt: startedAt + sessions * 42_000 + 9_000,
      finishedAt: startedAt + sessions * 42_000 + 14_000,
    },
    {
      task: 'freeze',
      label: 'Streak freeze',
      status: rand() < 0.3 ? 'done' : 'skipped',
      headline: rand() < 0.5 ? 'Inventory already full' : 'Streak freeze purchased',
      metrics: { purchased: 1 },
      startedAt: startedAt + sessions * 42_000 + 14_000,
      finishedAt: startedAt + sessions * 42_000 + 17_000,
    },
  ];

  const finishedAt = startedAt + sessions * 42_000 + 18_000;

  return {
    id: `run_demo_${index}`,
    startedAt,
    finishedAt,
    trigger: index % 7 === 0 ? 'schedule' : index % 5 === 0 ? 'command' : 'manual',
    dryRun: false,
    xpGained,
    rewardsClaimed,
    gemsClaimed,
    sessions: [],
    tasks,
    before: null,
    after: null,
    badgeStatus: failedBadge ? '1 badge(s) missing' : 'All present',
    error: failedPractice ? 'Practice session rejected.' : null,
  };
}

/** ~8 weeks of plausible runs, newest first. */
export const MOCK_RUNS: RunSummary[] = (() => {
  const rand = seeded(20_241_022);
  const runs: RunSummary[] = [];
  let index = 0;

  for (let back = 55; back >= 0; back -= 1) {
    const day = new Date(now - back * DAY);
    const restDay = rand() < 0.2;
    const perDay = restDay ? 0 : 1 + Math.floor(rand() * 3);

    for (let slot = 0; slot < perDay; slot += 1) {
      const startedAt = new Date(
        day.getFullYear(),
        day.getMonth(),
        day.getDate(),
        7 + Math.floor(rand() * 14),
        Math.floor(rand() * 60),
      ).getTime();
      runs.push(buildRun(index, Math.min(startedAt, now - 60_000), rand));
      index += 1;
    }
  }

  return runs.sort((a, b) => b.startedAt - a.startedAt);
})();

function deriveStats(runs: RunSummary[]): HistoryStats {
  const xp = runs.reduce((sum, run) => sum + run.xpGained, 0);
  const gems = runs.reduce((sum, run) => sum + run.gemsClaimed, 0);
  const rewards = runs.reduce((sum, run) => sum + run.rewardsClaimed, 0);
  const clean = runs.filter((run) => !run.error).length;

  let currentStreakOfRuns = 0;
  for (const run of runs) {
    if (run.error) break;
    currentStreakOfRuns += 1;
  }

  const byDay = new Map<string, { xp: number; runs: number }>();
  for (const run of runs) {
    const key = dayKey(run.startedAt);
    const bucket = byDay.get(key) ?? { xp: 0, runs: 0 };
    bucket.xp += run.xpGained;
    bucket.runs += 1;
    byDay.set(key, bucket);
  }

  const daily = Array.from({ length: 14 }, (_, index) => {
    const at = now - (13 - index) * DAY;
    const key = dayKey(at);
    const bucket = byDay.get(key) ?? { xp: 0, runs: 0 };
    return { day: key, xp: bucket.xp, runs: bucket.runs };
  });

  return {
    runs: runs.length,
    xp,
    gems,
    rewards,
    successRate: runs.length === 0 ? 0 : Math.round((clean / runs.length) * 100),
    currentStreakOfRuns,
    lastRunAt: runs[0]?.finishedAt ?? null,
    daily,
  };
}

export const MOCK_STATS: HistoryStats = deriveStats(MOCK_RUNS);

export const MOCK_LOGS: LogEntry[] = [
  { id: 'l1', at: now - 62_000, level: 'info', scope: 'run', message: 'Run started (manual)' },
  { id: 'l2', at: now - 61_000, level: 'success', scope: 'run', message: 'Signed in as minh.learner · 128-day streak · 24580 XP' },
  { id: 'l3', at: now - 60_000, level: 'info', scope: 'practice', message: 'Session 1 opened' },
  { id: 'l4', at: now - 54_000, level: 'success', scope: 'practice', message: 'Session 1 completed (+15 XP)' },
  { id: 'l5', at: now - 48_000, level: 'info', scope: 'practice', message: 'Session 2 opened' },
  { id: 'l6', at: now - 41_000, level: 'success', scope: 'practice', message: 'Session 2 completed (+15 XP)' },
  { id: 'l7', at: now - 34_000, level: 'info', scope: 'rewards', message: 'Claiming 3 bundles' },
  { id: 'l8', at: now - 30_000, level: 'success', scope: 'rewards', message: '3 rewards claimed (+120 gems)' },
  { id: 'l9', at: now - 24_000, level: 'warn', scope: 'badge', message: 'Cooldown: resets back in 6h' },
  { id: 'l10', at: now - 18_000, level: 'success', scope: 'freeze', message: 'Streak freeze purchased' },
];

export const MOCK_SUMMARY: RunSummary = MOCK_RUNS[0] ?? buildRun(0, now - 62_000, seeded(7));

/**
 * Mock state for the preview harness.
 *
 * `?locale=vi` and `?theme=dark` are honoured here (and only here) so the
 * screenshots in `docs/` are reproducible: the preview has no settings to
 * persist, so the query string is the only way to pin a starting language.
 */
export function mockState(): UiState {
  const settings = structuredClone(DEFAULT_SETTINGS);
  try {
    const params = new URLSearchParams(window.location.search);
    const locale = params.get('locale');
    const theme = params.get('theme');
    if (locale === 'vi' || locale === 'en') settings.ui.locale = locale;
    if (theme === 'dark' || theme === 'light' || theme === 'system') settings.ui.theme = theme;
  } catch {
    /* no window (tests) — keep defaults */
  }

  return {
    settings,
    profile: MOCK_PROFILE,
    run: {
      phase: 'idle',
      runId: null,
      startedAt: null,
      finishedAt: null,
      trigger: null,
      currentTask: null,
      currentLabel: 'Idle',
      progress: 0,
      summary: null,
      error: null,
    },
    stats: MOCK_STATS,
    logs: MOCK_LOGS,
    token: {
      present: true,
      valid: true,
      source: 'cookie',
      userId: '424242',
      username: 'minh.learner',
      expiresAt: now + 1000 * 60 * 60 * 24 * 26,
      daysLeft: 26,
      message: 'Token looks valid.',
    },
    lastSummary: MOCK_SUMMARY,
    version: '2.0.0',
    schedule: {
      nextRunAt: now + 1000 * 60 * 90,
      guardAt: now + 1000 * 60 * 60 * 6,
    },
    pacing: { factor: 1, holdUntil: null, rateLimitHits: 0 },
  };
}
