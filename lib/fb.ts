// Facebook Marketing API client + metric parsing (ported from the prototype server.mjs)
import crypto from "node:crypto";
import { getCachedAccounts, setCachedAccounts, getCachedPages, setCachedPages } from "@/lib/cache/accounts";
import type { CampaignDraft, ChainDeps } from "./ads-create/chain";
import { billingEventFor } from "./ads-create/spec";

const API = "https://graph.facebook.com/v21.0";
const TOKEN = process.env.FACEBOOK_MARKETING_API || process.env.FB_ACCESS_TOKEN || "";
const APP_SECRET = process.env.APP_SECRET || "";
const PROOF = APP_SECRET ? crypto.createHmac("sha256", APP_SECRET).update(TOKEN).digest("hex") : "";

// ─── Network resilience: cache + retry + in-flight dedup ─────────────────────
// Meta's Graph API rate-limits aggressively (error #17 / #4 / #32 / #613 / business-
// use-case #80000-80009, or HTTP 429). Three layers keep us under the limit and the
// UI fast, all at the single chokepoint every GET passes through (fbFetchJson):
//   1. response cache — re-opening a tab or flipping back to a date range you already
//      viewed serves from memory and makes ZERO Meta calls (the main cause of both the
//      rate-limiting and the slowness was re-querying identical data on every view).
//   2. retry w/ exponential backoff + jitter — a transient throttle that clears in a
//      second or two self-heals instead of surfacing as an error.
//   3. in-flight dedup — a burst of identical concurrent requests hits Meta once.
// Cache is busted on any write (fbPost) so a status/budget change shows immediately.

const INSIGHTS_TTL_MS = Number(process.env.FB_CACHE_TTL_MS) || 120_000; // metrics: 2 min
const META_TTL_MS = Number(process.env.FB_META_TTL_MS) || 600_000;      // names/status: 10 min
const MAX_RETRIES = 4;
// metadata edges (account list, name resolution, campaign/adset/ad lists) change rarely;
// insights change through the day. Keep insights fresher, everything else longer.
const ttlFor = (url: string) => (/\/insights(\b|\?)/.test(url) ? INSIGHTS_TTL_MS : META_TTL_MS);

// Rate-limit / throttle errors that are worth retrying. Deliberately EXCLUDES code 1
// subcode 99 ("reduce the amount of data") — that's a too-large result set, not a
// throttle, and is handled by time-range bisection in pageAll(); retrying never helps.
function isRateLimit(status: number, err: any): boolean {
  if (status === 429 || status === 500 || status === 503) return true;
  const code = err?.code;
  if ([2, 4, 17, 32, 341, 613].includes(code)) return true; // 2 = FB temporary/"unknown" service error
  if (typeof code === "number" && code >= 80000 && code <= 80009) return true; // business-use-case throttles
  return false;
}

// stale-while-revalidate: once the fresh TTL lapses we keep serving the cached value
// (and kick off a background refresh) for STALE_FACTOR× longer, so a repeat view never
// blocks on Meta — it paints instantly and the next view picks up the refreshed data.
const STALE_FACTOR = 5;
type CacheEntry = { value: any; fresh: number; hard: number };
const respCache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<any>>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// undefined = no usable cache. { stale:false } = fresh (serve, no network). { stale:true }
// = serve immediately but revalidate behind. Entries past their hard limit are discarded.
function cacheGet(url: string): { value: any; stale: boolean } | undefined {
  const e = respCache.get(url);
  if (!e) return undefined;
  const now = Date.now();
  if (now > e.hard) { respCache.delete(url); return undefined; }
  return { value: e.value, stale: now > e.fresh };
}
function cacheSet(url: string, value: any) {
  if (respCache.size > 600) for (const [k, v] of respCache) if (Date.now() > v.hard) respCache.delete(k); // prune dead
  const ttl = ttlFor(url);
  const now = Date.now();
  respCache.set(url, { value, fresh: now + ttl, hard: now + ttl * (1 + STALE_FACTOR) });
}

// GET a Graph API URL → parsed JSON, with cache + retry + dedup. Returns the JSON as-is
// (may contain `.error`) so callers keep their existing `if (j.error) throw` semantics;
// only error-free responses are cached.
async function fbFetchJson(url: string): Promise<any> {
  const hit = cacheGet(url);
  if (hit && !hit.stale) return hit.value;          // fresh → instant, zero Meta calls
  if (hit && hit.stale) {                            // stale → serve now, refresh behind
    if (!inflight.has(url)) void revalidate(url).catch(() => {}); // background; errors keep the stale value
    return hit.value;
  }
  const pending = inflight.get(url);                 // no usable cache → must fetch (dedup a burst)
  if (pending) return pending;
  return revalidate(url);
}

// Fetch a URL through retry/backoff, cache on success, and dedup via the in-flight map.
// Used both for foreground fetches (awaited) and background stale revalidation (un-awaited),
// so cleanup is attached to the promise rather than a try/finally around an await.
function revalidate(url: string): Promise<any> {
  const run = (async () => {
    let last: any = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      let status = 0, json: any;
      try {
        const res = await fetch(url);
        status = res.status;
        json = await res.json();
      } catch (e) {
        json = { error: { message: String(e) } }; status = 503; // network blip → treat as retryable
      }
      if (!json?.error && status < 400) { cacheSet(url, json); return json; }
      last = json;
      if (attempt < MAX_RETRIES && isRateLimit(status, json?.error)) {
        const backoff = Math.min(8000, 500 * 2 ** attempt) + Math.floor(crypto.randomInt(250)); // jittered
        await sleep(backoff);
        continue;
      }
      return json; // non-retryable error, or retries exhausted → let caller surface it
    }
    return last;
  })();

  inflight.set(url, run);
  void run.finally(() => inflight.delete(url));
  return run;
}

export type Level = "campaign" | "adset" | "ad";
export type Dim = "day" | "region" | "age" | "gender" | "publisher_platform" | "impression_device" | "platform_position";
export type Row = Record<string, string | number | boolean>;
export interface Result { rows: Row[]; totals: Record<string, number>; dim?: string }

