import { NextRequest, NextResponse } from "next/server";
import { getAgentWithKey, addLog } from "@/lib/agents/store";
import { executeAction } from "@/lib/agents/actions";

export const dynamic = "force-dynamic";

// Adapt db-store agent shape to the Agent type expected by actions.ts
function toProviderAgent(a: any) {
  const scopeArr = Array.isArray(a.scope) ? a.scope : []
  const accountId = scopeArr[0] || a.scope?.accountId || ""
  return {
    ...a,
    apiKey: a.apiKey || "",
    spriteId: 0,
    color: "#5b6cff",
    deskId: null,
    pos: { x: a.posX ?? 0, y: a.posY ?? 0 },
    systemPrompt: a.systemPrompt || "",
    scope: { accountId },
    createdAt: a.createdAt ? new Date(a.createdAt).getTime() : Date.now(),
  }
}

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
