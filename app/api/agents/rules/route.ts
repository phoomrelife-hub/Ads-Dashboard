import { NextRequest, NextResponse } from "next/server";
import { readStore, writeStore, readRules, newId } from "@/lib/agents/store";
import type { Rule } from "@/lib/agents/types";

export const dynamic = "force-dynamic";

// GET /api/agents/rules?agentId=... → { rules }
export async function GET(req: NextRequest) {
  const agentId = req.nextUrl.searchParams.get("agentId") || undefined;
  return NextResponse.json({ rules: readRules(agentId) });
}

// POST → create a rule
export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    const store = readStore();
    const rule: Rule = {
      id: newId(),
      accountId: String(b.accountId || "all"),
      agentId: b.agentId ? String(b.agentId) : undefined,
      name: String(b.name || "Rule").slice(0, 60),
      enabled: b.enabled !== false,
      dryRun: b.dryRun !== false, // default to dry-run for safety
      level: b.level || "ad",
      datePreset: String(b.datePreset || "today"),
      condition: b.condition || undefined,
      instruction: b.instruction ? String(b.instruction) : undefined,
      action: b.action || { type: "pause" },
      schedule: b.schedule || { kind: "daily", time: "00:00" },
      createdAt: Date.now(),
    };
    store.rules.push(rule);
    writeStore(store);
    return NextResponse.json({ rule });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// PUT → update a rule by id with a patch
export async function PUT(req: NextRequest) {
  try {
    const { id, patch } = await req.json();
    const store = readStore();
    const r = store.rules.find((x) => x.id === id);
    if (!r) return NextResponse.json({ error: "rule not found" }, { status: 404 });
    Object.assign(r, patch);
    writeStore(store);
    return NextResponse.json({ rule: r });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// DELETE ?id=... → remove a rule
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const store = readStore();
  store.rules = store.rules.filter((r) => r.id !== id);
  writeStore(store);
  return NextResponse.json({ ok: true });
}
