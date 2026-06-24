import { NextRequest, NextResponse } from "next/server";
import { getAccountPages } from "@/lib/fb";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const act = req.nextUrl.searchParams.get("act") || "";
  if (!act) return NextResponse.json([]);
  try {
    return NextResponse.json(await getAccountPages(act));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
