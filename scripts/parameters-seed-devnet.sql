-- Tier pricing for x402-subscription-starter (devnet)
-- Generate accepts[] via POST https://preview.ipay.sh/api/v1/facilitator/payment-required/enrich
-- Replace payTo, asset, network, and extra fields with your find-payto output.

INSERT OR REPLACE INTO parameters (service, endpoint, param_name, param_value, inactive, created_at, updated_at) VALUES

('x402-subscription-starter', '/api/v1/subscribe/hourly', 'X402_ACCEPTS_JSON',
 '[{"scheme":"exact","network":"solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1","asset":"4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU","amount":"50000","payTo":"<DEVNET_VAULT_PDA>","maxTimeoutSeconds":120,"extra":{"merchantWallet":"<MERCHANT_WALLET>"}}]',
 0, datetime('now'), datetime('now')),

('x402-subscription-starter', '/api/v1/subscribe/daily', 'X402_ACCEPTS_JSON',
 '[{"scheme":"exact","network":"solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1","asset":"4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU","amount":"300000","payTo":"<DEVNET_VAULT_PDA>","maxTimeoutSeconds":120,"extra":{"merchantWallet":"<MERCHANT_WALLET>"}}]',
 0, datetime('now'), datetime('now')),

('x402-subscription-starter', '/api/v1/subscribe/monthly', 'X402_ACCEPTS_JSON',
 '[{"scheme":"exact","network":"solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1","asset":"4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU","amount":"2000000","payTo":"<DEVNET_VAULT_PDA>","maxTimeoutSeconds":120,"extra":{"merchantWallet":"<MERCHANT_WALLET>"}}]',
 0, datetime('now'), datetime('now'));
