import { NextRequest, NextResponse } from "next/server";
import { getAccounts, getAdTimeline } from "@/lib/fb";
import type { CreativePoint } from "@/lib/fb";

export const dynamic = "force-dynamic";

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

    const results = await mapPool(targets, 3, (a) =>
      getAdTimeline(a.id, preset, since, until).catch(() => [] as CreativePoint[])
    );

    return NextResponse.json(results.flat());
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
