// Server-only: imports lib/fb (server-only) and lib/leads/store (server-only).
// Phase 3 — deterministic True ROAS computation. No LLM; no numbers invented.

import { getLevel } from '@/lib/fb';
import { leadsInWindow } from '@/lib/leads/store';
import { resolveCompareRanges } from '@/lib/agents/dates';
import type { Lead } from '@/lib/leads/types';

// ── Output types ───────────────────────────────────────────────────────────────

export interface TrueRoasRow {
  id: string;
  name: string;
  spend: number;
  /** FB-reported revenue (omni_purchase/purchase action values) */
  fbRevenue: number;
  /** FB-reported ROAS = fbRevenue / spend (null when spend = 0) */
  fbRoas: number | null;
  /** Σ saleAmount of won leads attributed to this entity */
  realRevenue: number;
  /** Count of won leads attributed to this entity */
  realCustomers: number;
  /** realRevenue / spend (null when spend = 0) */
  trueRoas: number | null;
  /** spend / realCustomers (null when realCustomers = 0) */
  trueCac: number | null;
  /** (fbRevenue − realRevenue) / fbRevenue (null when fbRevenue = 0).
   *  Positive = FB over-reports (lie detector).
   *  Negative = hidden winners (FB under-reports vs real sales). */
  gap: number | null;
  /** Count of all leads (any status) attributed to this entity */
  leads: number;
  /** Count of won leads attributed to this entity */
  won: number;
  /** won / leads (null when leads = 0) */
  cvr: number | null;
}

export interface TrueRoasTotals {
  spend: number;
  fbRevenue: number;
  realRevenue: number;
  /** All leads in the window (including unattributed) */
  leads: number;
  /** All won leads in the window */
  won: number;
  /** Blended: totalRealRevenue / totalSpend (null when spend = 0) */
  trueRoas: number | null;
  /** Blended: totalFbRevenue / totalSpend (null when spend = 0) */
  fbRoas: number | null;
}

