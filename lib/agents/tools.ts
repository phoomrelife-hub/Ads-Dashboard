// Tool definitions for Pixel Agents, plus executors for the read (auto-run) tools.
// Write tools (set_status, set_budget, navigate) are NOT executed here — the chat
// route surfaces them to the user as proposals; execution happens in /api/agents/act
// only after the user confirms.
import { getAccounts, getLevel, getBreakdown, type Level, type Dim, type Row } from "@/lib/fb";
import { resolveCompareRanges } from "./dates";

export interface ToolSchema {
  name: string;
  description: string;
  /** JSON Schema for the tool input */
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties: false;
  };
}

export const READ_TOOLS = new Set(["list_accounts", "get_insights", "get_breakdown"]);
export const WRITE_TOOLS = new Set(["set_status", "set_budget", "navigate"]);

// Canonical tool list passed to whichever provider the agent uses.
export const TOOLS: ToolSchema[] = [
  {
    name: "list_accounts",
    description:
      "List the Facebook ad accounts available. Use this to confirm which account you are scoped to.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_insights",
    description:
      "Fetch the FULL performance metric set (spend, revenue, ROAS, leads, CPL, purchases, cost/purchase, messaging, reach, impressions, frequency, CPM, CPC, CTR, clicks, link clicks/CTR, landing page views, add-to-cart, checkout, and video funnel: views, thruplays, 25/50/75/100% retention, avg watch) for campaigns, adsets, or ads in the scoped account over a time window. Set compare=true to ALSO get the previous equal-length period plus per-row % deltas — use this to detect change (e.g. \"ROAS down 38% week-over-week\"). Always gather data here before proposing actions.",
    input_schema: {
      type: "object",
      properties: {
        level: { type: "string", enum: ["campaign", "adset", "ad"], description: "Aggregation level" },
        accountId: { type: "string", description: "Ad account (act_...). Required only if this agent covers ALL accounts; otherwise it defaults to the agent's account." },
        datePreset: {
          type: "string",
          description: "FB date preset, e.g. today, yesterday, last_7d, last_14d, last_30d, this_month, last_month",
        },
        since: { type: "string", description: "Optional start date YYYY-MM-DD (overrides datePreset; pair with until)" },
        until: { type: "string", description: "Optional end date YYYY-MM-DD" },
        compare: { type: "boolean", description: "If true, also fetch the previous equal-length period and include prev values + % deltas per row and in totals. Best for spotting trends/regressions." },
      },
      required: ["level"],
      additionalProperties: false,
    },
  },
  {
    name: "get_breakdown",
    description:
      "Break the scoped account's performance DOWN by a dimension — placement, publisher platform, device, age, gender, region, or day — with the full metric set per segment. This is the highest-leverage optimization tool: use it to find where budget is wasted vs where it performs best (e.g. \"ROAS 3.2 on Reels but 0.4 on Audience Network\", or \"CPL is 2x higher for age 55+\"). Returns one row per segment.",
    input_schema: {
      type: "object",
      properties: {
        dimension: {
          type: "string",
          enum: ["publisher_platform", "platform_position", "impression_device", "age", "gender", "region", "day"],
          description: "publisher_platform = Facebook/Instagram/Audience Network/Messenger; platform_position = exact placement (e.g. Reels, Feed, Stories); impression_device = device; age/gender/region = demographics; day = daily time series.",
        },
        accountId: { type: "string", description: "Ad account (act_...). Required only if this agent covers ALL accounts; otherwise defaults to the agent's account." },
        datePreset: { type: "string", description: "FB date preset, e.g. last_7d, last_30d, this_month. Defaults to last_30d." },
        since: { type: "string", description: "Optional start date YYYY-MM-DD (pair with until)" },
        until: { type: "string", description: "Optional end date YYYY-MM-DD" },
      },
      required: ["dimension"],
      additionalProperties: false,
    },
  },
  {
    name: "set_status",
    description:
      "Turn a campaign, adset, or ad ON (ACTIVE) or OFF (PAUSED). This changes live spend — it will be proposed to the user for confirmation before running.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The campaign/adset/ad ID" },
        status: { type: "string", enum: ["ACTIVE", "PAUSED"] },
        summary: {
          type: "string",
          description: "A short human-readable summary of this action and why, shown on the confirm card (e.g. \"Pause ad 'Promo_V3' — spent ฿4,200 at ROAS 0.4\").",
        },
      },
      required: ["id", "status", "summary"],
      additionalProperties: false,
    },
  },
  {
    name: "set_budget",
    description:
      "Change the daily budget of a campaign or adset (in the account currency's major units, e.g. 500 = ฿500). Proposed to the user for confirmation before running.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The campaign/adset ID" },
        dailyBudget: { type: "number", description: "New daily budget in major currency units (e.g. 500)" },
        summary: { type: "string", description: "Short human-readable summary shown on the confirm card." },
      },
      required: ["id", "dailyBudget", "summary"],
      additionalProperties: false,
    },
  },
  {
    name: "navigate",
    description:
      "Open a page in the dashboard for the user (e.g. to show them a report). Proposed for confirmation.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "App path, e.g. /creative-performance or /report-ads" },
        query: { type: "string", description: "Optional query string without the leading ?, e.g. preset=last_7d" },
        summary: { type: "string", description: "Short human-readable summary shown on the confirm card." },
      },
      required: ["path", "summary"],
      additionalProperties: false,
    },
  },
];

