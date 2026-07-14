import { NextRequest, NextResponse } from "next/server";
import { fbPost } from "@/lib/fb";

export const dynamic = "force-dynamic";

// toggle a campaign / adset / ad on or off (status = ACTIVE | PAUSED)
export async function POST(req: NextRequest) {
  try {
    const { id, status } = await req.json();
    if (!id || (status !== "ACTIVE" && status !== "PAUSED")) {
      return NextResponse.json({ error: "ต้องระบุ id และ status เป็น ACTIVE หรือ PAUSED" }, { status: 400 });
    }
    await fbPost(`/${id}`, { status });
    return NextResponse.json({ ok: true, id, status });
  } catch (e: any) {
    // fbPost attaches the raw Graph error as e.fbError. Meta ships a localised, user-facing
    // message (error_user_msg / error_user_title, often Thai) that's far clearer than the generic
    // English `message` — surface it so a blocked write explains itself in the UI instead of
    // showing "Application does not have permission for this action". code 10 / subcode 1404078 =
    // the app lacks write (Advanced Access to ads_management / App Review) — a Meta-side setting.
    const fb = e?.fbError;
    const friendly = fb?.error_user_msg || fb?.error_user_title || fb?.message || e?.message || "เปลี่ยนสถานะไม่สำเร็จ";
    return NextResponse.json(
      { error: friendly, code: fb?.code, subcode: fb?.error_subcode, detail: fb?.message },
      { status: 500 },
    );
  }
}