export interface TrueRoasResult {
  rows: TrueRoasRow[];
  totals: TrueRoasTotals;
  /**
   * Overall attribution coverage = spend of entities that have ≥1 lead / total spend.
   * null when total spend is 0 (no data). Range [0, 1].
   */
  coverage: number | null;
  /** Count of leads with no entity attribution in this window */
  unattributedLeads: number;
  period: { since: string; until: string };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Round to 2 decimal places. */
function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── Core computation ──────────────────────────────────────────────────────────

/**
 * computeTrueRoas — deterministic True ROAS / CAC / FB-gap report.
 *
 * @param accountId   FB ad account id (act_…)
 * @param level       'campaign' | 'ad' — entity granularity
 * @param preset      Date preset understood by resolveCompareRanges (e.g. 'last_30d')
 * @param since       Optional explicit since date (YYYY-MM-DD); overrides preset
 * @param until       Optional explicit until date (YYYY-MM-DD); overrides preset
 */
export async function computeTrueRoas(
  accountId: string,
  level: 'campaign' | 'ad',
  preset: string,
  since?: string,
  until?: string,
): Promise<TrueRoasResult> {
  // ── 1. Resolve concrete date window ─────────────────────────────────────────
  const { cur } = resolveCompareRanges(preset, since, until);
  const sinceStr = cur.since; // YYYY-MM-DD
  const untilStr = cur.until; // YYYY-MM-DD

  // The leads table stores timestamptz; extend until to the end of the day so
  // leads that arrived on the last day are included.
  const leadsUntil = untilStr + 'T23:59:59';

  // ── 2. Fetch FB insights + all leads in parallel ─────────────────────────────
  const [fbResult, allLeads] = await Promise.all([
    getLevel(accountId, level, preset, sinceStr, untilStr),
    leadsInWindow(accountId, sinceStr, leadsUntil),
  ]);

  // ── 3. Index FB rows by entity id ───────────────────────────────────────────
  // FB rows already keyed by `id` (campaign_id or ad_id depending on level).
  const fbRowMap = new Map<string, (typeof fbResult.rows)[number]>();
  for (const row of fbResult.rows) {
    fbRowMap.set(String(row.id), row);
  }

  // ── 4. Group leads by entity key ─────────────────────────────────────────────
  const getEntityKey = (lead: Lead): string | null =>
    level === 'ad' ? lead.adId : lead.campaignId;

  const leadsByEntity = new Map<string, Lead[]>();
  let unattributedLeads = 0;

  for (const lead of allLeads) {
    const key = getEntityKey(lead);
    if (!key) {
      unattributedLeads++;
      continue;
    }
    if (!leadsByEntity.has(key)) leadsByEntity.set(key, []);
    leadsByEntity.get(key)!.push(lead);
  }

  // ── 5. Build per-entity output rows ─────────────────────────────────────────
  // Include every FB entity that delivered spend. Zero-lead entities show trueRoas=null,
  // which surfaces the "spending with nothing to show" situation prominently.
  const rows: TrueRoasRow[] = [];

  for (const fbRow of fbResult.rows) {
    const id = String(fbRow.id);
    const name = String(fbRow.name || id);
    const spend = Number(fbRow.spend) || 0;
    const fbRevenue = Number(fbRow.revenue) || 0;
    const fbRoas = spend > 0 ? r2(fbRevenue / spend) : null;

    const entityLeads = leadsByEntity.get(id) ?? [];
    const wonLeads = entityLeads.filter((l) => l.status === 'won');
    const leadCount = entityLeads.length;
    const wonCount = wonLeads.length;
    const realRevenue = wonLeads.reduce((s, l) => s + (l.saleAmount ?? 0), 0);

    const trueRoas = spend > 0 ? r2(realRevenue / spend) : null;
    const trueCac = wonCount > 0 ? r2(spend / wonCount) : null;
    const gap = fbRevenue > 0 ? r2((fbRevenue - realRevenue) / fbRevenue) : null;
    const cvr = leadCount > 0 ? r2(wonCount / leadCount) : null;

    rows.push({
      id,
      name,
      spend: r2(spend),
      fbRevenue: r2(fbRevenue),
      fbRoas,
      realRevenue: r2(realRevenue),
      realCustomers: wonCount,
      trueRoas,
      trueCac,
      gap,
      leads: leadCount,
      won: wonCount,
      cvr,
    });
  }

  // Default sort: TRUE ROAS desc (entities with trueRoas=null sink to the bottom)
  rows.sort((a, b) => {
    if (a.trueRoas == null && b.trueRoas == null) return 0;
    if (a.trueRoas == null) return 1;
    if (b.trueRoas == null) return -1;
    return b.trueRoas - a.trueRoas;
  });

  // ── 6. Totals ────────────────────────────────────────────────────────────────
  const totalSpend = rows.reduce((s, r) => s + r.spend, 0);
  const totalFbRevenue = rows.reduce((s, r) => s + r.fbRevenue, 0);
  const totalRealRevenue = rows.reduce((s, r) => s + r.realRevenue, 0);
  // Lead/won totals include unattributed leads so the numbers are honest
  const totalLeads = allLeads.length;
  const totalWon = allLeads.filter((l) => l.status === 'won').length;

  const totals: TrueRoasTotals = {
    spend: r2(totalSpend),
    fbRevenue: r2(totalFbRevenue),
    realRevenue: r2(totalRealRevenue),
    leads: totalLeads,
    won: totalWon,
    trueRoas: totalSpend > 0 ? r2(totalRealRevenue / totalSpend) : null,
    fbRoas: totalSpend > 0 ? r2(totalFbRevenue / totalSpend) : null,
  };

  // ── 7. Coverage ───────────────────────────────────────────────────────────────
  const coveredSpend = rows.filter((r) => r.leads > 0).reduce((s, r) => s + r.spend, 0);
  const coverage = totalSpend > 0 ? r2(coveredSpend / totalSpend) : null;

  return {
    rows,
    totals,
    coverage,
    unattributedLeads,
    period: { since: sinceStr, until: untilStr },
  };
}
