import { AppDb } from '../db.js';
import { Tier, TIER_LABELS } from '../subscription.js';

export type AcceptsRow = {
  scheme: string;
  network: string;
  asset: string;
  amount: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra?: Record<string, unknown>;
};

export type PaymentRequired = {
  x402Version: 2;
  error?: string;
  resource: { url: string; description: string; mimeType: string };
  accepts: AcceptsRow[];
  extensions: { pr402FacilitatorUrl: string };
};

export function serviceName(): string {
  return (process.env.SERVICE_NAME || 'x402-subscription-starter').trim();
}

export function subscriptionEndpointKey(tier: Tier): string {
  return `/api/v1/subscribe/${tier}`;
}

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === '') {
    throw new Error(`missing required env var \`${name}\`.`);
  }
  return v;
}

function trimTrailingSlash(s: string): string {
  return s.replace(/\/+$/, '');
}

export function resolveParameter(name: string, endpoint: string, db?: AppDb): string {
  if (db) {
    const dbVal = db.resolveParameter(serviceName(), endpoint, name);
    if (dbVal && dbVal.trim() !== '') return dbVal;
  }
  return required(name);
}

export function resolveParameterOptional(name: string, endpoint: string, db?: AppDb): string | null {
  if (db) {
    const dbVal = db.resolveParameter(serviceName(), endpoint, name);
    if (dbVal && dbVal.trim() !== '') return dbVal;
  }
  return process.env[name] || null;
}

export function acceptsFromConfig(endpoint: string, db?: AppDb): AcceptsRow[] {
  const fullJson = resolveParameterOptional('X402_ACCEPTS_JSON', endpoint, db)?.trim();
  if (fullJson) {
    const parsed: unknown = JSON.parse(fullJson);
    if (!Array.isArray(parsed)) throw new Error('X402_ACCEPTS_JSON must be a JSON array.');
    return parsed as AcceptsRow[];
  }

  const maxTimeoutRaw = resolveParameter('X402_MAX_TIMEOUT_SECONDS', endpoint, db);
  const maxTimeoutSeconds = Number.parseInt(maxTimeoutRaw, 10);
  if (!Number.isFinite(maxTimeoutSeconds) || maxTimeoutSeconds < 0) {
    throw new Error(`X402_MAX_TIMEOUT_SECONDS must be a non-negative integer: ${maxTimeoutRaw}`);
  }

  const row: AcceptsRow = {
    scheme: resolveParameter('X402_SCHEME', endpoint, db),
    network: resolveParameter('X402_NETWORK', endpoint, db),
    asset: resolveParameter('X402_ASSET', endpoint, db),
    amount: resolveParameter('X402_AMOUNT', endpoint, db),
    payTo: resolveParameter('X402_PAY_TO', endpoint, db),
    maxTimeoutSeconds,
  };

  const extraRaw = resolveParameterOptional('X402_ACCEPTS_EXTRA_JSON', endpoint, db)?.trim();
  if (extraRaw) row.extra = JSON.parse(extraRaw) as Record<string, unknown>;

  const merchantWallet = (
    resolveParameterOptional('MERCHANT_WALLET', endpoint, db) ??
    resolveParameterOptional('SELLER_WALLET', endpoint, db) ??
    ''
  ).trim();

  if (merchantWallet && row.extra && !('merchantWallet' in row.extra)) {
    row.extra['merchantWallet'] = merchantWallet;
  } else if (merchantWallet && !row.extra) {
    row.extra = { merchantWallet };
  }

  return [row];
}

export function buildSubscriptionPaymentRequired(tier: Tier, db?: AppDb): PaymentRequired {
  const endpointKey = subscriptionEndpointKey(tier);
  const publicBase = trimTrailingSlash(resolveParameter('SELLER_PUBLIC_BASE_URL', endpointKey, db));
  const facilitatorBase = trimTrailingSlash(resolveParameter('FACILITATOR_BASE_URL', endpointKey, db));
  const productName = resolveParameterOptional('SERVICE_DISPLAY_NAME', endpointKey, db) ?? 'API subscription';

  return {
    x402Version: 2,
    resource: {
      url: `${publicBase}/api/v1/subscribe?tier=${tier}`,
      description: `${productName} — ${TIER_LABELS[tier]} unlimited access`,
      mimeType: 'application/json',
    },
    accepts: acceptsFromConfig(endpointKey, db),
    extensions: { pr402FacilitatorUrl: facilitatorBase },
  };
}

export function parsePaymentHeader(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const decoded = Buffer.from(trimmed, 'base64').toString('utf8');
    return JSON.parse(decoded) as Record<string, unknown>;
  }
}

export function encodePaymentResponse(settleResult: unknown): string {
  return Buffer.from(JSON.stringify(settleResult), 'utf8').toString('base64');
}
