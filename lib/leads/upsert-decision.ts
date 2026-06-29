// Pure helper — factored out of store.ts so it can be unit-tested without a DB connection.
// store.ts re-exports this; callers should import from store.ts.
import type { Lead } from './types';

/**
 * Decide what to do when ingesting a lead from FB.
 *
 * @param existingByPhone - All leads in the same account matching the normalized phone.
 * @param existingByFbId  - The single lead (if any) already stamped with this fbLeadId.
 *
 * Returns:
 *   'skip'        — FB lead already ingested (fbLeadId match); nothing to do.
 *   'update-open' — No fbLeadId match, but an open ('new') lead exists for this phone
 *                   → update it with last-touch ad attribution.
 *   'insert'      — No match at all, or all phone matches are closed
 *                   → create a fresh lead (repeat buyer, re-entry, etc.).
 *
 * KEY invariant: we never overwrite a lead that telesales has already worked
 * (contacted / won / lost). Only 'new' leads are eligible for last-touch update.
 */
export function decideUpsert(
  existingByPhone: Lead[],
  existingByFbId: Lead | null,
): 'skip' | 'update-open' | 'insert' {
  // Guard 1: this FB lead id has already been ingested — idempotent no-op
  if (existingByFbId) return 'skip';

  // Guard 2: an untouched ('new') lead exists for this phone → last-touch update
  const hasOpenByPhone = existingByPhone.some((l) => l.status === 'new');
  if (hasOpenByPhone) return 'update-open';

  // No open match — either no phone match or all matches are closed
  return 'insert';
}
