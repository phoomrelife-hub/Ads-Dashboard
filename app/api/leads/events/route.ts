import { NextRequest, NextResponse } from "next/server";
import { getLeadEvents } from "@/lib/leads/store";

export const dynamic = "force-dynamic";

// GET /api/leads/events?id=.. → { events }
export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    const events = await getLeadEvents(id);
    return NextResponse.json({ events });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
