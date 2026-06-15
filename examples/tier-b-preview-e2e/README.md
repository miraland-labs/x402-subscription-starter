# Tier B hosted auth + Preview E2E (seller)

Optional walkthrough. Default [starter README](../../README.md) is **Tier A** (`JWT_SECRET`).

Stack:

- **pr402 Preview** — `https://preview.ipay.sh` (x402 on `/subscribe`)
- **subscription-auth Preview** — `https://preview.auth.ipay.sh` (RS256 JWT)

**Seller guide:** [subscription-auth/docs/SUBSCRIPTION_AUTH_FOR_SELLERS.md](../../../subscription-auth/docs/SUBSCRIPTION_AUTH_FOR_SELLERS.md)

---

## Prerequisites

1. Auth Preview healthy:
   ```bash
   ../../../subscription-auth/scripts/smoke-preview.sh
   ```
2. Seller keypair (`demo-wallets/seller-keypair.json` in hub).
3. Register once:
   ```bash
   node ../../../subscription-auth/scripts/register-service.mjs \
     --keypair ../../../demo-wallets/seller-keypair.json
   ```
4. Buyer wallet with devnet USDC (~0.05 USDC hourly). See [client example](../../../x402-subscription-client/examples/tier-b-preview-e2e/README.md).

---

## Setup

```bash
cp .env.example .env.local
```

Set `SUBSCRIPTION_AUTH_MERCHANT_SECRET_KEY` (base58 of 64-byte secret):

```bash
node -e "
import bs58 from 'bs58';
import { readFileSync } from 'fs';
const raw = Uint8Array.from(JSON.parse(readFileSync('../../../demo-wallets/seller-keypair.json','utf8')));
console.log(bs58.encode(raw));
"
```

---

## Run

```bash
chmod +x run-seller.sh && ./run-seller.sh
```

Expect: `curl http://127.0.0.1:3000/health` → `"subscriptionMode":"tier-b"`.

Buyer (other terminal): [client Tier B example](../../../x402-subscription-client/examples/tier-b-preview-e2e/README.md).

---

**Full stack** (pr402 Preview + local seller + buyer): run `./run-seller.sh` and [client Tier B example](../../../x402-subscription-client/examples/tier-b-preview-e2e/README.md) in two terminals.

Auth-only (no USDC):

```bash
node ../../../subscription-auth/scripts/e2e-tier-b-auth.mjs \
  --keypair ../../../demo-wallets/seller-keypair.json
```

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `SSL_ERROR_SYSCALL` on curl to Preview | Local proxy fake-IP — retry; scripts backoff 5× |
| Verify `missing field feePayer` | Update subscription-client (`pr402-exact-flow` merges capabilities extra) |
| `service_id already registered` | OK — idempotent |

---

## Docs

- [subscription-auth](../../../subscription-auth/README.md)
- [@pr402/subscription-seller](https://www.npmjs.com/package/@pr402/subscription-seller)
- [SUBSCRIPTION_PATTERN.md](../../../SUBSCRIPTION_PATTERN.md)
