import { NextRequest, NextResponse } from "next/server";
import { searchTargeting, getReachEstimate } from "@/lib/fb";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q") ?? "";
  const type = sp.get("type") ?? "adinterest";
  try {
    return NextResponse.json({ data: await searchTargeting(q, type) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { act, targeting, optimizationGoal } = await req.json();
    return NextResponse.json({ data: await getReachEstimate(act, targeting, optimizationGoal) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
