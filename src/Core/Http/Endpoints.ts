/**
 * Endpoints.ts — URL construction only, so path changes are a one-line edit.
 */
import { DUO_API_BASE, DUO_GOALS_BASE, PROFILE_FIELDS, PRO_API_URL } from '@Shared/Constants';

const enc = encodeURIComponent;

export const endpoints = {
  profile: (userId: string) => `${DUO_API_BASE}/users/${enc(userId)}?fields=${PROFILE_FIELDS}`,
  sessions: () => `${DUO_API_BASE}/sessions`,
  session: (sessionId: string) => `${DUO_API_BASE}/sessions/${enc(sessionId)}`,
  shopItems: (userId: string) => `${DUO_API_BASE}/users/${enc(userId)}/shop-items`,
  reward: (userId: string, rewardId: string) =>
    `${DUO_API_BASE}/users/${enc(userId)}/rewards/${enc(rewardId)}`,
  goalsProgress: (userId: string, timezone: string) =>
    `${DUO_GOALS_BASE}/users/${enc(userId)}/progress?timezone=${enc(timezone)}`,
  pro: () => PRO_API_URL,
} as const;
