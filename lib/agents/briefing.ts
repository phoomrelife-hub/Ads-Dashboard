// Daily Briefing engine — deterministic, no LLM.
// Pulls ad-level performance for the current window vs the previous equal window,
// benchmarks each ad against the account's own averages, and emits a ranked list of
// items that need attention. Each item may carry a one-click, account-scoped action.
//
// Works for both purchase accounts (judged on ROAS) and lead/chat accounts (judged
// on CPL), auto-detected from whether the account produced revenue in the window.
import { getLevel, getAccounts, type Row } from "@/lib/fb";
import { resolveCompareRanges } from "./dates";
import { newId } from "./store";
import type { Briefing, BriefingItem, BriefingKind, BriefingSeverity, BriefingMetric } from "./types";

export interface BriefingOptions {
  preset?: string;      // metric window, default "last_7d"
  minSpend?: number;    // ignore ads below this spend in the window, default 100
}

// ── tunable thresholds ───────────────────────────────────────────────────────
const DEFAULT_MIN_SPEND = 100;          // ฿ — below this an ad is noise
const UNDERPERF_ROAS_RATIO = 0.5;       // ad ROAS < 50% of account avg → underperforming
const UNDERPERF_CPL_RATIO = 1.5;        // ad CPL > 150% of account avg → underperforming
const DECLINE_PCT = -30;                // ROAS down ≥30% WoW → declining (CPL up ≥30%)
const FATIGUE_FREQ = 3.5;               // frequency at/above → fatigue candidate
const SCALE_ROAS_RATIO = 1.5;           // ad ROAS ≥ 150% of account avg → scale
const SCALE_CPL_RATIO = 0.6;            // ad CPL ≤ 60% of account avg → scale
const SCALE_BUDGET_STEP = 1.3;          // +30% daily budget when scaling

const SEVERITY: Record<BriefingKind, BriefingSeverity> = {
  wasting: "critical", declining: "warning", underperforming: "warning",
  fatigue: "info", scaling: "opportunity",
};

const num = (v: unknown) => Number(v) || 0;
const round = (v: number, d = 2) => { const f = 10 ** d; return Math.round(v * f) / f; };
const baht = (v: number) => "฿" + Math.round(v).toLocaleString("en-US");
const pctChange = (cur: number, prev: number): number | null => (prev ? round(((cur - prev) / prev) * 100, 1) : null);
const results = (r: Row) => num(r.purchases) + num(r.leads) + num(r.messaging);

