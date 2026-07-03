import { NextRequest, NextResponse } from "next/server";
import { getDraft, markPublished } from "@/lib/creative-studio/store";
import { createCreative } from "@/lib/fb";
import { normalizeFbError } from "@/lib/ads-create/spec";
import type { CampaignDraft } from "@/lib/ads-create/chain";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let id = "";
  try {
    const body = (await req.json()) as { id?: string };
    id = body.id ?? "";
  } catch {
    /* fall through to validation */
  }
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const draft = await getDraft(id).catch(() => null);
  if (!draft) return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  if (draft.status === "published" && draft.fbCreativeId) {
    return NextResponse.json({ id: draft.fbCreativeId, alreadyPublished: true });
  }

  // createCreative only reads draft.name + draft.creative — pass a minimal CampaignDraft.
  const minimal = { name: draft.name, creative: draft.creative } as CampaignDraft;
  try {
    const { id: fbCreativeId } = await createCreative(draft.accountId, minimal);
    await markPublished(draft.id, fbCreativeId);
    return NextResponse.json({ id: fbCreativeId });
  } catch (e) {
    const { message, hint } = normalizeFbError(e);
    return NextResponse.json({ error: message, hint }, { status: 500 });
  }
}
