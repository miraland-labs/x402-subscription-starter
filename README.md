# x402 Subscription Starter (Seller)

Forkable reference seller for the **`exact` subscription** pattern on pr402/x402:

**Pay once → JWT time window → Bearer auth on data routes → fair-use rate limits.**

| Per-call `exact` (solrisk) | **Subscription `exact` (this starter)** | `sla-escrow` (buy-spl-token) |
|----------------------------|----------------------------------------|------------------------------|
| 402 on every request | 402 only on `/subscribe` | Escrow + oracle delivery |

## Quick start

```bash
cp .env.example .env
# Set MERCHANT_WALLET, X402_PAY_TO, X402_ACCEPTS_EXTRA_JSON (use x402-seller-starter find-payto)
openssl rand -hex 32   # → JWT_SECRET

npm install
npm run build
# Edit scripts/parameters-seed-devnet.sql placeholders, then:
npm run seed
npm run dev
```

Probe: `curl http://127.0.0.1:3000/api/v1/subscribe/info`

## Pricing configuration

**Priority:** SQLite `parameters` table → env vars fallback.

Each tier uses endpoint key `/api/v1/subscribe/<tier>` with `X402_ACCEPTS_JSON` row. See `scripts/parameters-seed-devnet.sql`.

## JWT persistence (tell every subscriber)

The seller issues a JWT **once per x402 payment**. Subscribers must **save the token locally** — file, DB, or secrets manager. After app or machine restart, reuse the Bearer token until `exp`. Renew via `/subscribe` when `TOKEN_EXPIRED`.

Subscribe response includes `persistenceHint`. Buyer SDK: [x402-subscription-client](../x402-subscription-client/).

## Replace the stub route

Copy `POST /api/v1/echo` pattern in `src/server.ts` — add your handlers behind `requireBearerToken` + `payerLimiter`.

## Live example deployment

[FIFA World Cup scraper](https://fifa.polystrike.io/devnet) — domain-specific fork of this pattern (RSS news, operated host).

## Docs

- [SUBSCRIPTION_PATTERN.md](../SUBSCRIPTION_PATTERN.md)
- [x402-seller-starter](../x402-seller-starter/) — base x402 env contract
- [x402-subscription-client](../x402-subscription-client/) — buyer SDK

## Production database

SQLite ships with this starter for zero-config reference. Paid services may use **PostgreSQL** with the same `parameters` and `subscriptions` tables.