export async function buildBriefing(accountId: string, opts: BriefingOptions = {}): Promise<Briefing> {
  const preset = opts.preset || "last_7d";
  const minSpend = opts.minSpend ?? DEFAULT_MIN_SPEND;
  const { cur, prev } = resolveCompareRanges(preset);

  const [curRes, prevRes, accounts] = await Promise.all([
    getLevel(accountId, "ad", "", cur.since, cur.until),
    getLevel(accountId, "ad", "", prev.since, prev.until),
    getAccounts().catch(() => [] as { id: string; name: string }[]),
  ]);
  const accountName = (accounts as { id: string; name: string }[]).find((a) => a.id === accountId)?.name;
  const prevById = new Map(prevRes.rows.map((r) => [String(r.id), r]));

  // Account-level benchmarks (current window).
  const t = curRes.totals;
  const acctRoas = t.spend ? t.revenue / t.spend : 0;
  const acctCpl = t.leads ? t.spend / t.leads : 0;
  const acctCtr = t.impressions ? (t.clicks / t.impressions) * 100 : 0;
  const revenueAccount = t.revenue > 0; // purchase-style vs lead/chat-style

  const items: BriefingItem[] = [];

  for (const r of curRes.rows) {
    const spend = num(r.spend);
    if (spend < minSpend) continue;
    const active = String(r.status).toUpperCase() === "ACTIVE";
    const id = String(r.id);
    const name = String(r.name || id);
    const campaign = r.campaign ? String(r.campaign) : undefined;
    const roas = num(r.roas);
    const cpl = num(r.cpl);
    const ctr = num(r.ctr);
    const freq = num(r.frequency);
    const dailyBudget = num(r.dailyBudget);
    const p = prevById.get(id);
    const roasDelta = p ? pctChange(roas, num(p.roas)) : null;
    const cplDelta = p ? pctChange(cpl, num(p.cpl)) : null;
    const ctrDelta = p ? pctChange(ctr, num(p.ctr)) : null;

    // Evaluate signals in priority order; one item per ad.
    let kind: BriefingKind | null = null;
    if (active && results(r) === 0 && roas === 0) {
      kind = "wasting";
    } else if (active && p && (
      (revenueAccount && roasDelta !== null && roasDelta <= DECLINE_PCT && num(p.roas) > 0) ||
      (!revenueAccount && cplDelta !== null && cplDelta >= -DECLINE_PCT && num(p.leads) > 0)
    )) {
      kind = "declining";
    } else if (active && (
      (revenueAccount && acctRoas > 0 && roas < acctRoas * UNDERPERF_ROAS_RATIO) ||
      (!revenueAccount && acctCpl > 0 && cpl > acctCpl * UNDERPERF_CPL_RATIO)
    )) {
      kind = "underperforming";
    } else if (active && freq >= FATIGUE_FREQ && (num(ctrDelta) < 0 || (acctCtr > 0 && ctr < acctCtr * 0.8))) {
      kind = "fatigue";
    } else if (active && dailyBudget > 0 && (
      (revenueAccount && acctRoas > 0 && roas >= acctRoas * SCALE_ROAS_RATIO) ||
      (!revenueAccount && acctCpl > 0 && cpl > 0 && cpl <= acctCpl * SCALE_CPL_RATIO)
    )) {
      kind = "scaling";
    }
    if (!kind) continue;

    items.push(makeItem(kind, { id, name, campaign, spend, roas, cpl, ctr, freq, dailyBudget, roasDelta, cplDelta, ctrDelta, revenueAccount, r }));
  }

  items.sort((a, b) => b.score - a.score);

  // Account summary + headline.
  const pt = prevRes.totals;
  const prevRoas = pt.spend ? pt.revenue / pt.spend : 0;
  const prevCpl = pt.leads ? pt.spend / pt.leads : 0;
  const summary = {
    spend: round(t.spend), revenue: round(t.revenue), roas: round(acctRoas),
    leads: Math.round(t.leads), purchases: Math.round(t.purchases), messaging: Math.round(t.messaging),
    spendDelta: pctChange(t.spend, pt.spend),
    roasDelta: pctChange(acctRoas, prevRoas),
    cplDelta: pctChange(acctCpl, prevCpl),
  };

  const wasted = items.filter((i) => i.kind === "wasting");
  const wastedSpend = wasted.reduce((s, i) => s + num((i.proposal?.args as any)?._spend) , 0);
  const headline = buildHeadline(items.length, wasted.length, wastedSpend, summary.roasDelta, revenueAccount);

  return { accountId, accountName, generatedAt: Date.now(), period: cur, previousPeriod: prev, headline, summary, items };
}

interface ItemCtx {
  id: string; name: string; campaign?: string;
  spend: number; roas: number; cpl: number; ctr: number; freq: number; dailyBudget: number;
  roasDelta: number | null; cplDelta: number | null; ctrDelta: number | null;
  revenueAccount: boolean; r: Row;
}

