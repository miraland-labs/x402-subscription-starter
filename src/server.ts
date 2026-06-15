import 'dotenv/config';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import {
  issueToken,
  verifyToken,
  tokenIssuedAtIso,
  isValidTier,
  TIER_DURATIONS_SEC,
  TIER_LABELS,
  ALL_TIERS,
  JWT_PERSISTENCE_HINT,
  requireBearer,
  errorBody,
  HTTP_STATUS,
  type AuthenticatedRequest,
  type Tier,
} from '@pr402/subscription-seller';
import { AppDb } from './db.js';
import { createStrictSubscriptionStore } from './subscription-store.js';
import {
  isTierBMode,
  issueTokenTierB,
  verifyTokenTierB,
  isTokenRevokedTierB,
  authServiceBaseUrl,
  authServiceId,
} from './tier-b-auth.js';
import { FacilitatorClient } from './x402/facilitator.js';
import {
  buildSubscriptionPaymentRequired,
  encodePaymentResponse,
  parsePaymentHeader,
} from './x402/payment-required.js';

const tierB = isTierBMode();
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const dbPath = process.env.DATABASE_URL || './data/subscription.db';
const facilitatorUrl = process.env.FACILITATOR_BASE_URL || 'https://preview.ipay.sh';
const jwtSecret = process.env.JWT_SECRET;

if (!tierB && (!jwtSecret || jwtSecret.trim() === '')) {
  console.error('[x402-subscription-starter] FATAL: JWT_SECRET is not set (required for SUBSCRIPTION_MODE=local).');
  process.exit(1);
}

const db = new AppDb(dbPath);
const subscriptionStore = createStrictSubscriptionStore(db);
const facilitator = new FacilitatorClient(facilitatorUrl);
const app = express();

const publicBase = () => process.env.SELLER_PUBLIC_BASE_URL ?? `http://localhost:${port}`;
const subscribeInfoUrl = () => `${publicBase()}/api/v1/subscribe/info`;

const trustProxyVal = process.env.TRUST_PROXY ?? '1';
app.set('trust proxy', trustProxyVal === 'true' ? true : (trustProxyVal === 'false' ? false : parseInt(trustProxyVal, 10)));

const globalRatePerMin = parseInt(process.env.RATE_LIMIT_GLOBAL_PER_MIN ?? '200', 10);
const payerRatePerMin = parseInt(process.env.RATE_LIMIT_PER_PAYER_PER_MIN ?? '60', 10);

const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: globalRatePerMin,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  validate: false,
  message: {
    error: 'RATE_LIMIT_EXCEEDED',
    message: `Too many requests from this IP. Limit: ${globalRatePerMin} req/min.`,
  },
});

const payerLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: payerRatePerMin,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  validate: false,
  keyGenerator: (req) => (req as AuthenticatedRequest).subscription!.payer,
  message: {
    error: 'SUBSCRIBER_RATE_LIMIT_EXCEEDED',
    message: `Subscriber fair-use limit reached. Limit: ${payerRatePerMin} req/min per wallet.`,
  },
});

app.use(globalLimiter);
app.use(express.json({ limit: '32kb' }));

const requireSubscriptionPayment = (tier: Tier): express.RequestHandler =>
  async (req, res) => {
    const pr = buildSubscriptionPaymentRequired(tier, db);
    const sigHeader = req.headers['payment-signature'];
    const rawSig = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;

    if (!rawSig) {
      res.status(402).json({
        ...pr,
        error: 'PAYMENT-SIGNATURE header is required to purchase a subscription (x402 v2)',
      });
      return;
    }

    try {
      const proof = parsePaymentHeader(rawSig);
      const settled = await facilitator.verifyAndSettle(proof);
      const payer = (settled['payer'] as string | undefined) ?? 'unknown';
      const txSig = settled['transaction'] as string | undefined;

      let token: string;
      let expiresAt: Date;
      let jti: string | undefined;

      if (tierB) {
        const issued = await issueTokenTierB(payer, tier);
        token = issued.token;
        expiresAt = issued.expiresAt;
        jti = issued.jti;
      } else {
        token = issueToken({ payer, tier, secret: jwtSecret! });
        const payload = verifyToken(token, { secret: jwtSecret! });
        expiresAt = new Date(payload.exp * 1000);
        jti = payload.jti;

        subscriptionStore.recordSubscription({
          payer,
          tier,
          issuedAtIso: tokenIssuedAtIso(payload),
          expiresAtIso: expiresAt.toISOString(),
          txHash: txSig,
          jti: payload.jti,
        });
      }

      res.setHeader('PAYMENT-RESPONSE', encodePaymentResponse(settled));
      res.json({
        success: true,
        token,
        tier,
        tierLabel: TIER_LABELS[tier],
        expiresAt: expiresAt.toISOString(),
        durationSeconds: TIER_DURATIONS_SEC[tier],
        usage: 'Authorization: Bearer <token> on protected data routes',
        persistenceHint: JWT_PERSISTENCE_HINT,
        ...(tierB ? { authMode: 'tier-b', jti, serviceId: authServiceId() } : {}),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.setHeader('PAYMENT-RESPONSE', encodePaymentResponse({ success: false, errorReason: message }));
      res.status(402).json({ ...pr, error: `Facilitator: ${message}` });
    }
  };

const requireBearerTokenLocal = requireBearer({
  secret: jwtSecret!,
  store: subscriptionStore,
  subscribeUrl: subscribeInfoUrl(),
});

const requireBearerTokenTierB: express.RequestHandler = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(HTTP_STATUS.MISSING_TOKEN).json(
      errorBody('MISSING_TOKEN', 'Authorization: Bearer <token> required', {
        subscribeUrl: subscribeInfoUrl(),
        persistenceHint: JWT_PERSISTENCE_HINT,
      }),
    );
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  try {
    const payload = await verifyTokenTierB(token);
    if (isTokenRevokedTierB(payload.jti)) {
      res.status(HTTP_STATUS.TOKEN_REVOKED).json(
        errorBody('TOKEN_REVOKED', 'Subscription token revoked', {
          subscribeUrl: subscribeInfoUrl(),
        }),
      );
      return;
    }
    (req as AuthenticatedRequest).subscription = payload;
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      res.status(HTTP_STATUS.TOKEN_EXPIRED).json(
        errorBody('TOKEN_EXPIRED', 'Subscription token expired', {
          subscribeUrl: subscribeInfoUrl(),
        }),
      );
      return;
    }
    res.status(HTTP_STATUS.TOKEN_INVALID).json(
      errorBody('TOKEN_INVALID', 'Invalid subscription token'),
    );
  }
};

