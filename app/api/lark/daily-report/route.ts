import { NextRequest, NextResponse } from "next/server";
import { sendDailyReport } from "@/lib/agents/lark-report";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// GET/POST /api/lark/daily-report → build a briefing per account and push a Daily Report
// card to Lark for each account with spend. Point a DAILY scheduler at this URL (Windows
// Task Scheduler / Vercel Cron / cron-job.org), e.g. once at 09:00.
//   ?preset=last_7d   override the metric window (default last_7d)
//   ?minSpend=100     skip accounts below this spend in the window (default 100)
async function handle(req: NextRequest) {
  const preset = req.nextUrl.searchParams.get("preset") || undefined;
  const minSpendRaw = req.nextUrl.searchParams.get("minSpend");
  const minSpend = minSpendRaw != null ? Number(minSpendRaw) : undefined;
  const result = await sendDailyReport({ preset, minSpend });
  return NextResponse.json({ ...result, at: Date.now() });
}

export const GET = handle;
export const POST = handle;
