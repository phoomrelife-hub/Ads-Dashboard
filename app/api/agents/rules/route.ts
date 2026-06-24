import { NextRequest, NextResponse } from "next/server";
import { getRules, saveRule, deleteRule } from "@/lib/agents/store";

export const dynamic = "force-dynamic";

function newId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 16)
}

// GET /api/agents/rules?agentId=... → { rules }
export async function GET(req: NextRequest) {
  try {
    const agentId = req.nextUrl.searchParams.get("agentId")
    if (!agentId) return NextResponse.json({ error: "agentId is required" }, { status: 400 })
    const rules = await getRules(agentId)
    return NextResponse.json({ rules })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST → create a rule
export async function POST(req: NextRequest) {
  try {
    const b = await req.json()
    const agentId = String(b.agentId || "")
    if (!agentId) return NextResponse.json({ error: "agentId is required" }, { status: 400 })
    const rule = {
      id: newId(),
      accountId: String(b.accountId || "all"),
      name: String(b.name || "Rule").slice(0, 60),
      enabled: b.enabled !== false,
      dryRun: b.dryRun !== false,
      level: b.level || "ad",
      datePreset: String(b.datePreset || "today"),
      condition: b.condition ?? null,
      instruction: b.instruction ? String(b.instruction) : null,
      action: typeof b.action === 'object' ? JSON.stringify(b.action) : (b.action || '{"type":"pause"}'),
      schedule: typeof b.schedule === 'object' ? JSON.stringify(b.schedule) : (b.schedule || '{"kind":"daily","time":"00:00"}'),
    }
    await saveRule(agentId, rule)
    return NextResponse.json({ rule })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// PUT → update a rule by id with a patch
export async function PUT(req: NextRequest) {
  try {
    const { id, agentId, patch } = await req.json()
    if (!id || !agentId) return NextResponse.json({ error: "id and agentId are required" }, { status: 400 })
    const existing = await getRules(agentId)
    const rule = existing.find((r: any) => r.id === id)
    if (!rule) return NextResponse.json({ error: "rule not found" }, { status: 404 })
    const updated = { ...rule, ...patch }
    // Serialize complex objects for storage
    if (typeof updated.action === 'object' && updated.action !== null) {
      updated.action = JSON.stringify(updated.action)
    }
    if (typeof updated.schedule === 'object' && updated.schedule !== null) {
      updated.schedule = JSON.stringify(updated.schedule)
    }
    await saveRule(agentId, updated)
    return NextResponse.json({ rule: updated })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// DELETE ?id=... → remove a rule
export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id")
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 })
    await deleteRule(id)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
