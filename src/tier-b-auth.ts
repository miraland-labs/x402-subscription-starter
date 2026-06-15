import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import {
  issueTokenViaAuthService,
  verifyTokenWithJwks,
  createRevocationPollCache,
  type RevocationPollCache,
  type Tier,
} from '@pr402/subscription-seller';

export function isTierBMode(): boolean {
  return (process.env.SUBSCRIPTION_MODE ?? 'local').toLowerCase() === 'tier-b';
}

export function authServiceBaseUrl(): string {
  const url = process.env.SUBSCRIPTION_AUTH_BASE_URL;
  if (!url) {
    throw new Error('SUBSCRIPTION_AUTH_BASE_URL is required when SUBSCRIPTION_MODE=tier-b');
  }
  return url.replace(/\/+$/, '');
}

export function authServiceId(): string {
  const id = process.env.SUBSCRIPTION_AUTH_SERVICE_ID;
  if (!id) {
    throw new Error('SUBSCRIPTION_AUTH_SERVICE_ID is required when SUBSCRIPTION_MODE=tier-b');
  }
  return id;
}

export function jwksUrl(): string {
  return `${authServiceBaseUrl()}/.well-known/jwks.json`;
}

function merchantKeypair(): Keypair {
  const secret = process.env.SUBSCRIPTION_AUTH_MERCHANT_SECRET_KEY;
  if (!secret?.trim()) {
    throw new Error('SUBSCRIPTION_AUTH_MERCHANT_SECRET_KEY (base58) required for tier-b');
  }
  return Keypair.fromSecretKey(bs58.decode(secret.trim()));
}

export async function issueTokenTierB(
  payer: string,
  tier: Tier,
  resources: string[] = ['*'],
): Promise<{ token: string; expiresAt: Date; jti?: string }> {
  const kp = merchantKeypair();
  const result = await issueTokenViaAuthService({
    baseUrl: authServiceBaseUrl(),
    merchantWallet: kp.publicKey.toBase58(),
    serviceId: authServiceId(),
    payer,
    tier,
    resources,
    signMessage: async (message) => {
      const sig = nacl.sign.detached(message, kp.secretKey);
      return Buffer.from(sig).toString('base64');
    },
  });
  return {
    token: result.token,
    expiresAt: new Date(result.expiresAt),
    jti: result.jti,
  };
}

export async function verifyTokenTierB(token: string) {
  return verifyTokenWithJwks(token, {
    jwksUrl: jwksUrl(),
    expectedIss: process.env.SUBSCRIPTION_AUTH_ISS,
    expectedSub: authServiceId(),
  });
}

let revocationCache: RevocationPollCache | null = null;

export function getRevocationCache(): RevocationPollCache {
  if (!revocationCache) {
    revocationCache = createRevocationPollCache({
      baseUrl: authServiceBaseUrl(),
      serviceId: authServiceId(),
      intervalSec: parseInt(process.env.REVOCATION_POLL_INTERVAL_SEC ?? '60', 10),
      failClosed: process.env.REVOCATION_FAIL_CLOSED === 'true',
    });
    revocationCache.start();
  }
  return revocationCache;
}

export function isTokenRevokedTierB(jti: string | undefined): boolean {
  if (!jti) return false;
  return getRevocationCache().isRevoked(jti);
}
