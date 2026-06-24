import { NextRequest, NextResponse } from "next/server";
import { readRuleRuns } from "@/lib/agents/store";

export const dynamic = "force-dynamic";

// GET /api/agents/rules/runs?ruleId=...&limit=... → { runs } (newest first)
export async function GET(req: NextRequest) {
  const ruleId = req.nextUrl.searchParams.get("ruleId") || undefined;
  const limit = Number(req.nextUrl.searchParams.get("limit") || "50");
  return NextResponse.json({ runs: readRuleRuns(ruleId).slice(0, limit) });
}
