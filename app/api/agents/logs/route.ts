import { NextRequest, NextResponse } from "next/server";
import { readLogs } from "@/lib/agents/store";

export const dynamic = "force-dynamic";

// GET /api/agents/logs?agentId=...&limit=... → { logs } (newest first)
export async function GET(req: NextRequest) {
  const agentId = req.nextUrl.searchParams.get("agentId") || undefined;
  const limit = Number(req.nextUrl.searchParams.get("limit") || "100");
  const logs = readLogs(agentId).slice(0, limit);
  return NextResponse.json({ logs });
}
