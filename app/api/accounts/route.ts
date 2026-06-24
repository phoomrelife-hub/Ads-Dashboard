import { NextResponse } from "next/server";
import { getAccounts } from "@/lib/fb";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getAccounts());
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