// ── helpers ──────────────────────────────────────────────────────────────────

const round = (v: unknown, d = 2): number => {
  const f = Math.pow(10, d);
  return Math.round((Number(v) || 0) * f) / f;
};

// Metric block shared by insights rows and breakdown segments.
function slimMetrics(r: Row) {
  return {
    spend: round(r.spend), revenue: round(r.revenue), roas: round(r.roas),
    reach: round(r.reach, 0), impressions: round(r.impressions, 0), frequency: round(r.frequency),
    cpm: round(r.cpm), cpc: round(r.cpc), ctr: round(r.ctr),
    clicks: round(r.clicks, 0), linkClicks: round(r.linkClicks, 0), linkCtr: round(r.linkCtr),
    landingPageViews: round(r.landingPageViews, 0),
    leads: round(r.leads, 0), cpl: round(r.cpl),
    messaging: round(r.messaging, 0), costPerMessaging: round(r.costPerMessaging),
    purchases: round(r.purchases, 0), costPerPurchase: round(r.costPerPurchase),
    addToCart: round(r.addToCart, 0), checkout: round(r.checkout, 0),
    videoViews: round(r.videoViews, 0), thruplays: round(r.thruplays, 0),
    vp25: round(r.vp25, 0), vp50: round(r.vp50, 0), vp75: round(r.vp75, 0), vp100: round(r.vp100, 0),
    avgWatch: round(r.avgWatch),
  };
}

function slimRow(r: Row) {
  return { id: r.id, name: r.name, status: r.status, dailyBudget: round(r.dailyBudget), ...slimMetrics(r) };
}

// Derive rate metrics that don't sum (roas, cpl, ctr, cpm, frequency, …) for a totals block.
function enrichTotals(t: Record<string, number>) {
  const r = (a: number, b: number, m = 1) => (b ? (a / b) * m : 0);
  return {
    spend: round(t.spend), revenue: round(t.revenue),
    reach: round(t.reach, 0), impressions: round(t.impressions, 0),
    clicks: round(t.clicks, 0), leads: round(t.leads, 0),
    purchases: round(t.purchases, 0), messaging: round(t.messaging, 0),
    roas: round(r(t.revenue, t.spend)),
    cpl: round(r(t.spend, t.leads)),
    cpc: round(r(t.spend, t.clicks)),
    cpm: round(r(t.spend, t.impressions, 1000)),
    ctr: round(r(t.clicks, t.impressions, 100)),
    frequency: round(r(t.impressions, t.reach)),
    costPerPurchase: round(r(t.spend, t.purchases)),
    costPerMessaging: round(r(t.spend, t.messaging)),
  };
}

