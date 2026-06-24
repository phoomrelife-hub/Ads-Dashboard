import { NextRequest, NextResponse } from "next/server";
import { getAgentWithKey, addLog } from "@/lib/agents/store";
import { runAgentTurn } from "@/lib/agents/providers";
import type { ChatMessage } from "@/lib/agents/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Adapt db-store agent shape to the Agent type expected by providers.ts
function toProviderAgent(a: any) {
  // scope in DB is text[] like ["act_123"]; extract first element as accountId
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

// POST /api/agents/chat → { agentId, messages } → { text, proposals }
export async function POST(req: NextRequest) {
  try {
    const { agentId, messages } = await req.json()
    const agentRow = await getAgentWithKey(agentId)
    if (!agentRow) return NextResponse.json({ error: "agent not found" }, { status: 404 })
    const agent = toProviderAgent(agentRow)

    const transcript = (messages || []) as ChatMessage[]
    const lastUser = [...transcript].reverse().find((m) => m.role === "user")
    if (lastUser) await addLog(agent.id, { type: "task", message: lastUser.content })

    const { text, proposals, sources } = await runAgentTurn(agent, transcript)

    if (proposals.length) await addLog(agent.id, { type: "proposal", message: proposals.map((p) => p.summary).join(" · ") })
    else if (text) await addLog(agent.id, { type: "response", message: text })

    return NextResponse.json({ text, proposals, sources })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
