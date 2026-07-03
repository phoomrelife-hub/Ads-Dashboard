import { NextResponse } from "next/server";
import { sendLark, card, md, larkConfigured } from "@/lib/lark";

export const dynamic = "force-dynamic";

// GET/POST /api/lark/test → fire a hello card to verify the webhook is wired up.
async function handle() {
  if (!larkConfigured()) {
    return NextResponse.json({ ok: false, error: "LARK_WEBHOOK_URL not set in environment" }, { status: 400 });
  }
  const res = await sendLark(
    card("✅ Relife Ads · Lark connected", [
      md("ถ้าเห็นข้อความนี้ แปลว่าการแจ้งเตือน Lark ทำงานแล้ว 🎉\n\n_Daily report + live alerts are ready._"),
    ], "green"),
  );
  return NextResponse.json(res, { status: res.ok ? 200 : 502 });
}

export const GET = handle;
export const POST = handle;
