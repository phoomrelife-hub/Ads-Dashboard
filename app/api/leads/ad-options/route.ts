import { NextRequest, NextResponse } from "next/server";
import { getLevel } from "@/lib/fb";

export const dynamic = "force-dynamic";

// GET /api/leads/ad-options?account=act_.. → { options: [{ adId, adName, campaignId, campaignName }] }
// Uses campaign-level data from the last 30 days. adId/adName are null (we attribute at campaign level
// for manual-add since ad-level rows don't carry campaign info in getLevel's Row shape).
export async function GET(req: NextRequest) {
  try {
    const account = req.nextUrl.searchParams.get("account") || "";
    if (!account) return NextResponse.json({ error: "account is required" }, { status: 400 });
    const data = await getLevel(account, "campaign", "last_30d");
    const options = data.rows.map((r) => ({
      adId: null as string | null,
      adName: null as string | null,
      campaignId: String(r.id),
      campaignName: String(r.name),
    }));
    return NextResponse.json({ options });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