function makeItem(kind: BriefingKind, c: ItemCtx): BriefingItem {
  const base = {
    id: newId(), kind, severity: SEVERITY[kind], level: "ad" as const,
    entityId: c.id, entityName: c.name, campaign: c.campaign,
  };
  const roasM: BriefingMetric = { label: "ROAS", value: c.roas ? c.roas.toFixed(2) : "0", delta: c.roasDelta, upIsGood: true };
  const cplM: BriefingMetric = { label: "CPL", value: c.cpl ? baht(c.cpl) : "—", delta: c.cplDelta, upIsGood: false };
  const spendM: BriefingMetric = { label: "Spend", value: baht(c.spend) };
  const freqM: BriefingMetric = { label: "Frequency", value: c.freq.toFixed(1) };
  const ctrM: BriefingMetric = { label: "CTR", value: c.ctr.toFixed(2) + "%", delta: c.ctrDelta, upIsGood: true };
  const perfM = c.revenueAccount ? roasM : cplM;

  switch (kind) {
    case "wasting":
      return {
        ...base, score: 1000 + c.spend,
        headline: `Pause — ${baht(c.spend)} spent, 0 conversions`,
        detail: `Active ad burned ${baht(c.spend)} this period with no purchases, leads, or chats.`,
        metrics: [spendM, { label: "Conversions", value: "0" }, perfM],
        proposal: pauseProposal(c, `Pause '${c.name}' — ${baht(c.spend)} spent, 0 conversions`),
      };
    case "declining": {
      const drop = c.revenueAccount ? c.roasDelta : c.cplDelta;
      return {
        ...base, score: 800 + c.spend * (Math.abs(num(drop)) / 100),
        headline: c.revenueAccount ? `ROAS down ${Math.abs(num(drop))}% week-over-week` : `CPL up ${Math.abs(num(drop))}% week-over-week`,
        detail: `${baht(c.spend)} spent while ${c.revenueAccount ? "ROAS" : "CPL"} moved ${num(drop) > 0 ? "+" : ""}${drop}% vs the previous period. Review or pause.`,
        metrics: [perfM, spendM, c.revenueAccount ? cplM : roasM],
        proposal: pauseProposal(c, `Pause '${c.name}' — ${c.revenueAccount ? "ROAS" : "CPL"} ${num(drop) > 0 ? "+" : ""}${drop}% WoW`),
      };
    }
    case "underperforming":
      return {
        ...base, score: 600 + c.spend,
        headline: c.revenueAccount ? `ROAS ${c.roas.toFixed(2)} — well below account average` : `CPL ${baht(c.cpl)} — well above account average`,
        detail: `${baht(c.spend)} spent at ${c.revenueAccount ? `ROAS ${c.roas.toFixed(2)}` : `CPL ${baht(c.cpl)}`}, far worse than the rest of the account.`,
        metrics: [perfM, spendM, ctrM],
        proposal: pauseProposal(c, `Pause '${c.name}' — underperforming the account`),
      };
    case "fatigue":
      return {
        ...base, score: 400 + c.spend * 0.1,
        headline: `Ad fatigue — frequency ${c.freq.toFixed(1)}, CTR falling`,
        detail: `Frequency ${c.freq.toFixed(1)} with ${c.ctrDelta != null && c.ctrDelta < 0 ? `CTR down ${Math.abs(c.ctrDelta)}%` : "below-average CTR"}. The audience is seeing this too often — refresh the creative.`,
        metrics: [freqM, ctrM, spendM],
        // no auto-action: refreshing creative can't be done via this API surface
      };
    case "scaling":
      return {
        ...base, score: 200 + c.spend,
        headline: c.revenueAccount ? `Scale — ROAS ${c.roas.toFixed(2)}, above account average` : `Scale — CPL ${baht(c.cpl)}, beating account average`,
        detail: `Strong performer at ${baht(c.dailyBudget)}/day. Suggest raising to ${baht(c.dailyBudget * SCALE_BUDGET_STEP)}/day (+30%).`,
        metrics: [perfM, { label: "Budget", value: baht(c.dailyBudget) + "/day" }, spendM],
        proposal: {
          tool: "set_budget",
          args: { id: c.id, dailyBudget: round(c.dailyBudget * SCALE_BUDGET_STEP, 0), _spend: c.spend },
          summary: `Raise '${c.name}' budget to ${baht(c.dailyBudget * SCALE_BUDGET_STEP)}/day (+30%)`,
        },
      };
  }
}

function pauseProposal(c: ItemCtx, summary: string) {
  return { tool: "set_status" as const, args: { id: c.id, status: "PAUSED", _spend: c.spend }, summary };
}

function buildHeadline(total: number, wasteCount: number, wasteSpend: number, roasDelta: number | null, revenueAccount: boolean): string {
  if (total === 0) return "All clear — nothing needs your attention right now.";
  const parts: string[] = [];
  if (wasteCount > 0) parts.push(`${wasteCount} ad${wasteCount > 1 ? "s" : ""} wasting ${baht(wasteSpend)}`);
  parts.push(`${total} item${total > 1 ? "s" : ""} need attention`);
  if (revenueAccount && roasDelta != null) parts.push(`account ROAS ${roasDelta >= 0 ? "up" : "down"} ${Math.abs(roasDelta)}% WoW`);
  return parts.join(" · ");
}
