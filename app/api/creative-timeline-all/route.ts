import { NextRequest, NextResponse } from "next/server";
import { getAccounts, getAdTimeline } from "@/lib/fb";

export const dynamic = "force-dynamic";

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

    const results = await Promise.all(
      targets.map(a => getAdTimeline(a.id, preset, since, until).catch(() => []))
    );

    return NextResponse.json(results.flat());
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
