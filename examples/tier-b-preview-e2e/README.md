# Tier B hosted auth + Preview E2E (seller)

Optional walkthrough. Default [starter README](../../README.md) is **Tier A** (`JWT_SECRET`).

Stack:

- **pr402 Preview** — `https://preview.ipay.sh` (x402 on `/subscribe`)
- **subscription-auth Preview** — `https://preview.auth.ipay.sh` (RS256 JWT)

**Seller guide:** [subscription-auth/docs/SUBSCRIPTION_AUTH_FOR_SELLERS.md](https://github.com/miralandlabs/subscription-auth/blob/main/docs/SUBSCRIPTION_AUTH_FOR_SELLERS.md)

---

## Prerequisites

1. **Auth Preview healthy:** Run the smoke test from your local [subscription-auth](https://github.com/miralandlabs/subscription-auth) clone:
   ```bash
   /path/to/subscription-auth/scripts/smoke-preview.sh
   ```
2. **Seller keypair:** Locate your seller keypair (e.g. `seller-keypair.json`).
3. **Register your service:** Register your merchant identity with the auth service:
   ```bash
   node /path/to/subscription-auth/scripts/register-service.mjs \
     --keypair /path/to/seller-keypair.json
   ```
4. **Buyer wallet:** Ensure your buyer wallet is funded with devnet USDC. See the [client example](https://github.com/miraland-labs/x402-subscription-client/blob/main/examples/tier-b-preview-e2e/README.md).

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
const raw = Uint8Array.from(JSON.parse(readFileSync('/path/to/seller-keypair.json','utf8')));
console.log(bs58.encode(raw));
"
```

---

## Run

```bash
chmod +x run-seller.sh && ./run-seller.sh
```

Expect: `curl http://127.0.0.1:3000/health` → `"subscriptionMode":"tier-b"`.

Buyer (other terminal): [client Tier B example](https://github.com/miraland-labs/x402-subscription-client/blob/main/examples/tier-b-preview-e2e/README.md).

---

**Full stack** (pr402 Preview + local seller + buyer): Run `./run-seller.sh` and the client Tier B example in two terminals.

**Auth-only testing (no USDC payment required):**

```bash
node /path/to/subscription-auth/scripts/e2e-tier-b-auth.mjs \
  --keypair /path/to/seller-keypair.json
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

- [subscription-auth](https://github.com/miralandlabs/subscription-auth/blob/main/README.md)
- [@pr402/subscription-seller](https://www.npmjs.com/package/@pr402/subscription-seller)
- [SUBSCRIPTION_PATTERN.md](https://github.com/miraland-labs/x402/blob/main/SUBSCRIPTION_PATTERN.md)
