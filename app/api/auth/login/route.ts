import { NextRequest, NextResponse } from "next/server";
import { createSessionToken, SESSION_COOKIE } from "@/lib/auth-cookie";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const secret = process.env.AUTH_COOKIE_SECRET;
  const password = process.env.ADS_DASHBOARD_PASSWORD;
  if (!secret || !password) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 500 });
  }

  const body = await req.json().catch(() => null);
  const submitted = typeof body?.password === "string" ? body.password : "";

  if (submitted.length !== password.length || submitted !== password) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  const { token, maxAge } = await createSessionToken(secret);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
  });
  return res;
}
