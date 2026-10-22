// Copyright github.com/nguyenphanno © 2026. All rights reserved
/**
 * TokenProvider.ts — resolves the active Duolingo session.
 *
 * Priority: explicit manual token (if configured) -> live `jwt_token` cookie
 * on duolingo.com. Reading the cookie means the user never has to copy a
 * credential by hand, and it auto-heals when they sign in again.
 */
import { JWT_COOKIE_NAME, DUO_ORIGIN } from '@Shared/Constants';
import { AppError } from '@Shared/Result';
import type { TokenInfo } from '@Shared/Protocol';
import type { Settings } from '@Shared/Types';
import { looksLikeJwt, parseToken, stripBearer } from './Jwt';

export interface TokenReadOptions {
  source: Settings['tokenSource'];
  manualToken: string;
}

export class TokenProvider {
  async readCookie(): Promise<string | null> {
    if (typeof chrome === 'undefined' || !chrome.cookies?.get) return null;
    try {
      const cookie = await chrome.cookies.get({ url: DUO_ORIGIN, name: JWT_COOKIE_NAME });
      const value = cookie?.value?.trim();
      return value && looksLikeJwt(value) ? stripBearer(value) : null;
    } catch {
      return null;
    }
  }

  async resolve(options: TokenReadOptions): Promise<string> {
    if (options.source === 'manual') {
      const manual = stripBearer(options.manualToken);
      if (!manual) throw new AppError('NO_TOKEN', 'Manual token mode is on but no token was saved.');
      return manual;
    }
    const cookie = await this.readCookie();
    if (cookie) return cookie;

    // Cookie source failed — fall back to a stored manual token if present.
    const manual = stripBearer(options.manualToken);
    if (manual) return manual;

    throw new AppError(
      'NO_TOKEN',
      'No Duolingo session found. Sign in at duolingo.com, or switch to a manual token.',
    );
  }

  async info(options: TokenReadOptions): Promise<TokenInfo> {
    const empty: TokenInfo = {
      present: false,
      valid: false,
      source: 'none',
      userId: null,
      username: null,
      expiresAt: null,
      daysLeft: null,
      message: 'No session found.',
    };

    const cookie = await this.readCookie();
    const manual = stripBearer(options.manualToken);
    const source: TokenInfo['source'] = cookie ? 'cookie' : manual ? 'manual' : 'none';
    const token = cookie ?? manual;
    if (!token) return empty;

    try {
      const parsed = parseToken(token);
      return {
        present: true,
        valid: parsed.valid,
        source,
        userId: parsed.userId || null,
        username: parsed.username,
        expiresAt: parsed.expiresAt,
        daysLeft: parsed.daysLeft,
        message: parsed.reason,
      };
    } catch (error) {
      return { ...empty, present: true, source, message: (error as Error).message };
    }
  }

  inspect(raw: string): TokenInfo {
    try {
      const parsed = parseToken(raw);
      return {
        present: true,
        valid: parsed.valid,
        source: 'manual',
        userId: parsed.userId || null,
        username: parsed.username,
        expiresAt: parsed.expiresAt,
        daysLeft: parsed.daysLeft,
        message: parsed.reason,
      };
    } catch (error) {
      return {
        present: true,
        valid: false,
        source: 'manual',
        userId: null,
        username: null,
        expiresAt: null,
        daysLeft: null,
        message: (error as Error).message,
      };
    }
  }
}

export const tokenProvider = new TokenProvider();
