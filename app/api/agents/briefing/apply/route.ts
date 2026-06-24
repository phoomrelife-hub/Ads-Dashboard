import { NextRequest, NextResponse } from "next/server";
import { idBelongsToAccount, rawApply } from "@/lib/agents/actions";
import { addLog } from "@/lib/agents/store";

export const dynamic = "force-dynamic";

// POST /api/agents/briefing/apply → apply ONE confirmed briefing action, account-scoped.
// Body: { accountId, tool: "set_status" | "set_budget", args, summary }
// No agent needed — the briefing targets an account directly, like a structured cron rule.
export async function POST(req: NextRequest) {
  try {
    const { accountId, tool, args, summary } = await req.json()
    if (!accountId) return NextResponse.json({ error: "accountId is required" }, { status: 400 })
    if (tool !== "set_status" && tool !== "set_budget") {
      return NextResponse.json({ error: `unsupported tool: ${tool}` }, { status: 400 })
    }
    const id = String(args?.id || "")
    if (!id) return NextResponse.json({ error: "args.id is required" }, { status: 400 })

    // Guardrail: the target must belong to this account before we touch live spend.
    const ok = await idBelongsToAccount(accountId, id)
    if (!ok) return NextResponse.json({ error: `id ${id} is not in account ${accountId}` }, { status: 403 })

    const result = await rawApply(tool, args)
    // Log against the accountId as a pseudo-agent; silently ignore FK errors
    await addLog(accountId, { type: "action", message: `[Briefing] ${summary || `${tool} ${id}`}` }).catch(() => {})
    return NextResponse.json({ ok: true, result })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