function authParams(extra: Record<string, string> = {}) {
  const p = new URLSearchParams({ access_token: TOKEN, ...extra });
  if (PROOF) p.set("appsecret_proof", PROOF);
  return p;
}
async function fbGet(p: string, params: Record<string, string> = {}) {
  const u = new URL(API + p);
  u.search = authParams(params).toString();
  const j = await fbFetchJson(u.toString());
  if (j.error) throw new Error(j.error.message);
  return j;
}
export async function fbPost(p: string, params: Record<string, string> = {}) {
  const j = await (
    await fetch(API + p, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: authParams(params).toString(),
    })
  ).json();
  if (j.error) {
    const e = new Error(j.error.message);
    (e as any).fbError = j.error;
    throw e;
  }
  respCache.clear(); // a status/budget change invalidates cached reads — show it immediately
  return j;
}

// DELETE a Graph node (used by the create-chain rollback). Mirrors fbPost's error handling.
export async function fbDelete(p: string): Promise<any> {
  const u = new URL(API + p);
  u.search = authParams().toString();
  const j = await (await fetch(u.toString(), { method: "DELETE" })).json();
  if (j.error) {
    const e = new Error(j.error.message);
    (e as any).fbError = j.error;
    throw e;
  }
  respCache.clear();
  return j;
}

// POST multipart/form-data — required for ad image/video uploads. Auth goes in the query string.
export async function fbPostMultipart(
  p: string,
  fields: Record<string, string>,
  file: { name: string; type: string; buffer: Buffer },
  fileField: string,
): Promise<any> {
  const u = new URL(API + p);
  u.search = authParams().toString();
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  form.append(fileField, new Blob([new Uint8Array(file.buffer)], { type: file.type }), file.name);
  const j = await (await fetch(u.toString(), { method: "POST", body: form })).json();
  if (j.error) {
    const e = new Error(j.error.message);
    (e as any).fbError = j.error;
    throw e;
  }
  respCache.clear();
  return j;
}

const n = (x: unknown) => (x == null ? 0 : Number(x));
type Act = { action_type: string; value: string }[];
const A = (arr: Act | undefined, ...types: string[]) =>
  (arr || []).filter((a) => types.includes(a.action_type)).reduce((s, a) => s + Number(a.value || 0), 0);
const V = (arr: Act | undefined) => Number(arr?.[0]?.value || 0);

// flatten one insights object into all metrics (keys match lib/columns.ts)
export function metrics(i: any = {}): Record<string, number> {
  const acts = i.actions, vals = i.action_values;
  const spend = n(i.spend);
  const leads = A(acts, "onsite_conversion.lead", "offsite_complete_registration_add_meta_leads", "lead");
  const purchases = A(acts, "omni_purchase", "purchase");
  const messaging = A(acts, "onsite_conversion.messaging_conversation_started_7d", "onsite_conversion.messaging_conversation_started");
  const revenue = A(vals, "omni_purchase", "purchase");
  return {
    spend, reach: n(i.reach), impressions: n(i.impressions), frequency: n(i.frequency),
    cpm: n(i.cpm), cpc: n(i.cpc), cpp: n(i.cpp), ctr: n(i.ctr),
    clicks: n(i.clicks), linkClicks: n(i.inline_link_clicks), linkCtr: n(i.inline_link_click_ctr),
    uniqueClicks: n(i.unique_clicks), uniqueCtr: n(i.unique_ctr),
    postEngagement: A(acts, "post_engagement"), pageEngagement: A(acts, "page_engagement"),
    reactions: A(acts, "post_reaction"),
    landingPageViews: A(acts, "landing_page_view", "omni_landing_page_view"),
    videoViews: A(acts, "video_view"),
    leads, messaging, purchases,
    addToCart: A(acts, "omni_add_to_cart", "add_to_cart"),
    checkout: A(acts, "omni_initiated_checkout", "initiate_checkout"),
    revenue,
    roas: spend ? revenue / spend : V(i.purchase_roas),
    cpl: leads ? spend / leads : 0,
    costPerMessaging: messaging ? spend / messaging : 0,
    costPerPurchase: purchases ? spend / purchases : 0,
    thruplays: V(i.video_thruplay_watched_actions), videoPlays: V(i.video_play_actions),
    avgWatch: V(i.video_avg_time_watched_actions),
    vp25: V(i.video_p25_watched_actions), vp50: V(i.video_p50_watched_actions),
    vp75: V(i.video_p75_watched_actions), vp100: V(i.video_p100_watched_actions),
  };
}

const SUM_KEYS = ["spend","reach","impressions","clicks","linkClicks","uniqueClicks",
  "postEngagement","pageEngagement","reactions","landingPageViews","videoViews",
  "leads","messaging","purchases","addToCart","checkout","revenue",
  "thruplays","videoPlays","vp25","vp50","vp75","vp100"];
function totalsOf(rows: Row[]): Record<string, number> {
  const t: Record<string, number> = { count: rows.length };
  for (const k of SUM_KEYS) t[k] = rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
  return t;
}

// Recompute rate/ratio fields from summed additive fields — used when merging breakdown rows across
// accounts (summing rates would be wrong). Formulas mirror lib/columns.ts footVal + metrics().
function recomputeDerived(row: Row): Row {
  const g = (k: string) => Number(row[k]) || 0;
  const spend = g("spend"), imp = g("impressions"), reach = g("reach"), clicks = g("clicks");
  row.frequency = reach ? imp / reach : 0;
  row.cpm = imp ? (spend / imp) * 1000 : 0;
  row.cpc = clicks ? spend / clicks : 0;
  row.cpp = reach ? (spend / reach) * 1000 : 0;
  row.ctr = imp ? (clicks / imp) * 100 : 0;
  row.linkCtr = imp ? (g("linkClicks") / imp) * 100 : 0;
  row.uniqueCtr = reach ? (g("uniqueClicks") / reach) * 100 : 0;
  row.roas = spend ? g("revenue") / spend : 0;
  row.cpl = g("leads") ? spend / g("leads") : 0;
  row.costPerMessaging = g("messaging") ? spend / g("messaging") : 0;
  row.costPerPurchase = g("purchases") ? spend / g("purchases") : 0;
  row.avgWatch = 0; // average watch time isn't additive across accounts
  return row;
}

