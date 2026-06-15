# x402 Subscription Starter (Seller)

Forkable reference seller for the **`exact` subscription** pattern on pr402/x402:

**Pay once → JWT time window → Bearer auth on data routes → fair-use rate limits.**

| Per-call `exact` (solrisk) | **Subscription `exact` (this starter)** | `sla-escrow` (buy-spl-token) |
|----------------------------|----------------------------------------|------------------------------|
| 402 on every request | 402 only on `/subscribe` | Escrow + oracle delivery |

---

## Choose JWT auth (Tier A vs Tier B)

| Tier | Setup | When |
|------|-------|------|
| **A — local** (default) | `JWT_SECRET` in `.env` | Single seller, fastest fork |
| **B — hosted** | `SUBSCRIPTION_MODE=tier-b` + [subscription-auth](https://github.com/miralandlabs/subscription-auth) | RS256/JWKS, central revocation |

**→ Full guide:** [subscription-auth seller guide](https://github.com/miralandlabs/subscription-auth/blob/main/docs/SUBSCRIPTION_AUTH_FOR_SELLERS.md)

x402 payment on `/subscribe` is the same for both tiers.

---

## Quick start (Tier A)

```bash
cp .env.example .env
# MERCHANT_WALLET, X402_PAY_TO, X402_ACCEPTS_EXTRA_JSON (x402-seller-starter find-payto)
openssl rand -hex 32   # → JWT_SECRET

npm install && npm run build
# Edit scripts/parameters-seed-devnet.sql, then:
npm run seed && npm run dev
```

Probe: `curl http://127.0.0.1:3000/api/v1/subscribe/info`

SDK: [`@pr402/subscription-seller`](https://www.npmjs.com/package/@pr402/subscription-seller)

---

## Tier B (hosted auth)

1. Register on auth service (once): `node …/subscription-auth/scripts/register-service.mjs --keypair …`
2. Copy [examples/tier-b-preview-e2e/.env.example](examples/tier-b-preview-e2e/.env.example) → `.env.local`
3. `./examples/tier-b-preview-e2e/run-seller.sh`

Details: [examples/tier-b-preview-e2e/README.md](examples/tier-b-preview-e2e/README.md) (run seller + buyer in two terminals).

---

## Pricing

**Priority:** SQLite `parameters` → env fallback. Each tier: `/api/v1/subscribe/<tier>` + `X402_ACCEPTS_JSON`. See `scripts/parameters-seed-devnet.sql`.

---

## JWT persistence (tell every subscriber)

One JWT per x402 payment. Buyers must **save the token locally** until `exp`. Renew via `/subscribe` on `TOKEN_EXPIRED`.

Subscribe response includes `persistenceHint`. Buyer SDK: [x402-subscription-client](https://github.com/miralandlabs/x402-subscription-client).

---

## Replace the stub route

Copy `POST /api/v1/echo` in `src/server.ts` — add handlers behind `requireBearerToken` + `payerLimiter`.

---

## Docs

- [SUBSCRIPTION_PATTERN.md](https://github.com/miralandlabs/x402/blob/master/SUBSCRIPTION_PATTERN.md)
- [SUBSCRIPTION_AUTH_FOR_SELLERS.md](https://github.com/miralandlabs/subscription-auth/blob/main/docs/SUBSCRIPTION_AUTH_FOR_SELLERS.md)
- [x402-seller-starter](https://github.com/miralandlabs/x402-seller-starter) — x402 env contract
- Operated example: `https://fifa.polystrike.io/devnet` (`GET /health`)

Production DB: SQLite for reference; Postgres supported with same schema.
