import { NextRequest, NextResponse } from "next/server";
import { uploadAdImage, uploadAdVideo } from "@/lib/fb";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const act = form.get("act") as string;
    const file = form.get("file") as File;
    if (!act || !file) return NextResponse.json({ error: "Missing act or file" }, { status: 400 });

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const fileArg = { name: file.name, type: file.type, buffer };

    if (file.type.startsWith("video/")) {
      const res = await uploadAdVideo(act, fileArg);
      return NextResponse.json(res);
    } else {
      const res = await uploadAdImage(act, fileArg);
      return NextResponse.json(res);
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
