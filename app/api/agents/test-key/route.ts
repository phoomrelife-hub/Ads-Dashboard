import { NextRequest, NextResponse } from "next/server";
import { testApiKey } from "@/lib/agents/providers";

export const dynamic = "force-dynamic";

// POST /api/agents/test-key → { provider, model, apiKey } → { ok } | { error }
export async function POST(req: NextRequest) {
  try {
    const { provider, model, apiKey } = await req.json();
    if (!apiKey) return NextResponse.json({ error: "no api key" }, { status: 400 });
    await testApiKey(provider, model, apiKey);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 200 });
  }
}
