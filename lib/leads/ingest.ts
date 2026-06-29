// Cron-driven lead ingestion: pulls FB Lead Ads data and upserts into the leads table.
// Transitively server-only (imports lib/fb.ts and store.ts, both server-only paths).
import { getAccounts, getNewLeads } from '@/lib/fb';
import { upsertFromFb } from './store';

// We poll the last N days on every cron run and rely on fb_lead_id idempotency for dedupe
// rather than tracking a per-account "last poll" timestamp. This is safer because:
//   1. No persistent state to lose or corrupt between runs.
//   2. A failed/skipped run doesn't leave a gap — the next run re-covers the window.
//   3. upsertFromFb guards on fb_lead_id so re-processing is cheap (skip path).
// 7 days is generous enough that a cron gap of up to a week won't lose leads.
const POLL_WINDOW_DAYS = 7;

export async function ingestLeads(): Promise<{ scanned: number; created: number }> {
  const sinceUnix = Math.floor(
    (Date.now() - POLL_WINDOW_DAYS * 24 * 60 * 60 * 1000) / 1000,
  );

  let accounts: Awaited<ReturnType<typeof getAccounts>>;
  try {
    accounts = await getAccounts();
  } catch (e: any) {
    console.error('[ingestLeads] Cannot fetch FB accounts:', e?.message);
    return { scanned: 0, created: 0 };
  }

  let scanned = 0;
  let created = 0;

  for (const acct of accounts) {
    let leads: Awaited<ReturnType<typeof getNewLeads>>;
    try {
      leads = await getNewLeads(acct.id, sinceUnix);
    } catch (e: any) {
      // getNewLeads catches per-ad errors internally and returns []; a top-level throw is
      // unexpected, but we guard anyway so one bad account never stops the rest.
      console.error(`[ingestLeads] getNewLeads failed for account ${acct.id}:`, e?.message);
      continue;
    }

    scanned += leads.length;

    for (const lead of leads) {
      try {
        const result = await upsertFromFb({
          fbLeadId: lead.fbLeadId,
          accountId: acct.id,
          phone: lead.phone,
          name: lead.name,
          campaignId: lead.campaignId,
          adsetId: lead.adsetId,
          adId: lead.adId,
          campaignName: lead.campaignName,
          adName: lead.adName,
        });
        if (result.created) created++;
      } catch (e: any) {
        console.error(
          `[ingestLeads] upsertFromFb failed for FB lead ${lead.fbLeadId} (account ${acct.id}):`,
          e?.message,
        );
      }
    }
  }

  return { scanned, created };
}
