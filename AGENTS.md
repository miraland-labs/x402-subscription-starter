# AGENTS.md — x402-subscription-starter

**Philosophy:** Simple is Best, yet Elegant.

Reference **seller** for the x402 **`exact` subscription** pattern: one payment on `/subscribe` → JWT → Bearer on data routes → dual rate limits.

Wire contract: [SUBSCRIPTION_PATTERN.md](../SUBSCRIPTION_PATTERN.md). Buyer SDK: [x402-subscription-client](../x402-subscription-client/).

---

## Invariants

- HTTP **402 + JSON body** only on `POST /api/v1/subscribe?tier=<tier>` — never on data routes.
- Env var names match [x402-seller-starter](../x402-seller-starter/) — do not rename.
- **Pricing:** SQLite `parameters` table per `/api/v1/subscribe/<tier>` → fallback to env vars.
- JWT: `payer` + `tier` claims; `exp` = `TIER_DURATIONS_SEC[tier]`.
- Include `persistenceHint` on subscribe success and 401 responses — buyers must cache JWT locally.
- `PAYMENT-RESPONSE` header on successful subscribe.
- Data routes: Bearer only + DB revocation check + per-payer rate limit after auth.
- Scope = subscription gate + stub `/api/v1/echo` — no scraping, no framework creep.

## Tier extension

1. Seed row in `scripts/parameters-seed-devnet.sql`
2. Extend `Tier` in `src/subscription.ts`
3. Extend `Tier` in `x402-subscription-client`

## Database

- Reference uses **SQLite**. Production sellers may use PostgreSQL with the same `parameters` + `subscriptions` schema.

## Do not

- Add per-request 402 on data endpoints.
- Hardcode tier prices in source.
- Add dependencies without approval.
