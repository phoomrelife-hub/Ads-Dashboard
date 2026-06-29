import { NextRequest, NextResponse } from "next/server";
import { computeTrueRoas } from "@/lib/leads/roas";

export const dynamic = "force-dynamic";

// GET /api/true-roas?account=act_..&level=campaign|ad&preset=last_30d
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const account = sp.get("account") || "";
  const level = (sp.get("level") || "campaign") as "campaign" | "ad";
  const preset = sp.get("preset") || "last_30d";
  const since = sp.get("since") || undefined;
  const until = sp.get("until") || undefined;

  if (!account) {
    return NextResponse.json({ error: "account is required" }, { status: 400 });
  }
  if (level !== "campaign" && level !== "ad") {
    return NextResponse.json({ error: "level must be campaign or ad" }, { status: 400 });
  }

  try {
    const result = await computeTrueRoas(account, level, preset, since, until);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
