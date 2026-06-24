import { NextRequest, NextResponse } from "next/server";
import { getLogs } from "@/lib/agents/store";

export const dynamic = "force-dynamic";

// GET /api/agents/logs?agentId=...&limit=... → { logs } (newest first)
export async function GET(req: NextRequest) {
  try {
    const agentId = req.nextUrl.searchParams.get("agentId")
    if (!agentId) return NextResponse.json({ error: "agentId is required" }, { status: 400 })
    const limit = Number(req.nextUrl.searchParams.get("limit") || "100")
    const logs = await getLogs(agentId)
    return NextResponse.json({ logs: logs.slice(0, limit) })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
