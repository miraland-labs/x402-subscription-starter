import {
  createSubscriptionStore,
  type SubscriptionStore,
  type SubscriptionStoreAdapter,
} from '@pr402/subscription-seller';
import type { AppDb } from './db.js';

function createStoreAdapter(db: AppDb): SubscriptionStoreAdapter {
  return {
    recordSubscription(record) {
      db.recordSubscription(
        record.payer,
        record.tier,
        new Date(record.issuedAtIso),
        new Date(record.expiresAtIso),
        record.txHash,
      );
    },
    lookup(payer, issuedAtIso) {
      return db.lookupSubscription(payer, issuedAtIso);
    },
    markRevoked(payer, issuedAtIso) {
      return db.revokeToken(payer, issuedAtIso);
    },
  };
}

export function createStrictSubscriptionStore(db: AppDb): SubscriptionStore {
  return createSubscriptionStore(createStoreAdapter(db), 'strict');
}
