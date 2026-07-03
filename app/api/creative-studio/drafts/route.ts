import { NextRequest, NextResponse } from "next/server";
import { listDrafts, saveDraft, deleteDraft } from "@/lib/creative-studio/store";
import type { SaveDraftInput } from "@/lib/creative-studio/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const act = req.nextUrl.searchParams.get("act") ?? "";
  if (!act) return NextResponse.json({ error: "Missing act" }, { status: 400 });
  try {
    return NextResponse.json({ data: await listDrafts(act) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as SaveDraftInput;
    if (!body.accountId || !body.name || !body.creative) {
      return NextResponse.json({ error: "Missing accountId, name, or creative" }, { status: 400 });
    }
    return NextResponse.json({ data: await saveDraft(body) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  try {
    await deleteDraft(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
