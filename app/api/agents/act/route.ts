import { NextRequest, NextResponse } from "next/server";
import { getAgentWithKey, addLog, toProviderAgent } from "@/lib/agents/store";
import { executeAction } from "@/lib/agents/actions";

export const dynamic = "force-dynamic";

// POST /api/agents/act → execute a CONFIRMED write action.
// Body: { agentId, tool, args, summary }. Returns { ok, result } or { error }.
export async function POST(req: NextRequest) {
  try {
    const { agentId, tool, args, summary } = await req.json()
    const agentRow = await getAgentWithKey(agentId)
    if (!agentRow) return NextResponse.json({ error: "agent not found" }, { status: 404 })
    const agent = toProviderAgent(agentRow)

    if (tool === "navigate") {
      await addLog(agent.id, { type: "action", message: `Opened ${args.path}` })
      return NextResponse.json({ ok: true, result: { navigate: args } })
    }

    const result = await executeAction(agent, tool, args)
    await addLog(agent.id, { type: "action", message: summary || `${tool} ${JSON.stringify(args)}` })
    return NextResponse.json({ ok: true, result })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
