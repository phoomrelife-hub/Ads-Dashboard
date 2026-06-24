import { NextRequest, NextResponse } from "next/server";
import { getAccounts, getAdTimeline } from "@/lib/fb";
import type { CreativePoint } from "@/lib/fb";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Bounded concurrency: avoids hitting FB rate limits with 40+ simultaneous requests
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

// Per-account deadline: if one account is rate-limited and retrying, don't let it block the rest
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

    const results = await mapPool<{ id: string }, CreativePoint[]>(targets, 5, (a) =>
      withTimeout(
        getAdTimeline(a.id, preset, since, until).catch(() => [] as CreativePoint[]),
        20_000,
        [] as CreativePoint[]
      )
    );

    return NextResponse.json(results.flat());
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
