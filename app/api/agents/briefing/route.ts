import { NextRequest, NextResponse } from "next/server";
import { buildBriefing } from "@/lib/agents/briefing";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/agents/briefing?account=act_123&preset=last_7d&minSpend=100
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const account = sp.get("account") || "";
  if (!account) return NextResponse.json({ error: "account is required" }, { status: 400 });
  const preset = sp.get("preset") || "last_7d";
  const minSpend = sp.get("minSpend") ? Number(sp.get("minSpend")) : undefined;
  try {
    return NextResponse.json(await buildBriefing(account, { preset, minSpend }));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
