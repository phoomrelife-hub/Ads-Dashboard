import { NextResponse } from "next/server";
import { listTemplates } from "@/lib/creative-studio/store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ data: await listTemplates() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
