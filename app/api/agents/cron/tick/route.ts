import { NextRequest, NextResponse } from "next/server";
import { getAgents } from "@/lib/agents/store";
import { runDueRules } from "@/lib/agents/cron";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Evaluate due automation rules and run them.
// GET/POST /api/agents/cron/tick              → run everything currently due (all agents)
// GET/POST /api/agents/cron/tick?force=RULEID → run that rule now (ignores schedule)
//
// Point Windows Task Scheduler / Vercel Cron / any external cron at this URL
// (e.g. every minute) for true unattended 12am execution.
async function handle(req: NextRequest) {
  try {
    const force = req.nextUrl.searchParams.get("force") || undefined;
    const agents = await getAgents();
    const all: { id: string; name: string; summary: string }[] = [];
    for (const agent of agents) {
      const ran = await runDueRules(agent.id, force);
      all.push(...ran);
    }
    return NextResponse.json({ ok: true, ran: all, at: Date.now() });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
