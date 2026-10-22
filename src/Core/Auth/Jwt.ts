// Copyright github.com/nguyenphanno © 2026. All rights reserved
/**
 * Jwt.ts — Duolingo session token parsing.
 *
 * We never verify the signature (the server does that); we only need the
 * claims to know who the token belongs to and whether it is still fresh.
 */

export interface JwtClaims {
  sub?: string;
  exp?: number;
  iat?: number;
  username?: string;
  [key: string]: unknown;
}

export interface ParsedToken {
  token: string;
  claims: JwtClaims;
  userId: string;
  username: string | null;
  expiresAt: number | null;
  daysLeft: number | null;
  valid: boolean;
  reason: string;
}

function base64UrlDecode(segment: string): string {
  const normalised = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalised + '='.repeat((4 - (normalised.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function stripBearer(raw: string): string {
  return raw.trim().replace(/^Bearer\s+/i, '').trim();
}

export function decodeJwt(raw: string): JwtClaims {
  const token = stripBearer(raw);
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Not a JWT: expected three dot-separated segments.');
  }
  const payload = parts[1] ?? '';
  try {
    return JSON.parse(base64UrlDecode(payload)) as JwtClaims;
  } catch (error) {
    throw new Error(`Could not decode the token payload: ${(error as Error).message}`);
  }
}

export function parseToken(raw: string): ParsedToken {
  const token = stripBearer(raw);
  const claims = decodeJwt(token);
  const userId = claims.sub ? String(claims.sub) : '';
  const expiresAt = typeof claims.exp === 'number' ? claims.exp * 1000 : null;
  const daysLeft = expiresAt === null ? null : (expiresAt - Date.now()) / 86_400_000;
  const expired = daysLeft !== null && daysLeft <= 0;

  return {
    token,
    claims,
    userId,
    username: typeof claims.username === 'string' ? claims.username : null,
    expiresAt,
    daysLeft,
    valid: Boolean(userId) && !expired,
    reason: !userId ? 'Token has no subject (user id).' : expired ? 'Token expired.' : 'Token looks valid.',
  };
}

export function looksLikeJwt(raw: string): boolean {
  const token = stripBearer(raw);
  return token.split('.').length === 3 && token.length > 40;
}
