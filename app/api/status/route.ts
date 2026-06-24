import { NextRequest, NextResponse } from "next/server";
import { fbPost } from "@/lib/fb";

export const dynamic = "force-dynamic";

// toggle a campaign / adset / ad on or off (status = ACTIVE | PAUSED)
export async function POST(req: NextRequest) {
  try {
    const { id, status } = await req.json();
    await fbPost(`/${id}`, { status });
    return NextResponse.json({ ok: true, id, status });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
