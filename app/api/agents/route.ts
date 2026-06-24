import { NextRequest, NextResponse } from "next/server";
import { readStore, writeStore, toPublic, newId } from "@/lib/agents/store";
import type { Agent, Office } from "@/lib/agents/types";

export const dynamic = "force-dynamic";

// GET /api/agents → { agents: PublicAgent[], office }  (keys redacted)
export async function GET() {
  const store = readStore();
  return NextResponse.json({
    agents: store.agents.map(toPublic),
    office: store.office,
  });
}

// POST /api/agents → create an agent. Body: agent fields incl. apiKey.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const store = readStore();
    const agent: Agent = {
      id: newId(),
      name: String(body.name || "Agent").slice(0, 40),
      spriteId: Number(body.spriteId) || 0,
      color: String(body.color || "#5b6cff"),
      provider: body.provider === "openai" ? "openai" : "anthropic",
      model: String(body.model || ""),
      apiKey: String(body.apiKey || ""),
      systemPrompt: String(body.systemPrompt || ""),
      scope: { accountId: String(body.scope?.accountId || body.accountId || "") },
      deskId: body.deskId ?? null,
      pos: body.pos ?? { x: 2, y: 2 },
      createdAt: Date.now(),
    };
    store.agents.push(agent);
    writeStore(store);
    return NextResponse.json({ agent: toPublic(agent) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// PUT /api/agents → update an agent and/or the office layout.
// Body: { id?, patch?, office? }. apiKey is only overwritten when a non-empty
// value is supplied (so editing other fields never wipes the stored key).
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const store = readStore();

    if (body.office) {
      store.office = body.office as Office;
    }

    if (body.id && body.patch) {
      const a = store.agents.find((x) => x.id === body.id);
      if (!a) return NextResponse.json({ error: "agent not found" }, { status: 404 });
      const p = body.patch as Partial<Agent> & { accountId?: string };
      if (p.name !== undefined) a.name = String(p.name).slice(0, 40);
      if (p.color !== undefined) a.color = String(p.color);
      if (p.spriteId !== undefined) a.spriteId = Number(p.spriteId);
      if (p.provider !== undefined) a.provider = p.provider === "openai" ? "openai" : "anthropic";
      if (p.model !== undefined) a.model = String(p.model);
      if (p.systemPrompt !== undefined) a.systemPrompt = String(p.systemPrompt);
      if (p.deskId !== undefined) a.deskId = p.deskId;
      if (p.pos !== undefined) a.pos = p.pos;
      if (p.scope?.accountId !== undefined) a.scope.accountId = String(p.scope.accountId);
      else if (p.accountId !== undefined) a.scope.accountId = String(p.accountId);
      if (typeof p.apiKey === "string" && p.apiKey.length > 0) a.apiKey = p.apiKey;
    }

    writeStore(store);
    return NextResponse.json({
      agents: store.agents.map(toPublic),
      office: store.office,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// DELETE /api/agents?id=... → remove an agent.
export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    const store = readStore();
    store.agents = store.agents.filter((a) => a.id !== id);
    writeStore(store);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
