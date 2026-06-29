import { NextRequest, NextResponse } from "next/server";
import { setContacted, markWon, markLost, reopen } from "@/lib/leads/store";

export const dynamic = "force-dynamic";

// POST body { id, action: 'contacted'|'won'|'lost'|'reopen', saleAmount?, product?, reason? } → { ok } | { error }
export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    const id = String(b.id || "");
    const action = String(b.action || "");
    if (!id || !action) {
      return NextResponse.json({ error: "id and action are required" }, { status: 400 });
    }
    switch (action) {
      case "contacted":
        await setContacted(id);
        break;
      case "won": {
        const amt = Number(b.saleAmount);
        if (!b.saleAmount || !Number.isFinite(amt) || amt <= 0) {
          return NextResponse.json({ error: "saleAmount must be a positive number" }, { status: 400 });
        }
        await markWon(id, amt, b.product ? String(b.product) : undefined);
        break;
      }
      case "lost":
        await markLost(id, b.reason ? String(b.reason) : undefined);
        break;
      case "reopen":
        await reopen(id);
        break;
      default:
        return NextResponse.json({ error: `unknown action: ${action}` }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
