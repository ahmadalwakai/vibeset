import 'server-only';

import { revalidateTag } from 'next/cache';
import { after } from 'next/server';
import type { AccountCleanupPlan } from '../lib/account';
import type { ObjectStorage } from '../lib/validation/storage';
import { defaultStorage } from './storage/r2';

export async function removeAccountObjects(
  plan: AccountCleanupPlan,
  storage: ObjectStorage = defaultStorage,
): Promise<void> {
  const results = await Promise.allSettled([
    ...(plan.keys.length ? [storage.deleteMany(plan.keys)] : []),
    ...plan.prefixes.map((prefix) => storage.deletePrefix(prefix)),
  ]);
  const failures = results.filter((result) => result.status === 'rejected').length;
  if (failures) console.error({ scope: 'account.storage-cleanup', failures });
}

export async function scheduleAccountCleanup(plan: AccountCleanupPlan): Promise<void> {
  // Called only after the auth user was deleted. Immediate expiry prevents a stale
  // public response from revealing the removed creator's attribution or avatar.
  let cacheFailures = 0;
  for (const tag of new Set(plan.tags)) {
    try {
      revalidateTag(tag, { expire: 0 });
    } catch {
      cacheFailures += 1;
    }
  }
  if (cacheFailures) console.error({ scope: 'account.cache-cleanup', failures: cacheFailures });
  if (!plan.keys.length && !plan.prefixes.length) return;
  try {
    after(() => removeAccountObjects(plan));
  } catch {
    // Better Auth's CLI and non-Next integrations do not have a response lifecycle.
    await removeAccountObjects(plan);
  }
}
