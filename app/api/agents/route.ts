import { NextRequest, NextResponse } from "next/server";
import { getAgents, getAgent, getAgentWithKey, saveAgent, deleteAgent, getOfficeLayout, saveOfficeLayout, newId } from "@/lib/agents/store";

export const dynamic = "force-dynamic";

// GET /api/agents → { agents, office }
export async function GET() {
  try {
    const [agents, office] = await Promise.all([getAgents(), getOfficeLayout()])
    return NextResponse.json({ agents, office })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST /api/agents → create an agent. Body: agent fields incl. apiKey.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const id = newId()
    await saveAgent({
      id,
      name: String(body.name || "Agent").slice(0, 40),
      role: String(body.role || ""),
      sprite: String(body.sprite || "default"),
      provider: body.provider === "openai" ? "openai" : "anthropic",
      model: String(body.model || ""),
      systemPrompt: String(body.systemPrompt || ""),
      scope: body.scope ?? [],
      apiKey: body.apiKey ?? null,
      posX: body.posX ?? body.pos?.x ?? 2,
      posY: body.posY ?? body.pos?.y ?? 2,
    })
    const agent = await getAgent(id)
    return NextResponse.json({ agent })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// PUT /api/agents → update an agent and/or the office layout.
// Body: { id?, patch?, office? }. apiKey is only overwritten when a non-empty value is supplied.
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()

    if (body.office) {
      await saveOfficeLayout(body.office)
    }

    if (body.id && body.patch) {
      const existing = await getAgentWithKey(body.id)
      if (!existing) return NextResponse.json({ error: "agent not found" }, { status: 404 })
      const p = body.patch
      await saveAgent({
        id: body.id,
        name: p.name !== undefined ? String(p.name).slice(0, 40) : existing.name,
        role: p.role !== undefined ? String(p.role) : (existing.role ?? ''),
        sprite: p.sprite !== undefined ? String(p.sprite) : (existing.sprite ?? 'default'),
        provider: p.provider !== undefined ? (p.provider === "openai" ? "openai" : "anthropic") : existing.provider,
        model: p.model !== undefined ? String(p.model) : existing.model,
        systemPrompt: p.systemPrompt !== undefined ? String(p.systemPrompt) : (existing.systemPrompt ?? ''),
        scope: p.scope !== undefined ? p.scope : existing.scope,
        apiKey: (typeof p.apiKey === "string" && p.apiKey.length > 0) ? p.apiKey : (existing.apiKey ?? null),
        posX: p.posX !== undefined ? p.posX : (p.pos?.x !== undefined ? p.pos.x : existing.posX),
        posY: p.posY !== undefined ? p.posY : (p.pos?.y !== undefined ? p.pos.y : existing.posY),
      })
    }

    const [agents, office] = await Promise.all([getAgents(), getOfficeLayout()])
    return NextResponse.json({ agents, office })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// DELETE /api/agents?id=... → remove an agent.
export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id")
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 })
    await deleteAgent(id)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
