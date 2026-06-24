import { NextRequest, NextResponse } from "next/server";
import { getAccounts, realChainDeps } from "@/lib/fb";
import { createCampaignChain, type CampaignDraft } from "@/lib/ads-create/chain";
import { validateBudgetFloor } from "@/lib/ads-create/spec";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { act, draft } = (await req.json()) as { act: string; draft: CampaignDraft };
    if (!act || !draft) return NextResponse.json({ ok: false, error: { message: "Missing act or draft" } }, { status: 400 });

    // Guardrail 1: account must belong to this token.
    const accounts = await getAccounts();
    if (!accounts.some((a: { id: string }) => String(a.id) === String(act))) {
      return NextResponse.json({ ok: false, error: { message: "Account not in scope for this token" } }, { status: 403 });
    }

    // Guardrail 2: budget floor (daily budgets only; lifetime is validated client-side against the same rule).
    if (draft.dailyBudgetMajor != null) {
      const budErr = validateBudgetFloor(draft.dailyBudgetMajor, draft.currency);
      if (budErr) return NextResponse.json({ ok: false, error: { message: budErr } }, { status: 400 });
    }

    const result = await createCampaignChain(act, draft, realChainDeps());
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: { message: e instanceof Error ? e.message : String(e) } }, { status: 500 });
  }
}
