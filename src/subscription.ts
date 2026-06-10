import jwt from 'jsonwebtoken';

export type Tier = 'hourly' | 'daily' | 'monthly';

export interface TokenPayload {
  payer: string;
  tier: Tier;
  iat: number;
  exp: number;
}

export const TIER_DURATIONS_SEC: Record<Tier, number> = {
  hourly:  60 * 60,
  daily:   24 * 60 * 60,
  monthly: 30 * 24 * 60 * 60,
};

export const TIER_LABELS: Record<Tier, string> = {
  hourly:  '1 hour',
  daily:   '24 hours',
  monthly: '30 days',
};

export const ALL_TIERS: Tier[] = ['hourly', 'daily', 'monthly'];

export const JWT_PERSISTENCE_HINT =
  'Save this JWT locally (file, DB, or secrets manager). After app or machine restart, ' +
  'present the same Bearer token until it expires. The seller does not re-issue a token ' +
  'without a new x402 payment. Renew via POST /api/v1/subscribe when TOKEN_EXPIRED.';

export function issueToken(
  payer: string,
  tier: Tier,
  secret: string,
): { token: string; expiresAt: Date } {
  const durationSec = TIER_DURATIONS_SEC[tier];
  const token = jwt.sign({ payer, tier }, secret, {
    algorithm: 'HS256',
    expiresIn: durationSec,
  });
  const decoded = jwt.decode(token) as TokenPayload;
  return { token, expiresAt: new Date(decoded.exp * 1000) };
}

export function verifyToken(token: string, secret: string): TokenPayload {
  return jwt.verify(token, secret, { algorithms: ['HS256'] }) as TokenPayload;
}

export function decodeToken(token: string): TokenPayload | null {
  return jwt.decode(token) as TokenPayload | null;
}

export function isValidTier(value: unknown): value is Tier {
  return ALL_TIERS.includes(value as Tier);
}
