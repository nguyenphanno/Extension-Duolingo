/**
 * ProApi.ts — the optional third-party bridge (badges, Super, XP boosts).
 *
 * This is the only place that sends the user's JWT to a host other than
 * Duolingo. It is therefore gated behind an explicit opt-in
 * (`settings.pro.acknowledgeRisk`) plus a second switch per task, because the
 * token genuinely leaves Duolingo's servers.
 */
import { PRO_API_VERSION } from '@Shared/Constants';
import type { ProResponse } from '@Shared/Types';
import { endpoints } from './Endpoints';
import type { HttpClient } from './HttpClient';

export type ProRequestType = 'badge' | 'super' | 'double_xp_boost' | 'xp';

export class ProApi {
  constructor(private readonly http: HttpClient) {}

  private async post(type: ProRequestType, amount: string | number): Promise<ProResponse> {
    return this.http.json<ProResponse>(endpoints.pro(), {
      method: 'POST',
      label: `PRO ${type}`,
      retries: 0,
      body: { type, amount, version: PRO_API_VERSION, lang: 'en' },
    });
  }

  claimMonthlyBadge(month: number, year: number): Promise<ProResponse> {
    return this.post('badge', `${String(month).padStart(2, '0')}-${year}`);
  }

  activateSuper(): Promise<ProResponse> {
    return this.post('super', 1);
  }

  doubleXpBoost(): Promise<ProResponse> {
    return this.post('double_xp_boost', 1);
  }
}