// FB error 1/subcode 99: "Please reduce the amount of data you're asking for, then retry your request."
// Distinct from a rate limit — the single query's result set (rows × fields) is just too large.
const TOO_MUCH_DATA = /reduce the amount of data/i;
// All the ways FB signals an oversized day-series query: the explicit "too much data" error, plus the
// "unknown error" / "service temporarily unavailable" / gateway-HTML (non-JSON → SyntaxError) that a
// heavy query times out into. All are recoverable by splitting the date range smaller (verified against
// the live API). A genuine rate limit is handled earlier by fbFetchJson's retry, not here.
const SPLITTABLE_ERROR = /reduce the amount of data|unknown error occurred|service temporarily unavailable|is not valid json|unexpected token/i;
// Hard ceiling on the number of fetches one pageAll recovery may spend splitting. A few pathologically
// large accounts can't return even a short day-series no matter how finely it's split (verified: 50
// requests / 20 min / still failing). Past this budget we stop and return whatever was gathered so the
// route responds in bounded time instead of hanging or erroring.
const SPLIT_REQUEST_BUDGET = 10;
// Wall-clock ceiling for one day-series recovery. Bounds the worst case even when each request is
// slowed by rate-limit retries (a request budget alone can't cap that). Past the deadline we return
// the partial data gathered so the route always responds promptly.
const SPLIT_TIME_BUDGET_MS = 45_000;

// Convert a date_preset to an explicit since/until so a failed query can be split by time.
// Day-grained (UTC); the day-or-two drift vs FB's account-timezone preset is immaterial for the
// long ranges that actually trip the limit, and the tiny presets (today/yesterday) never trip it.
function presetToRange(preset: string): { since: string; until: string } | null {
  const DAY = 86400000;
  const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const now = new Date();
  const todayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  switch (preset) {
    case "today": return { since: fmt(todayMs), until: fmt(todayMs) };
    case "yesterday": return { since: fmt(todayMs - DAY), until: fmt(todayMs - DAY) };
    case "last_3d": return { since: fmt(todayMs - 2 * DAY), until: fmt(todayMs) };
    case "last_7d": return { since: fmt(todayMs - 6 * DAY), until: fmt(todayMs) };
    case "last_14d": return { since: fmt(todayMs - 13 * DAY), until: fmt(todayMs) };
    case "last_30d": return { since: fmt(todayMs - 29 * DAY), until: fmt(todayMs) };
    case "last_90d": return { since: fmt(todayMs - 89 * DAY), until: fmt(todayMs) };
    case "this_month": return { since: fmt(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), until: fmt(todayMs) };
    case "last_month": return {
      since: fmt(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)),
      until: fmt(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)),
    };
    // FB insights serves at most 37 months; an explicit since older than that errors (#3018),
    // which would break the bisection recovery below. Clamp to 36 months — FB returns nothing older anyway.
    case "maximum": case "lifetime": return { since: fmt(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 36, now.getUTCDate())), until: fmt(todayMs) };
    default: return null;
  }
}

// Ensure a URL carries an explicit, splittable time_range (rewriting date_preset if needed).
function ensureTimeRange(url: string): string | null {
  const u = new URL(url);
  if (u.searchParams.get("time_range")) return u.toString();
  const r = presetToRange(u.searchParams.get("date_preset") || "");
  if (!r) return null;
  u.searchParams.delete("date_preset");
  u.searchParams.set("time_range", JSON.stringify(r));
  return u.toString();
}

// Split a time_range URL into two halves by date; null if not splittable (no range / single day).
function bisectTimeRange(url: string): [string, string] | null {
  const u = new URL(url);
  const tr = u.searchParams.get("time_range");
  if (!tr) return null;
  let since = "", until = "";
  try { ({ since, until } = JSON.parse(tr)); } catch { return null; }
  if (!since || !until) return null;
  const DAY = 86400000;
  const s = Date.parse(since + "T00:00:00Z"), e = Date.parse(until + "T00:00:00Z");
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return null; // single day → can't reduce further
  const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const midMs = s + Math.floor((e - s) / 2 / DAY) * DAY;
  const a = new URL(url), b = new URL(url);
  a.searchParams.set("time_range", JSON.stringify({ since, until: fmt(midMs) }));
  b.searchParams.set("time_range", JSON.stringify({ since: fmt(midMs + DAY), until }));
  return [a.toString(), b.toString()];
}

async function pageRaw(firstUrl: string, maxPages: number): Promise<any[]> {
  const out: any[] = [];
  let next: string | null = firstUrl;
  for (let p = 0; p < maxPages && next; p++) {
    const j: any = await fbFetchJson(next);
    if (j.error) throw new Error(j.error.message);
    out.push(...(j.data || []));
    next = j.paging?.next || null;
  }
  return out;
}

// Adaptive paging: on an oversized day-series error, halve the date range and retry each half, then
// concatenate. Only attempted for time_increment=1 (day-series) queries, where the per-day rows from
// disjoint halves concatenate correctly; aggregated queries would double-count and so are left to
// surface the original error. The more-recent half is fetched first so that if the request budget is
// exhausted on a pathologically heavy account, the partial data we keep is the most recent days.
// Halves run sequentially to avoid a rate-limit burst. `budget` is shared across the recursion.
async function pageAll(firstUrl: string, maxPages = 40, budget = { left: SPLIT_REQUEST_BUDGET, deadline: Date.now() + SPLIT_TIME_BUDGET_MS }): Promise<any[]> {
  try {
    return await pageRaw(firstUrl, maxPages);
  } catch (e: any) {
    if (!SPLITTABLE_ERROR.test(e?.message || "")) throw e;
    if (new URL(firstUrl).searchParams.get("time_increment") !== "1") throw e;
    const ranged = ensureTimeRange(firstUrl);
    const halves = ranged ? bisectTimeRange(ranged) : null;
    if (!halves) return []; // already a single day and still failing → drop it, keep the rest (partial)
    const [earlier, later] = halves;
    const out: any[] = [];
    for (const half of [later, earlier]) {        // recent first → partial data favours recent days
      if (budget.left <= 0 || Date.now() > budget.deadline) { console.warn(`[pageAll] split budget/deadline reached; returning partial day-series for ${firstUrl.split("?")[0]}`); break; }
      budget.left--;
      try { out.push(...await pageAll(half, maxPages, budget)); }
      catch { /* one half unrecoverable → keep the other (partial) rather than fail the whole query */ }
    }
    return out;
  }
}

