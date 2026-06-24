import { NextRequest, NextResponse } from "next/server";
import { getLevel, getLevelAll, Level } from "@/lib/fb";
import { setInsightsSnapshot } from "@/lib/cache/insights";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const act = sp.get("act") || "";
  const level = (sp.get("level") || "campaign") as Level;
  const preset = sp.get("preset") || "last_30d";
  const since = sp.get("since") || undefined;
  const until = sp.get("until") || undefined;
  const hidden = (sp.get("hidden") || "").split(",").filter(Boolean); // hidden accounts, excluded from the "all" merge
  try {
    const data = act === "all"
      ? await getLevelAll(level, preset, since, until, hidden)
      : await getLevel(act, level, preset, since, until);

    // Non-blocking snapshot — don't await, don't let failure break the response
    if (act && act !== "all") {
      setInsightsSnapshot(act, preset, level, data).catch(() => {});
    }

    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