const pctChange = (cur: unknown, prev: unknown): number | null => {
  const p = Number(prev) || 0;
  if (!p) return null; // undefined % change from a zero base
  return round(((Number(cur) || 0) - p) / p * 100, 1);
};

const DELTA_KEYS = ["spend", "revenue", "roas", "cpl", "leads", "purchases", "ctr", "cpm", "cpc", "frequency", "messaging", "costPerPurchase"] as const;

function deltaBlock(cur: Record<string, unknown>, prev: Record<string, unknown>) {
  const out: Record<string, number | null> = {};
  for (const k of DELTA_KEYS) out[k] = pctChange(cur[k], prev[k]);
  return out;
}

function compactPrev(p: Row) {
  return {
    spend: round(p.spend), roas: round(p.roas), cpl: round(p.cpl),
    leads: round(p.leads, 0), purchases: round(p.purchases, 0),
    ctr: round(p.ctr), cpm: round(p.cpm), frequency: round(p.frequency), revenue: round(p.revenue),
  };
}

// ── executor ─────────────────────────────────────────────────────────────────

function resolveAccount(scopeAccountId: string, argAccountId: unknown): string {
  const acct = scopeAccountId === "all" ? String(argAccountId || "") : scopeAccountId;
  if (!acct) throw new Error("This agent covers all accounts — pass accountId (use list_accounts to find it).");
  return acct;
}

// Execute a read tool server-side. scopeAccountId scopes data access.
export async function runReadTool(
  name: string,
  args: Record<string, any>,
  scopeAccountId: string,
): Promise<unknown> {
  if (!scopeAccountId) throw new Error("agent has no scoped ad account");
  switch (name) {
    case "list_accounts":
      return await getAccounts();

    case "get_insights": {
      const level = (args.level || "ad") as Level;
      const acct = resolveAccount(scopeAccountId, args.accountId);

      if (args.compare === true) {
        const { cur, prev } = resolveCompareRanges(String(args.datePreset || "last_7d"), args.since, args.until);
        const [curRes, prevRes] = await Promise.all([
          getLevel(acct, level, "", cur.since, cur.until),
          getLevel(acct, level, "", prev.since, prev.until),
        ]);
        const prevById = new Map(prevRes.rows.map((r) => [String(r.id), r]));
        const rows = curRes.rows.slice(0, 50).map((r) => {
          const p = prevById.get(String(r.id));
          return { ...slimRow(r), prev: p ? compactPrev(p) : null, delta: p ? deltaBlock(r, p) : null };
        });
        const curTotals = enrichTotals(curRes.totals);
        const prevTotals = enrichTotals(prevRes.totals);
        return {
          level, period: cur, previousPeriod: prev,
          totals: curTotals, previousTotals: prevTotals,
          totalsDelta: deltaBlock(curTotals, prevTotals),
          rows,
        };
      }

      const preset = String(args.datePreset || "last_7d");
      const result = await getLevel(acct, level, preset, args.since, args.until);
      return { level, totals: enrichTotals(result.totals), rows: result.rows.slice(0, 50).map(slimRow) };
    }

    case "get_breakdown": {
      const dim = String(args.dimension || "publisher_platform") as Dim;
      const acct = resolveAccount(scopeAccountId, args.accountId);
      const preset = String(args.datePreset || "last_30d");
      const res = await getBreakdown(acct, preset, dim, args.since, args.until);
      return {
        dimension: dim,
        totals: enrichTotals(res.totals),
        rows: res.rows.slice(0, 60).map((r) => ({ segment: r.key, ...slimMetrics(r) })),
      };
    }

    default:
      throw new Error(`unknown read tool: ${name}`);
  }
}
