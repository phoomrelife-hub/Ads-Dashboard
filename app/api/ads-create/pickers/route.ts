import { NextRequest, NextResponse } from "next/server";
import { getPages, getPagePosts, getExistingCreatives, getCustomAudiences, getPixels } from "@/lib/fb";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const kind = sp.get("kind");
  const act = sp.get("act") ?? "";
  const pageId = sp.get("pageId") ?? "";
  try {
    switch (kind) {
      case "pages": return NextResponse.json({ data: await getPages() });
      case "posts": return NextResponse.json({ data: await getPagePosts(pageId) });
      case "creatives": return NextResponse.json({ data: await getExistingCreatives(act) });
      case "audiences": return NextResponse.json({ data: await getCustomAudiences(act) });
      case "pixels": return NextResponse.json({ data: await getPixels(act) });
      default: return NextResponse.json({ error: "unknown kind" }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
