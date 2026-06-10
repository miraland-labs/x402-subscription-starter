import 'dotenv/config';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { AppDb } from './db.js';
import { FacilitatorClient } from './x402/facilitator.js';
import {
  buildSubscriptionPaymentRequired,
  encodePaymentResponse,
  parsePaymentHeader,
} from './x402/payment-required.js';
import {
  issueToken,
  verifyToken,
  decodeToken,
  isValidTier,
  TIER_DURATIONS_SEC,
  TIER_LABELS,
  ALL_TIERS,
  JWT_PERSISTENCE_HINT,
  type Tier,
} from './subscription.js';

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const dbPath = process.env.DATABASE_URL || './data/subscription.db';
const facilitatorUrl = process.env.FACILITATOR_BASE_URL || 'https://preview.ipay.sh';
const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret || jwtSecret.trim() === '') {
  console.error('[x402-subscription-starter] FATAL: JWT_SECRET is not set.');
  process.exit(1);
}

const db = new AppDb(dbPath);
const facilitator = new FacilitatorClient(facilitatorUrl);
const app = express();

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
  keyGenerator: (req) => (req as express.Request & { subscriptionPayload: { payer: string } }).subscriptionPayload.payer,
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
      const { token, expiresAt } = issueToken(payer, tier, jwtSecret);
      const txSig = settled['transaction'] as string | undefined;
      const issuedAt = new Date((decodeToken(token)!.iat ?? Math.floor(Date.now() / 1000)) * 1000);
      db.recordSubscription(payer, tier, issuedAt, expiresAt, txSig);

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
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.setHeader('PAYMENT-RESPONSE', encodePaymentResponse({ success: false, errorReason: message }));
      res.status(402).json({ ...pr, error: `Facilitator: ${message}` });
    }
  };

const requireBearerToken: express.RequestHandler = (req, res, next) => {
  const publicBase = process.env.SELLER_PUBLIC_BASE_URL ?? `http://localhost:${port}`;
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'MISSING_TOKEN',
      message: 'Authorization: Bearer <token> header is required.',
      subscribeUrl: `${publicBase}/api/v1/subscribe/info`,
      persistenceHint: JWT_PERSISTENCE_HINT,
    });
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();

  try {
    const payload = verifyToken(token, jwtSecret);
    const issuedAtIso = new Date(payload.iat * 1000).toISOString();
    if (db.isTokenRevoked(payload.payer, issuedAtIso)) {
      res.status(401).json({
        error: 'TOKEN_REVOKED',
        message: 'This subscription token has been revoked.',
        subscribeUrl: `${publicBase}/api/v1/subscribe/info`,
      });
      return;
    }
    (req as express.Request & { subscriptionPayload: typeof payload }).subscriptionPayload = payload;
    next();
  } catch (err: unknown) {
    const isExpired = err instanceof Error && err.name === 'TokenExpiredError';
    res.status(401).json({
      error: isExpired ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID',
      message: isExpired
        ? 'Subscription token has expired. Renew via POST /api/v1/subscribe.'
        : `Invalid token: ${err instanceof Error ? err.message : String(err)}`,
      subscribeUrl: `${publicBase}/api/v1/subscribe/info`,
      persistenceHint: JWT_PERSISTENCE_HINT,
    });
  }
};

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'x402-subscription-starter', db: 'connected' });
});

app.get('/api/v1/subscribe/info', (_req, res) => {
  const publicBase = process.env.SELLER_PUBLIC_BASE_URL ?? `http://localhost:${port}`;
  res.json({
    service: process.env.SERVICE_DISPLAY_NAME ?? 'x402 Subscription API (starter)',
    description: 'Pay once with x402 exact rail, receive a JWT for unlimited data calls within the tier window.',
    persistenceHint: JWT_PERSISTENCE_HINT,
    tiers: ALL_TIERS.map((tier) => ({
      tier,
      label: TIER_LABELS[tier],
      durationSeconds: TIER_DURATIONS_SEC[tier],
      subscribeEndpoint: `POST ${publicBase}/api/v1/subscribe?tier=${tier}`,
    })),
    dataEndpoints: [
      { method: 'POST', path: '/api/v1/echo', description: 'Stub protected route — returns payer + tier' },
    ],
    authScheme: 'Authorization: Bearer <token>',
    pricingSource: 'SQLite parameters table (per-tier endpoint keys), fallback to env vars',
  });
});

app.get('/.well-known/x402-resources.json', (_req, res) => {
  const publicBase = process.env.SELLER_PUBLIC_BASE_URL ?? `http://localhost:${port}`;
  res.json(
    ALL_TIERS.map((tier) => ({
      id: `subscribe-${tier}`,
      title: `Subscription — ${TIER_LABELS[tier]}`,
      description: `Pay once (x402 exact) for ${TIER_LABELS[tier]} of API access.`,
      category: 'subscription',
      method: 'POST',
      resourceUrl: `${publicBase}/api/v1/subscribe?tier=${tier}`,
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

// Stub protected data route — replace with your business logic
app.post('/api/v1/echo', requireBearerToken, payerLimiter, (req, res) => {
  const payload = (req as express.Request & { subscriptionPayload: { payer: string; tier: Tier } }).subscriptionPayload;
  res.json({
    success: true,
    message: 'Protected route OK — replace /api/v1/echo with your API handlers.',
    payer: payload.payer,
    tier: payload.tier,
    echoed: req.body ?? {},
  });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`[x402-subscription-starter] listening on port ${port}`);
});
