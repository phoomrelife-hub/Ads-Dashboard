import { NextRequest, NextResponse } from "next/server";
import { getRules, saveRule, deleteRule, newId } from "@/lib/agents/store";
import { conditionsMetricKind, isValidTimeWindow } from "@/lib/agents/rule-eval";

export const dynamic = "force-dynamic";

// Shared save-time check for POST (new rule) and PUT (patch). Operates on the raw request
// body/patch before it's merged into the stored rule shape.
function validateRuleInput(b: any): string | null {
  const condition = b.condition;
  if (condition && typeof condition === "object" && Array.isArray(condition.items)) {
    if (conditionsMetricKind(condition.items) === "mixed") {
      return "เงื่อนไขในกฎเดียวกันต้องเป็นเมตริก Facebook ทั้งหมด หรือ TRUE metric ทั้งหมด ห้ามผสมกัน";
    }
  }
  const tw = typeof b.schedule === "object" && b.schedule ? b.schedule.timeWindow : undefined;
  if (tw && !isValidTimeWindow(tw)) {
    return "ช่วงเวลาทำงาน (timeWindow) ต้องเป็นรูปแบบ HH:MM และวันในสัปดาห์ 0-6";
  }
  return null;
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
    const validationError = validateRuleInput(b);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
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
    const validationError = validateRuleInput(patch);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
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