const requireBearerToken = tierB ? requireBearerTokenTierB : requireBearerTokenLocal;

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'x402-subscription-starter',
    subscriptionMode: tierB ? 'tier-b' : 'local',
    db: 'connected',
    ...(tierB ? { authService: authServiceBaseUrl() } : {}),
  });
});

app.get('/api/v1/subscribe/info', (_req, res) => {
  res.json({
    service: process.env.SERVICE_DISPLAY_NAME ?? 'x402 Subscription API (starter)',
    description: 'Pay once with x402 exact rail, receive a JWT for unlimited data calls within the tier window.',
    subscriptionMode: tierB ? 'tier-b' : 'local',
    persistenceHint: JWT_PERSISTENCE_HINT,
    ...(tierB
      ? {
          authService: authServiceBaseUrl(),
          serviceId: authServiceId(),
          revocationNote:
            'Revocation may take up to REVOCATION_POLL_INTERVAL_SEC (~60s default). Fail-open during auth blip.',
        }
      : {}),
    tiers: ALL_TIERS.map((tier) => ({
      tier,
      label: TIER_LABELS[tier],
      durationSeconds: TIER_DURATIONS_SEC[tier],
      subscribeEndpoint: `POST ${publicBase()}/api/v1/subscribe?tier=${tier}`,
      resources: ['*'],
    })),
    dataEndpoints: [
      { method: 'POST', path: '/api/v1/echo', description: 'Stub protected route — returns payer + tier' },
    ],
    authScheme: 'Authorization: Bearer <token>',
    pricingSource: 'SQLite parameters table (per-tier endpoint keys), fallback to env vars',
  });
});

app.get('/.well-known/x402-resources.json', (_req, res) => {
  res.json(
    ALL_TIERS.map((tier) => ({
      id: `subscribe-${tier}`,
      title: `Subscription — ${TIER_LABELS[tier]}`,
      description: `Pay once (x402 exact) for ${TIER_LABELS[tier]} of API access.`,
      category: 'subscription',
      method: 'POST',
      resourceUrl: `${publicBase()}/api/v1/subscribe?tier=${tier}`,
      scheme: 'exact',
      tags: ['subscription', tier, 'x402-subscription-starter'],
    })),
  );
});

app.post('/api/v1/subscribe', async (req, res) => {
  const tierParam = (req.query['tier'] as string | undefined)?.toLowerCase();
  if (!isValidTier(tierParam)) {
    res.status(400).json({
      error: 'INVALID_TIER',
      message: `Query param ?tier= must be one of: ${ALL_TIERS.join(', ')}`,
    });
    return;
  }
  return requireSubscriptionPayment(tierParam)(req, res, () => {});
});

app.post('/api/v1/echo', requireBearerToken, payerLimiter, (req, res) => {
  const payload = (req as AuthenticatedRequest).subscription!;
  res.json({
    success: true,
    message: 'Protected route OK — replace /api/v1/echo with your API handlers.',
    payer: payload.payer,
    tier: payload.tier,
    echoed: req.body ?? {},
  });
});

app.listen(port, '0.0.0.0', () => {
  console.log(
    `[x402-subscription-starter] listening on port ${port} mode=${tierB ? 'tier-b' : 'local'}`,
  );
});
