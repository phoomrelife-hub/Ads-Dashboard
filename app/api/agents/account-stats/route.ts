import { NextRequest, NextResponse } from "next/server";
import { getAccountsStats, type AccountStat } from "@/lib/fb";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Per-account aggregate metrics used to rank the account selector. Fixed last-7-day window so the
// ranking stays stable regardless of the page's period selector. Cached in-memory per (preset,hidden)
// for 10 min — scanning every account is a burst of FB calls we don't want to repeat on each open.
const TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; data: AccountStat[] }>();

// GET /api/agents/account-stats?hidden=act_1,act_2
export async function GET(req: NextRequest) {
  const preset = "last_7d"; // fixed window — see note above
  const hidden = (req.nextUrl.searchParams.get("hidden") || "").split(",").filter(Boolean);
  const key = `${preset}|${[...hidden].sort().join(",")}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return NextResponse.json({ stats: hit.data, cachedAt: hit.at });
  try {
    const data = await getAccountsStats(preset, undefined, undefined, hidden);
    const at = Date.now();
    cache.set(key, { at, data });
    return NextResponse.json({ stats: data, cachedAt: at });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
