import { NextRequest, NextResponse } from "next/server";
import { getRuleRuns } from "@/lib/agents/store";

export const dynamic = "force-dynamic";

// GET /api/agents/rules/runs?ruleId=...&limit=... → { runs } (newest first)
export async function GET(req: NextRequest) {
  try {
    const ruleId = req.nextUrl.searchParams.get("ruleId")
    if (!ruleId) return NextResponse.json({ error: "ruleId is required" }, { status: 400 })
    const limit = Number(req.nextUrl.searchParams.get("limit") || "50")
    const runs = await getRuleRuns(ruleId)
    return NextResponse.json({ runs: runs.slice(0, limit) })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
