import { NextRequest, NextResponse } from "next/server";
import { getBreakdown, getBreakdownAll, Dim } from "@/lib/fb";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const act = sp.get("act") || "";
  const dim = (sp.get("dim") || "day") as Dim;
  const preset = sp.get("preset") || "last_30d";
  const since = sp.get("since") || undefined;
  const until = sp.get("until") || undefined;
  const hidden = (sp.get("hidden") || "").split(",").filter(Boolean); // hidden accounts, excluded from the "all" merge
  try {
    return NextResponse.json(act === "all"
      ? await getBreakdownAll(preset, dim, since, until, hidden)
      : await getBreakdown(act, preset, dim, since, until));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
