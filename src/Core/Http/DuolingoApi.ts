// Copyright github.com/nguyenphanno © 2026. All rights reserved
/**
 * DuolingoApi.ts — typed access to Duolingo's (unofficial) web endpoints.
 *
 * Every response is normalised into our own domain model here, so the rest of
 * the app never touches raw API shapes.
 */
import { CHALLENGE_TYPES } from '@Shared/Constants';
import { AppError } from '@Shared/Result';
import type { LiveShopItem } from '@Shared/ShopCatalog';
import type {
  DuoGoalsResponse,
  DuoProfileResponse,
  DuoRewardBundle,
  DuoSessionResponse,
  Profile,
  RewardClaimDetail,
} from '@Shared/Types';
import type { HttpClient } from './HttpClient';
import { endpoints } from './Endpoints';

export interface ClaimOutcome {
  claimedCount: number;
  gems: number;
  details: RewardClaimDetail[];
  remaining: boolean;
}

export class DuolingoApi {
  constructor(
    private readonly http: HttpClient,
    public readonly userId: string,
  ) {}

  async getProfile(userId: string = this.userId): Promise<Profile> {
    const raw = await this.http.json<DuoProfileResponse>(endpoints.profile(userId), { label: 'Profile' });
    return normaliseProfile(raw, userId);
  }

  async startPractice(fromLanguage: string, learningLanguage: string): Promise<DuoSessionResponse> {
    return this.http.json<DuoSessionResponse>(endpoints.sessions(), {
      method: 'POST',
      label: 'Start session',
      body: {
        challengeTypes: [...CHALLENGE_TYPES],
        fromLanguage,
        learningLanguage,
        isFinalLevel: false,
        isV2: true,
        juicy: true,
        smartLearnerVariant: 'DEFAULT',
        type: 'GLOBAL_PRACTICE',
      },
    });
  }

  async completePractice(
    session: DuoSessionResponse,
    options: { durationSec: number; heartsLeft: number },
  ): Promise<{ xpGain: number; raw: Record<string, unknown> }> {
    const sessionId = String(session.id ?? '');
    if (!sessionId) throw new Error('Session payload has no id.');
    const endTime = Math.floor(Date.now() / 1000);
    const payload = {
      ...session,
      heartsLeft: options.heartsLeft,
      startTime: endTime - Math.max(20, Math.round(options.durationSec)),
      endTime,
      failed: false,
      maxInLessonStreak: 12 + Math.floor(Math.random() * 7),
      shouldLearnThings: true,
      enableBonusPoints: true,
    };
    const data = await this.http.json<Record<string, unknown>>(endpoints.session(sessionId), {
      method: 'PUT',
      body: payload,
      label: 'Complete session',
    });
    const xpGain = Number(data.xpGain ?? data.totalXpGain ?? 15);
    return { xpGain: Number.isFinite(xpGain) ? xpGain : 15, raw: data };
  }

  async buyStreakFreeze(): Promise<{ status: number }> {
    return this.buyItem('streak_freeze');
  }

  /**
   * Buy anything the shop sells.
   *
   * `retries: 0` on purpose: a purchase is not idempotent, and a retried POST
   * after a timeout could charge twice.
   */
  async buyItem(itemId: string): Promise<{ status: number }> {
    const response = await this.http.request<unknown>(endpoints.shopItems(this.userId), {
      method: 'POST',
      body: { itemId },
      label: `Buy ${itemId}`,
      retries: 0,
    });
    return { status: response.status };
  }

  /**
   * The live shop, normalised to ids and gem prices.
   *
   * Throws when the endpoint answers with a shape we do not recognise — the
   * caller is expected to fall back to the reference catalogue and say so,
   * rather than render an empty shop as if the account owned everything.
   */
  async getShop(): Promise<LiveShopItem[]> {
    const raw = await this.http.json<unknown>(endpoints.shopItems(this.userId), {
      label: 'Shop',
      retries: 0,
    });
    const items = normaliseShop(raw);
    if (!items) throw new AppError('PARSE', 'The shop returned a shape this build does not understand.');
    return items;
  }

