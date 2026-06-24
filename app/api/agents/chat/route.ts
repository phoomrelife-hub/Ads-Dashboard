import { NextRequest, NextResponse } from "next/server";
import { getAgent, appendLog } from "@/lib/agents/store";
import { runAgentTurn } from "@/lib/agents/providers";
import type { ChatMessage } from "@/lib/agents/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/agents/chat → { agentId, messages } → { text, proposals }
export async function POST(req: NextRequest) {
  try {
    const { agentId, messages } = await req.json();
    const agent = getAgent(agentId);
    if (!agent) return NextResponse.json({ error: "agent not found" }, { status: 404 });

    const transcript = (messages || []) as ChatMessage[];
    const lastUser = [...transcript].reverse().find((m) => m.role === "user");
    if (lastUser) appendLog(agent.id, "task", lastUser.content);

    const { text, proposals, sources } = await runAgentTurn(agent, transcript);

    if (proposals.length) appendLog(agent.id, "proposal", proposals.map((p) => p.summary).join(" · "));
    else if (text) appendLog(agent.id, "response", text);

    return NextResponse.json({ text, proposals, sources });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