const BASE_FIELDS =
  `spend,reach,impressions,frequency,cpm,cpc,cpp,ctr,` +
  `clicks,inline_link_clicks,inline_link_click_ctr,unique_clicks,unique_ctr,` +
  `video_thruplay_watched_actions,video_play_actions,video_avg_time_watched_actions,` +
  `video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p100_watched_actions`;
const ACTION_FIELDS = `actions,action_values,purchase_roas`;
const PURE_FIELDS = `spend,reach,impressions,frequency,cpm,cpc,cpp,ctr,clicks,inline_link_clicks,inline_link_click_ctr,unique_clicks,unique_ctr`;
// Minimal field set for day-by-day creative timeline — avoids FB "too much data" error
const TIMELINE_FIELDS = `spend,clicks,impressions,ctr,actions,action_values,purchase_roas`;

// time_range (since/until) overrides date_preset when both provided
const timeParams = (preset: string, since?: string, until?: string): Record<string, string> =>
  since && until ? { time_range: JSON.stringify({ since, until }) } : { date_preset: preset };

// Ad-level day-by-day queries return (ads × days) rows and blow past FB's per-query data limit
// beyond ~90 days (verified: 90d works on the heaviest account, 180d+ errors with "reduce the
// amount of data"). FB's own bisection recovery is too slow/fragile to lean on for long ranges,
// so cap these queries to the most recent AD_DAILY_MAX_DAYS. The aggregated table/totals are
// unaffected and still serve full "maximum". Returns an explicit, always-≤cap time_range.
const AD_DAILY_MAX_DAYS = 90;
const DAY_MS = 86400000;
function capDaySeriesRange(preset: string, since?: string, until?: string): { since: string; until: string } {
  const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const now = new Date();
  const todayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const untilMs = until ? Date.parse(until + "T00:00:00Z") : todayMs;
  const endMs = Number.isFinite(untilMs) ? untilMs : todayMs;
  let startMs: number;
  if (since) startMs = Date.parse(since + "T00:00:00Z");
  else { const r = presetToRange(preset); startMs = r ? Date.parse(r.since + "T00:00:00Z") : NaN; }
  const earliest = endMs - (AD_DAILY_MAX_DAYS - 1) * DAY_MS;
  if (!Number.isFinite(startMs) || startMs < earliest) startMs = earliest;
  return { since: fmt(startMs), until: fmt(endMs) };
}

async function insightsByLevel(act: string, level: Level, preset: string, since?: string, until?: string) {
  const idField = `${level}_id`;
  const u = new URL(`${API}/${act}/insights`);
  u.search = authParams({
    level, ...timeParams(preset, since, until), limit: "500",
    fields: `${idField},${BASE_FIELDS},${ACTION_FIELDS}`,
  }).toString();
  const data = await pageAll(u.toString());
  const map = new Map<string, Record<string, number>>();
  for (const row of data) map.set(row[idField], metrics(row));
  return map;
}

const META: Record<Level, { edge: string; fields: string; map: (o: any) => Row }> = {
  campaign: {
    edge: "campaigns",
    fields: "name,status,effective_status,objective,daily_budget",
    map: (c) => ({ id: c.id, name: c.name, status: c.status, objective: c.objective, dailyBudget: c.daily_budget ? n(c.daily_budget) / 100 : 0 }),
  },
  adset: {
    edge: "adsets",
    fields: "name,status,effective_status,optimization_goal,daily_budget,campaign{name}",
    map: (a) => ({ id: a.id, name: a.name, status: a.status, goal: a.optimization_goal, dailyBudget: a.daily_budget ? n(a.daily_budget) / 100 : 0, campaign: a.campaign?.name || "" }),
  },
  ad: {
    edge: "ads",
    fields: "name,status,effective_status,adset{name},creative{thumbnail_url,object_type,title,object_story_spec{page_id},effective_object_story_id}",
    map: (a) => ({
      id: a.id, name: a.name, status: a.status, adset: a.adset?.name || "",
      thumb: a.creative?.thumbnail_url || "", objectType: a.creative?.object_type || "", title: a.creative?.title || "",
      pageId: a.creative?.object_story_spec?.page_id || a.creative?.effective_object_story_id?.split("_")[0] || "",
    }),
  },
};

const ZERO = metrics({});
export async function getLevel(act: string, level: Level, preset: string, since?: string, until?: string): Promise<Result> {
  // Ad level: an account can hold thousands of ads (every paused/archived one included), each carrying
  // a heavy creative{…} expansion — crawling the whole /ads edge is what made this tab slow. Instead,
  // fetch the insights first (only ads that delivered in the period appear there — usually a small
  // fraction of the total) and batch-resolve metadata for just those ids. Zero-delivery ads no longer
  // show, but they had all-zero metrics and sorted to the bottom anyway.
  if (level === "ad") return getAdLevel(act, preset, since, until);

  const cfg = META[level];
  const u = new URL(`${API}/${act}/${cfg.edge}`);
  u.search = authParams({ fields: cfg.fields, limit: "200" }).toString();
  const [meta, ins] = await Promise.all([pageAll(u.toString()), insightsByLevel(act, level, preset, since, until)]);
  const rows = meta.map((o) => ({ ...cfg.map(o), ...(ins.get(o.id) || ZERO) }));
  rows.sort((a, b) => Number(b.spend) - Number(a.spend));
  return { rows, totals: totalsOf(rows) };
}