  async claimRewards(maxClaims: number): Promise<ClaimOutcome> {
    const profile = await this.getProfile();
    const bundles: DuoRewardBundle[] = Array.isArray(profile.rawBundles) ? profile.rawBundles : [];
    const details: RewardClaimDetail[] = [];
    let gems = 0;
    let remaining = false;

    for (const bundle of bundles) {
      const bundleType = String(bundle.rewardBundleType ?? 'REWARD');
      for (const reward of bundle.rewards ?? []) {
        if (reward.consumed) continue;
        if (details.length >= maxClaims) {
          remaining = true;
          break;
        }
        const rewardId = String(reward.id ?? '');
        if (!rewardId) continue;
        try {
          await this.http.request<unknown>(endpoints.reward(this.userId, rewardId), {
            method: 'PATCH',
            body: { consumed: true },
            label: `Claim ${bundleType}`,
            retries: 0,
          });
          let amount = Number(reward.amount ?? 0);
          for (const item of reward.items ?? []) {
            if (item.itemType === 'GEM') amount += Number(item.amount ?? 0);
          }
          gems += amount;
          details.push({ type: bundleType, rewardId, gems: amount });
        } catch {
          /* a single reward failure must not abort the sweep */
        }
      }
      if (remaining) break;
    }

    return { claimedCount: details.length, gems, details, remaining };
  }

  async getGoals(timezone: string): Promise<DuoGoalsResponse> {
    return this.http.json<DuoGoalsResponse>(endpoints.goalsProgress(this.userId, timezone), {
      label: 'Goals',
      retries: 1,
    });
  }

  async missingBadges(timezone: string, years: number[]): Promise<Array<{ month: number; year: number }>> {
    const goals = await this.getGoals(timezone);
    const earned = new Set(goals.badges?.earned ?? []);
    const missing: Array<{ month: number; year: number }> = [];
    const now = new Date();
    for (const year of years) {
      for (let month = 1; month <= 12; month += 1) {
        // A month that has not finished yet cannot be earned — counting it would
        // report 12 "missing" badges every January.
        if (year === now.getFullYear() && month >= now.getMonth() + 1) continue;
        if (year > now.getFullYear()) continue;
        const challenge = `${year}_${String(month).padStart(2, '0')}_monthly_challenge`;
        const goal = `${year}_${String(month).padStart(2, '0')}_monthly_goal`;
        if (!earned.has(challenge) && !earned.has(goal)) missing.push({ month, year });
      }
    }
    return missing;
  }
}

export function normaliseProfile(raw: DuoProfileResponse, fallbackUserId: string): Profile {
  const streakData = raw.streakData ?? {};
  const streak = Number(streakData.currentStreak ?? raw.streak ?? 0);
  const freezes = Number(streakData.freezeCount ?? streakData.streakFreezeCount ?? 0);
  return {
    userId: String(raw.id ?? fallbackUserId),
    username: String(raw.username ?? 'learner'),
    displayName: String(raw.name ?? raw.displayName ?? raw.username ?? 'learner'),
    streak: Number.isFinite(streak) ? streak : 0,
    totalXp: Number(raw.totalXp ?? 0),
    gems: Number(raw.gems ?? raw.lingots ?? 0),
    hearts: Number(raw.hearts ?? 5),
    maxHearts: Number(raw.maxHearts ?? 5),
    fromLanguage: String(raw.fromLanguage ?? 'en'),
    learningLanguage: String(raw.learningLanguage ?? 'es'),
    streakFreezes: Number.isFinite(freezes) ? freezes : 0,
    hasPlus: Boolean(raw.hasPlus),
    league: null,
    avatarUrl: typeof raw.picture === 'string' ? raw.picture : typeof raw.avatar === 'string' ? raw.avatar : null,
    fetchedAt: Date.now(),
    rawBundles: Array.isArray(raw.rewardBundles) ? raw.rewardBundles : [],
  };
}

/**
 * Pull ids and gem prices out of whatever the shop endpoint returned.
 *
 * Returns `null` when the payload is not a list at all, so the caller can tell
 * "the shop is empty" apart from "we cannot read this shop".
 */
export function normaliseShop(raw: unknown): LiveShopItem[] | null {
  const list = Array.isArray(raw)
    ? raw
    : isRecord(raw) && Array.isArray(raw.items)
      ? raw.items
      : isRecord(raw) && Array.isArray(raw.shopItems)
        ? raw.shopItems
        : null;
  if (!list) return null;

  const items: LiveShopItem[] = [];
  for (const entry of list) {
    if (!isRecord(entry)) continue;
    const nested = isRecord(entry.item) ? entry.item : {};
    const rawId = entry.itemId ?? entry.id ?? nested.id;
    const id = typeof rawId === 'string' || typeof rawId === 'number' ? String(rawId) : '';
    if (!id) continue;

    const price = Number(entry.price ?? entry.priceGems ?? nested.price ?? entry.amount);
    items.push({ id, priceGems: Number.isFinite(price) && price > 0 ? price : null });
  }
  return items;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
