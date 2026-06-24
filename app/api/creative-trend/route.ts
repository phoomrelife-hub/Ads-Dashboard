import { NextRequest, NextResponse } from "next/server";
import { getAdTrend } from "@/lib/fb";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const adId = sp.get("adId") || "";
  const preset = sp.get("preset") || "last_30d";
  const since = sp.get("since") || undefined;
  const until = sp.get("until") || undefined;
  try {
    return NextResponse.json(await getAdTrend(adId, preset, since, until));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
