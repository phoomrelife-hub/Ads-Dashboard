import { NextResponse } from "next/server";
import { getTokenCanWrite } from "@/lib/fb";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const canWrite = await getTokenCanWrite();
    return NextResponse.json({ canWrite });
  } catch {
    return NextResponse.json({ canWrite: false });
  }
}