// Resolve ad metadata (name/status/creative) for a set of ad ids via the ?ids= batch endpoint,
// in chunks of 50. FB's batch fails entirely if ANY id is inaccessible, so a failed chunk is
// binary-split to isolate the bad id(s) and still resolve the good ones (mirrors resolvePageNames).
async function resolveAdMeta(ids: string[]): Promise<Map<string, Row>> {
  const out = new Map<string, Row>();
  const uniq = [...new Set(ids.filter(Boolean))];
  const { fields, map } = META.ad;

  async function resolveChunk(chunk: string[]): Promise<void> {
    if (!chunk.length) return;
    try {
      const j = await fbGet("/", { ids: chunk.join(","), fields });
      for (const id of chunk) if (j[id]) out.set(id, map(j[id]));
    } catch {
      if (chunk.length === 1) return; // a single unresolvable id — fall back to the insights id
      const mid = Math.floor(chunk.length / 2);
      await Promise.all([resolveChunk(chunk.slice(0, mid)), resolveChunk(chunk.slice(mid))]);
    }
  }

  // Bound concurrency (like every other FB burst in this file): an account with thousands of
  // delivering ads would otherwise fire dozens of ?ids= calls at once, trip rate limit #17, and
  // spend minutes in backoff retries — far slower than a steady, capped stream of batch calls.
  const chunks: string[][] = [];
  for (let i = 0; i < uniq.length; i += 50) chunks.push(uniq.slice(i, i + 50));
  await mapPool(chunks, 4, resolveChunk);
  return out;
}

async function getAdLevel(act: string, preset: string, since?: string, until?: string): Promise<Result> {
  const ins = await insightsByLevel(act, "ad", preset, since, until);
  const ids = [...ins.keys()];
  const meta = await resolveAdMeta(ids);
  const rows: Row[] = ids.map((id) => ({ id, name: id, status: "UNKNOWN", ...meta.get(id), ...ins.get(id) }));
  rows.sort((a, b) => Number(b.spend) - Number(a.spend));
  return { rows, totals: totalsOf(rows) };
}

