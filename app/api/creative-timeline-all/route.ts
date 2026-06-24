import { NextRequest, NextResponse } from "next/server";
import { getAccounts, getAdTimeline } from "@/lib/fb";
import type { CreativePoint } from "@/lib/fb";
import { getCachedTimeline, setCachedTimeline } from "@/lib/cache/creative-timeline";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const i = cursor++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>(r => setTimeout(() => r(fallback), ms))]);
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const preset = sp.get("preset") || "last_7d";
  const since = sp.get("since") || undefined;
  const until = sp.get("until") || undefined;
  const hidden = sp.get("hidden")?.split(",").filter(Boolean) ?? [];

  try {
    const all: { id: string; name: string; active?: boolean }[] = await getAccounts();
    const visible = hidden.length ? all.filter(a => !hidden.includes(a.id)) : all;
    const targets = visible.length ? visible : all;

    // Check all caches in parallel (fast — Supabase, not FB)
    const cacheResults = await Promise.all(
      targets.map(a => getCachedTimeline(a.id, preset, since, until).catch(() => null))
    );

    const fresh: CreativePoint[][] = [];
    const needFetch: { acct: { id: string }, idx: number }[] = [];
    const staleToRefresh: { acct: { id: string }, idx: number }[] = [];

    cacheResults.forEach((cached, idx) => {
      if (cached && !cached.stale) {
        fresh[idx] = cached.points;
      } else if (cached && cached.stale) {
        // Serve stale data immediately, refresh in background
        fresh[idx] = cached.points;
        staleToRefresh.push({ acct: targets[idx], idx });
      } else {
        fresh[idx] = [];
        needFetch.push({ acct: targets[idx], idx });
      }
    });

    // Fetch missing accounts from FB (blocking — user has no cached data for these)
    if (needFetch.length) {
      const fetched = await mapPool(needFetch, 5, ({ acct }) =>
        withTimeout(
          getAdTimeline(acct.id, preset, since, until).catch(() => [] as CreativePoint[]),
          20_000,
          [] as CreativePoint[]
        )
      );
      fetched.forEach((points, i) => {
        const { acct, idx } = needFetch[i];
        fresh[idx] = points;
        // Cache the result (non-blocking)
        setCachedTimeline(acct.id, preset, since, until, points);
      });
    }

    // Refresh stale accounts in background (non-blocking — user already has data)
    if (staleToRefresh.length) {
      mapPool(staleToRefresh, 3, ({ acct }) =>
        getAdTimeline(acct.id, preset, since, until)
          .then(points => setCachedTimeline(acct.id, preset, since, until, points))
          .catch(() => {})
      ).catch(() => {});
    }

    return NextResponse.json(fresh.flat());
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
