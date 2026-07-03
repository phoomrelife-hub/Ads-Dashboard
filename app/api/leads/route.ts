import { NextRequest, NextResponse } from "next/server";
import { listLeads, leadCounts, addLead } from "@/lib/leads/store";
import type { LeadStatus } from "@/lib/leads/types";

export const dynamic = "force-dynamic";

// GET /api/leads?account=act_..&status=..&search=.. → { leads, counts }
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const account = sp.get("account") || "";
    if (!account) return NextResponse.json({ error: "account is required" }, { status: 400 });
    const rawStatus = sp.get("status") || "all";
    const status = rawStatus as LeadStatus | "all";
    const search = sp.get("search") || undefined;
    const limit = sp.get("limit") ? Number(sp.get("limit")) : undefined;
    const offset = sp.get("offset") ? Number(sp.get("offset")) : undefined;
    const [leads, counts] = await Promise.all([
      listLeads(account, { status, search, limit, offset }),
      leadCounts(account),
    ]);
    return NextResponse.json({ leads, counts });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST body { accountId, phone, name?, campaignId?, adId?, campaignName?, adName?, source } → { lead }
export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    const accountId = String(b.accountId || "");
    const phone = String(b.phone || "");
    if (!accountId || !phone) {
      return NextResponse.json({ error: "accountId and phone are required" }, { status: 400 });
    }
    const validSources = ["lead_form", "click_to_message", "manual"] as const;
    const source: "lead_form" | "click_to_message" | "manual" =
      validSources.includes(b.source) ? (b.source as "lead_form" | "click_to_message" | "manual") : "click_to_message";
    const lead = await addLead({
      accountId,
      phone,
      name: b.name ? String(b.name) : undefined,
      campaignId: b.campaignId ? String(b.campaignId) : undefined,
      adId: b.adId ? String(b.adId) : undefined,
      campaignName: b.campaignName ? String(b.campaignName) : undefined,
      adName: b.adName ? String(b.adName) : undefined,
      source,
    });
    return NextResponse.json({ lead });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
