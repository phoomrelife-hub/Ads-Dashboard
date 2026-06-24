import { NextRequest, NextResponse } from "next/server";
import { getSessions, getSession, saveSession, deleteSession } from "@/lib/agents/store";

export const dynamic = "force-dynamic";

function newId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 16)
}

function lastText(messages: any[]): string {
  const m = [...messages].reverse().find((x: any) => x.content?.trim())
  return ((m?.content || "") as string).replace(/\s+/g, " ").slice(0, 90)
}

function deriveTitle(messages: any[]): string {
  const firstUser = messages.find((m: any) => m.role === "user")
  const t = (firstUser?.content || "New conversation").trim().replace(/\s+/g, " ")
  return t.length > 60 ? t.slice(0, 60) + "…" : t
}

// GET ?sessionId=  → full session (with messages)
// GET ?agentId=    → list of session summaries (no message bodies)
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const sessionId = sp.get("sessionId")
    if (sessionId) {
      const s = await getSession(sessionId)
      if (!s) return NextResponse.json({ error: "session not found" }, { status: 404 })
      return NextResponse.json({ session: s })
    }
    const agentId = sp.get("agentId")
    if (!agentId) return NextResponse.json({ error: "agentId or sessionId is required" }, { status: 400 })
    const sessions = await getSessions(agentId)
    const summaries = sessions.map((s: any) => ({
      id: s.id, agentId: s.agentId, title: s.title,
      createdAt: s.createdAt, updatedAt: s.updatedAt,
      messageCount: s.messages.length, preview: lastText(s.messages),
    }))
    return NextResponse.json({ sessions: summaries })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST { sessionId?, agentId, messages, title? } → create or overwrite, returns the session.
export async function POST(req: NextRequest) {
  try {
    const { sessionId, agentId, messages, title } = await req.json()
    if (!agentId) return NextResponse.json({ error: "agentId is required" }, { status: 400 })
    const msgs = messages || []
    const id = sessionId || newId()
    const sessionTitle = title || deriveTitle(msgs)
    await saveSession(agentId, { id, title: sessionTitle, messages: msgs })
    const session = await getSession(id)
    return NextResponse.json({ session })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// DELETE ?sessionId=
export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("sessionId")
    if (!id) return NextResponse.json({ error: "sessionId is required" }, { status: 400 })
    await deleteSession(id)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