// A failed account in an "all accounts" merge — surfaced to the UI so nothing fails silently.
export type AcctProblem = { id: string; name: string; reason: string; detail: string };
function classifyFbError(msg: string): string {
  const m = (msg || "").toLowerCase();
  if (/reduce the amount of data/.test(m)) return "ช่วงเวลาที่เลือกมีข้อมูลมากเกินไป — ลองเลือกช่วงวันที่สั้นลง";
  if (/#17|request limit|rate limit|too many calls/.test(m)) return "ติด rate limit ของ Facebook — ลองรีเฟรชอีกครั้งในอีกสักครู่";
  if (/#190|access token|session has expired|oauth|malformed/.test(m)) return "Token หมดอายุหรือไม่มีสิทธิ์ — ต้องเชื่อมต่อใหม่";
  if (/#200|#10|#272|#294|permission|do not have|not authorized|cannot access/.test(m)) return "ไม่มีสิทธิ์เข้าถึงบัญชีนี้ (ยังไม่ได้เชื่อมต่อ/มอบสิทธิ์)";
  if (/#100|unknown path|nonexisting|does not exist|invalid/.test(m)) return "บัญชีไม่ถูกต้องหรือถูกปิด";
  return msg || "โหลดไม่สำเร็จ (ไม่ทราบสาเหตุ)";
}

type LevelResult = { ok: true; id: string; name: string; r: Result } | { ok: false; id: string; name: string; detail: string };

// All accounts merged: campaign/adset/ad rows are distinct entities, so concatenate (each row keeps its
// own correct metrics) and tag with the account name. Concurrency-capped to avoid the rate-limit burst.
// Per-account failures are collected into `problems` rather than dropped silently.
export async function getLevelAll(level: Level, preset: string, since?: string, until?: string, hidden: string[] = []): Promise<Result & { problems: AcctProblem[] }> {
  const accts = visibleAccounts(await getAccounts(), hidden);
  const settled: LevelResult[] = await mapPool(accts, 3, async (a: { id: string; name: string }) => {
    try {
      const r = await getLevel(a.id, level, preset, since, until);
      return { ok: true, id: a.id, name: a.name, r } as LevelResult;
    } catch (e: any) {
      const detail = e?.message || String(e);
      console.error(`[getLevelAll] ${a.name} (${a.id}) failed:`, detail);
      return { ok: false, id: a.id, name: a.name, detail } as LevelResult;
    }
  });
  const rows: Row[] = [];
  const totals: Record<string, number> = {};
  const problems: AcctProblem[] = [];
  for (const s of settled) {
    if (s.ok) {
      for (const row of s.r.rows) rows.push({ ...row, account: s.name });
      for (const k in s.r.totals) totals[k] = (totals[k] || 0) + s.r.totals[k];
    } else {
      problems.push({ id: s.id, name: s.name, reason: classifyFbError(s.detail), detail: s.detail });
    }
  }
  rows.sort((a, b) => Number(b.spend) - Number(a.spend));
  return { rows, totals, problems };
}

export async function getBreakdown(act: string, preset: string, dim: Dim, since?: string, until?: string): Promise<Result> {
  const isPlacement = dim === "platform_position";
  const fields = isPlacement ? PURE_FIELDS : `${BASE_FIELDS},${ACTION_FIELDS}`;
  const params: Record<string, string> = { ...timeParams(preset, since, until), limit: "500", fields };
  if (dim === "day") params.time_increment = "1";
  else if (isPlacement) params.breakdowns = "publisher_platform,platform_position";
  else params.breakdowns = dim;
  const u = new URL(`${API}/${act}/insights`);
  u.search = authParams(params).toString();
  const data = await pageAll(u.toString());
  const keyOf = (r: any) =>
    dim === "day" ? r.date_start : isPlacement ? `${r.publisher_platform} · ${r.platform_position}` : r[dim];
  const rows: Row[] = data.map((r) => ({ key: keyOf(r), ...metrics(r) }));
  if (dim === "day") rows.sort((a, b) => (String(a.key) < String(b.key) ? -1 : 1));
  else rows.sort((a, b) => Number(b.spend) - Number(a.spend));
  return { rows, totals: totalsOf(rows), dim };
}

// All accounts merged: same segment key (day/region/…) is summed across accounts, then derived
// rates are recomputed (summing ratios would be wrong). Concurrency-capped against rate limits.
export async function getBreakdownAll(preset: string, dim: Dim, since?: string, until?: string, hidden: string[] = []): Promise<Result & { problems: AcctProblem[] }> {
  const accts = visibleAccounts(await getAccounts(), hidden);
  const settled = await mapPool(accts, 3, async (a: { id: string; name: string }) => {
    try {
      const r = await getBreakdown(a.id, preset, dim, since, until);
      return { ok: true as const, rows: r.rows };
    } catch (e: any) {
      const detail = e?.message || String(e);
      console.error(`[getBreakdownAll] ${a.name} (${a.id}) failed:`, detail);
      return { ok: false as const, id: a.id, name: a.name, detail };
    }
  });
  const byKey = new Map<string, Row>();
  const problems: AcctProblem[] = [];
  for (const s of settled) {
    if (!s.ok) { problems.push({ id: s.id, name: s.name, reason: classifyFbError(s.detail), detail: s.detail }); continue; }
    for (const r of s.rows) {
      const key = String(r.key);
      let agg = byKey.get(key);
      if (!agg) { agg = { key }; byKey.set(key, agg); }
      for (const k of SUM_KEYS) agg[k] = (Number(agg[k]) || 0) + (Number(r[k]) || 0);
    }
  }
  const rows = [...byKey.values()].map(recomputeDerived);
  if (dim === "day") rows.sort((a, b) => (String(a.key) < String(b.key) ? -1 : 1));
  else rows.sort((a, b) => Number(b.spend) - Number(a.spend));
  return { rows, totals: totalsOf(rows), dim, problems };
}

export interface CreativePoint {
  adId: string; adName: string; thumb: string; status: string
  campaign: string; date: string; roas: number; spend: number
  leads: number; purchases: number; cpl: number; messaging: number
  clicks: number; impressions: number; ctr: number
  permalink?: string
}

export async function getAdTrend(adId: string, preset: string, since?: string, until?: string): Promise<{ date: string; roas: number; spend: number; leads: number; purchases: number }[]> {
  const u = new URL(`${API}/${adId}/insights`);
  u.search = authParams({ time_range: JSON.stringify(capDaySeriesRange(preset, since, until)), time_increment: "1", limit: "90", fields: `date_start,${TIMELINE_FIELDS}` }).toString();
  // A pathologically heavy account can't return its day-series even split fine — degrade to empty rather than erroring the view.
  const data = await pageAll(u.toString()).catch(() => [] as any[]);
  return data.map((row: any) => { const m = metrics(row); return { date: row.date_start, roas: m.roas, spend: m.spend, leads: m.leads, purchases: m.purchases }; }).filter((r: any) => r.spend > 0);
}

export async function getAdTimeline(act: string, preset: string, since?: string, until?: string): Promise<CreativePoint[]> {
  const adUrl = new URL(`${API}/${act}/ads`)
  adUrl.search = authParams({ fields: "name,status,campaign{name},creative{thumbnail_url,effective_object_story_id}", limit: "200" }).toString()
  const insUrl = new URL(`${API}/${act}/insights`)
  insUrl.search = authParams({
    level: "ad", time_range: JSON.stringify(capDaySeriesRange(preset, since, until)), time_increment: "1", limit: "200",
    fields: `ad_id,date_start,${TIMELINE_FIELDS}`,
  }).toString()
  const [adMeta, insData] = await Promise.all([pageAll(adUrl.toString()), pageAll(insUrl.toString()).catch(() => [] as any[])])
  const adMap = new Map<string, { name: string; status: string; campaign: string; thumb: string; permalink?: string }>(
    adMeta.map((a: any) => {
      const storyId: string = a.creative?.effective_object_story_id || ""
      let permalink: string | undefined
      if (storyId) {
        const [pageId, postId] = storyId.split("_")
        if (pageId && postId) permalink = `https://www.facebook.com/${pageId}/posts/${postId}/`
      }
      return [a.id, { name: a.name || "", status: a.status || "UNKNOWN", campaign: a.campaign?.name || "", thumb: a.creative?.thumbnail_url || "", permalink }]
    })
  )
  return insData.map((row: any): CreativePoint => {
    const m = metrics(row)
    const meta = adMap.get(row.ad_id) ?? { name: row.ad_id, status: "UNKNOWN", campaign: "", thumb: "", permalink: undefined }
    return { adId: row.ad_id, adName: meta.name, thumb: meta.thumb, status: meta.status, campaign: meta.campaign, date: row.date_start, roas: m.roas, spend: m.spend, leads: m.leads, purchases: m.purchases, cpl: m.cpl, messaging: m.messaging, clicks: m.clicks, impressions: m.impressions, ctr: m.ctr, permalink: meta.permalink }
  }).filter(p => p.spend > 0)
}

// Ad-level day-by-day rows tagged with pageId + full metrics — powers page-filtered aggregation
export interface AdDailyRow { adId: string; pageId: string; date: string; metrics: Record<string, number> }
export async function getAdDaily(act: string, preset: string, since?: string, until?: string): Promise<AdDailyRow[]> {
  const adUrl = new URL(`${API}/${act}/ads`);
  adUrl.search = authParams({ fields: "creative{object_story_spec{page_id},effective_object_story_id}", limit: "200" }).toString();
  const insUrl = new URL(`${API}/${act}/insights`);
  insUrl.search = authParams({
    level: "ad", time_range: JSON.stringify(capDaySeriesRange(preset, since, until)), time_increment: "1", limit: "500",
    fields: `ad_id,date_start,${BASE_FIELDS},${ACTION_FIELDS}`,
  }).toString();
  const [adMeta, insData] = await Promise.all([pageAll(adUrl.toString()), pageAll(insUrl.toString()).catch(() => [] as any[])]);
  const pageOf = new Map<string, string>(
    adMeta.map((a: any) => [a.id, a.creative?.object_story_spec?.page_id || a.creative?.effective_object_story_id?.split("_")[0] || ""])
  );
  return insData.map((row: any) => ({
    adId: row.ad_id, pageId: pageOf.get(row.ad_id) || "", date: row.date_start, metrics: metrics(row),
  }));
}

// Resolve page id → name (works even when /me/accounts can't list pages).
// FB's ?ids= batch fails entirely if ANY id is inaccessible, so a failed chunk
// is binary-split to isolate the bad id(s) and still resolve the good ones.
export async function resolvePageNames(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const uniq = [...new Set(ids.filter(Boolean))];

  async function resolveChunk(chunk: string[]): Promise<void> {
    if (!chunk.length) return;
    try {
      const j = await fbGet("/", { ids: chunk.join(","), fields: "name" });
      for (const id of chunk) if (j[id]?.name) out.set(id, j[id].name);
    } catch {
      if (chunk.length === 1) return; // a single unresolvable id — leave it to fall back
      const mid = Math.floor(chunk.length / 2);
      await Promise.all([resolveChunk(chunk.slice(0, mid)), resolveChunk(chunk.slice(mid))]);
    }
  }

  const batches: Promise<void>[] = [];
  for (let i = 0; i < uniq.length; i += 50) batches.push(resolveChunk(uniq.slice(i, i + 50)));
  await Promise.all(batches);
  return out;
}

// Run async tasks with a bounded concurrency pool — keeps FB request bursts small to dodge rate limits
async function mapPool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const i = cursor++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

type PageEntry = { id: string; name: string };
const PAGES_TTL_MS = 6 * 60 * 60 * 1000;
// Union-merge with whatever's cached so the list only ever grows (a rate-limited partial crawl never shrinks it).
// Real (resolved) names always win over `เพจ <id>` fallbacks.
function mergePages(prev: PageEntry[] | null, next: PageEntry[]): PageEntry[] {
  const map = new Map<string, string>();
  for (const p of prev || []) map.set(p.id, p.name);
  for (const p of next) {
    const cur = map.get(p.id);
    const isFallback = (n: string) => n.startsWith("เพจ ");
    if (!cur || (isFallback(cur) && !isFallback(p.name))) map.set(p.id, p.name);
  }
  return [...map].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "th"));
}

// Crawl one account's ads (bounded, error-tolerant) → distinct page ids
async function crawlAccountPageIds(actId: string): Promise<Set<string>> {
  const ids = new Set<string>();
  const u = new URL(`${API}/${actId}/ads`);
  u.search = authParams({ fields: "creative{object_story_spec{page_id},effective_object_story_id}", limit: "200" }).toString();
  let next: string | null = u.toString();
  // 2 pages (≈400 ads) is enough to surface the 1–3 pages an account runs; deeper crawls just feed rate limits
  for (let p = 0; p < 2 && next; p++) {
    try {
      const j: any = await fbFetchJson(next);
      if (j.error) break; // rate-limited / error → keep what's collected
      for (const a of (j.data || [])) {
        const pid = a.creative?.object_story_spec?.page_id || a.creative?.effective_object_story_id?.split("_")[0] || "";
        if (pid) ids.add(pid);
      }
      next = j.paging?.next || null;
    } catch { break; }
  }
  return ids;
}

// Distinct Pages running ads in an account (or "all"), id + resolved name — powers the page filter.
// DB-cached per act (6h TTL), union-merged so it only grows, and "all" composes the per-account
// caches with limited concurrency to avoid the request burst that was triggering rate limits.
export async function getAccountPages(act: string): Promise<PageEntry[]> {
  if (act === "all") {
    // Always recompose from per-account caches: the cached accounts return instantly and only the
    // rate-limited stragglers retry, so the union grows toward the full set instead of freezing partial.
    const accts = await getAccounts();
    const lists = await mapPool(accts, 3, (a: { id: string }) => getAccountPages(a.id).catch(() => [] as PageEntry[]));
    const prevCached = await getCachedPages("all", PAGES_TTL_MS).catch(() => null);
    const merged = mergePages(prevCached, lists.flat());
    if (merged.length) await setCachedPages("all", merged).catch(() => {});
    return merged;
  }

  // single account: serve fresh cache, else crawl → resolve names → union-merge with prior cache
  const cached = await getCachedPages(act, PAGES_TTL_MS).catch(() => null);
  if (cached) return cached;
  const ids = await crawlAccountPageIds(act);
  const names = await resolvePageNames([...ids]);
  const fresh = [...ids].map((id) => ({ id, name: names.get(id) || `เพจ ${id}` }));
  const prevCached = await getCachedPages(act, Infinity).catch(() => null); // get stale cache for merge
  const merged = mergePages(prevCached, fresh);
  if (merged.length) await setCachedPages(act, merged).catch(() => {});
  return merged;
}

// account-level period totals (one row), flattened through metrics()
export async function getAccountTotals(act: string, preset: string, since?: string, until?: string): Promise<Record<string, number>> {
  const u = new URL(`${API}/${act}/insights`);
  u.search = authParams({ ...timeParams(preset, since, until), limit: "1", fields: `${BASE_FIELDS},${ACTION_FIELDS}` }).toString();
  const data = await pageAll(u.toString(), 1);
  return metrics(data[0] || {});
}

// Drop accounts the user hid in Workspace Settings before an "all accounts" merge, so their
// spend/rows don't leak into the combined totals. If hiding would leave nothing (every account
// hidden), the filter is ignored — mirrors the dashboard's "all hidden → show all" fallback.
type Acct = { id: string; name: string; active?: boolean };
function visibleAccounts(accts: Acct[], hidden: string[]): Acct[] {
  if (!hidden.length) return accts;
  const visible = accts.filter((a) => !hidden.includes(a.id));
  return visible.length ? visible : accts;
}

// account list with DB cache (survives rate limits)
export async function getAccounts() {
  try {
    const a = (await fbGet("/me/adaccounts", { fields: "name,account_id,account_status", limit: "200" })).data || [];
    const list = a.map((x: any) => ({ id: `act_${x.account_id}`, name: x.name, active: x.account_status === 1 }));
    if (list.length) await setCachedAccounts(list).catch(() => {});
    return list;
  } catch (e) {
    const cached = await getCachedAccounts(Infinity).catch(() => null); // accept any age on error
    if (cached) return cached;
    throw e;
  }
}

// ─── Campaign creation helpers ───────────────────────────────────────────────

const toCents = (major: number) => String(Math.round(major * 100));

export async function createCampaign(act: string, d: CampaignDraft): Promise<{ id: string }> {
  const j = await fbPost(`/${act}/campaigns`, {
    name: d.name,
    objective: d.objective,
    status: "PAUSED",
    special_ad_categories: JSON.stringify(d.specialAdCategories ?? []),
  });
  return { id: j.id };
}

export async function createAdSet(act: string, d: CampaignDraft, campaignId: string): Promise<{ id: string }> {
  const params: Record<string, string> = {
    name: `${d.name} — Ad Set`,
    campaign_id: campaignId,
    status: "PAUSED",
    optimization_goal: d.optimizationGoal,
    billing_event: billingEventFor(d.optimizationGoal),
    targeting: JSON.stringify(d.targeting),
  };
  if (d.dailyBudgetMajor != null) params.daily_budget = toCents(d.dailyBudgetMajor);
  if (d.lifetimeBudgetMajor != null) params.lifetime_budget = toCents(d.lifetimeBudgetMajor);
  if (d.schedule?.start_time) params.start_time = d.schedule.start_time;
  if (d.schedule?.end_time) params.end_time = d.schedule.end_time;
  if (d.promotedObject) params.promoted_object = JSON.stringify(d.promotedObject);
  const j = await fbPost(`/${act}/adsets`, params);
  return { id: j.id };
}

export async function createCreative(act: string, d: CampaignDraft): Promise<{ id: string }> {
  const c = d.creative;
  if (c.mode === "existing_creative") return { id: c.creativeId };

  if (c.mode === "existing_post") {
    const j = await fbPost(`/${act}/adcreatives`, {
      name: `${d.name} — Creative`,
      object_story_id: `${c.pageId}_${c.postId}`,
    });
    return { id: j.id };
  } else {
    // upload mode — image or video link ad
    const link_data: Record<string, unknown> = {
      message: c.message,
      link: c.link,
      name: c.headline,
      description: c.description,
      call_to_action: { type: c.cta, value: { link: c.link } },
    };
    if (c.imageHash) link_data.image_hash = c.imageHash;
    if (c.videoId) link_data.video_id = c.videoId;
    const object_story_spec = { page_id: c.pageId, link_data };
    const j = await fbPost(`/${act}/adcreatives`, {
      name: `${d.name} — Creative`,
      object_story_spec: JSON.stringify(object_story_spec),
    });
    return { id: j.id };
  }
}

export async function createAd(act: string, d: CampaignDraft, adsetId: string, creativeId: string): Promise<{ id: string }> {
  const j = await fbPost(`/${act}/ads`, {
    name: `${d.name} — Ad`,
    adset_id: adsetId,
    status: "PAUSED",
    creative: JSON.stringify({ creative_id: creativeId }),
  });
  return { id: j.id };
}

export async function uploadAdImage(act: string, file: { name: string; type: string; buffer: Buffer }): Promise<{ image_hash: string }> {
  const j = await fbPostMultipart(`/${act}/adimages`, {}, file, "file");
  // Response shape: { images: { <filename>: { hash, url } } }
  const first: any = Object.values(j.images ?? {})[0];
  return { image_hash: first?.hash };
}

export async function uploadAdVideo(act: string, file: { name: string; type: string; buffer: Buffer }): Promise<{ video_id: string }> {
  const j = await fbPostMultipart(`/${act}/advideos`, {}, file, "source");
  return { video_id: j.id };
}

export function realChainDeps(): ChainDeps {
  return {
    createCampaign: (act, d) => createCampaign(act, d),
    createAdSet: (act, d, cid) => createAdSet(act, d, cid),
    createCreative: (act, d) => createCreative(act, d),
    createAd: (act, d, asid, crid) => createAd(act, d, asid, crid),
    del: async (id) => { await fbDelete(`/${id}`); },
  };
}

// ─── Picker + targeting read helpers ─────────────────────────────────────────

export async function getPages(): Promise<{ id: string; name: string }[]> {
  const j = await fbGet(`/me/accounts`, { fields: "id,name", limit: "100" });
  return (j.data ?? []).map((p: any) => ({ id: p.id, name: p.name }));
}

export async function getPagePosts(pageId: string): Promise<{ id: string; message: string }[]> {
  const j = await fbGet(`/${pageId}/posts`, { fields: "id,message,created_time", limit: "50" });
  return (j.data ?? []).map((p: any) => ({ id: p.id.split("_").pop(), message: p.message ?? "(no text)" }));
}

export async function getExistingCreatives(act: string): Promise<{ id: string; name: string }[]> {
  const j = await fbGet(`/${act}/adcreatives`, { fields: "id,name", limit: "100" });
  return (j.data ?? []).map((c: any) => ({ id: c.id, name: c.name ?? c.id }));
}

export async function getCustomAudiences(act: string): Promise<{ id: string; name: string; type: string }[]> {
  const j = await fbGet(`/${act}/customaudiences`, { fields: "id,name,subtype", limit: "100" });
  return (j.data ?? []).map((a: any) => ({ id: a.id, name: a.name, type: a.subtype ?? "CUSTOM" }));
}

export async function getPixels(act: string): Promise<{ id: string; name: string }[]> {
  const j = await fbGet(`/${act}/adspixels`, { fields: "id,name", limit: "50" });
  return (j.data ?? []).map((p: any) => ({ id: p.id, name: p.name ?? p.id }));
}

export async function searchTargeting(q: string, type: string): Promise<{ id: string; name: string; type: string }[]> {
  const j = await fbGet(`/search`, { type, q, limit: "25" });
  return (j.data ?? []).map((t: any) => ({ id: t.id, name: t.name, type: t.type ?? type }));
}

export async function getReachEstimate(
  act: string,
  targeting: Record<string, unknown>,
  optimizationGoal: string,
): Promise<{ users_lower_bound: number; users_upper_bound: number }> {
  const j = await fbGet(`/${act}/reachestimate`, {
    targeting_spec: JSON.stringify(targeting),
    optimization_goal: optimizationGoal,
  });
  const d = j.data ?? {};
  return { users_lower_bound: d.users_lower_bound ?? 0, users_upper_bound: d.users_upper_bound ?? 0 };
}

export async function getTokenCanWrite(): Promise<boolean> {
  try {
    const j = await fbGet("/me/permissions");
    const perms: any[] = j.data ?? [];
    return perms.some((p) => p.permission === "ads_management" && p.status === "granted");
  } catch {
    return false;
  }
}
