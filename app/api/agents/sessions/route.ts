import { NextRequest, NextResponse } from "next/server";
import { readSessions, getSession, upsertSession, deleteSession } from "@/lib/agents/store";
import type { ChatMessage, SessionSummary } from "@/lib/agents/types";

export const dynamic = "force-dynamic";

const lastText = (msgs: ChatMessage[]): string => {
  const m = [...msgs].reverse().find((x) => x.content?.trim());
  return (m?.content || "").replace(/\s+/g, " ").slice(0, 90);
};

// GET ?sessionId=  → full session (with messages)
// GET ?agentId=    → list of session summaries (no message bodies)
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const sessionId = sp.get("sessionId");
  if (sessionId) {
    const s = getSession(sessionId);
    if (!s) return NextResponse.json({ error: "session not found" }, { status: 404 });
    return NextResponse.json({ session: s });
  }
  const agentId = sp.get("agentId") || undefined;
  const sessions: SessionSummary[] = readSessions(agentId).map((s) => ({
    id: s.id, agentId: s.agentId, title: s.title,
    createdAt: s.createdAt, updatedAt: s.updatedAt,
    messageCount: s.messages.length, preview: lastText(s.messages),
  }));
  return NextResponse.json({ sessions });
}

// POST { sessionId?, agentId, messages, title? } → create or overwrite, returns the session.
export async function POST(req: NextRequest) {
  try {
    const { sessionId, agentId, messages, title } = await req.json();
    if (!agentId) return NextResponse.json({ error: "agentId is required" }, { status: 400 });
    const session = upsertSession({ sessionId, agentId, messages: (messages || []) as ChatMessage[], title });
    return NextResponse.json({ session });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// DELETE ?sessionId=
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("sessionId");
  if (!id) return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  deleteSession(id);
  return NextResponse.json({ ok: true });
}
