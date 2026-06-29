// Builds and sends Lark messages from the existing briefing engine.
//   - sendDailyReport(): once-a-day "Daily Report" card per account (KPI header +
//     top attention items). Point a daily scheduler at /api/lark/daily-report.
//   - sendRuleAlert(): live red alert when a cron rule applies a real action.
// All sends are no-ops when LARK_WEBHOOK_URL is unset (see lib/lark.ts).
import { getAccounts } from "@/lib/fb";
import { buildBriefing } from "./briefing";
import type { Briefing, BriefingItem, BriefingSeverity } from "./types";
import { sendLark, card, md, hr, buttons, larkConfigured, APP_BASE_URL, type LarkColor } from "@/lib/lark";

const baht = (v: number) => "฿" + Math.round(Number(v) || 0).toLocaleString("en-US");
const num = (v: number) => Math.round(Number(v) || 0).toLocaleString("en-US");
/** "(+8% WoW)" green / "(-12% WoW)" — caller decides if up is good for colour-free text. */
const delta = (d: number | null | undefined) => (d == null ? "" : ` (${d >= 0 ? "+" : ""}${d}% WoW)`);

const SEV_EMOJI: Record<BriefingSeverity, string> = {
  critical: "🔴", warning: "⚠️", opportunity: "🟢", info: "ℹ️",
};

const MAX_ITEMS = 5;

/** One Daily Report card for an account. */
export function buildDailyReportCard(b: Briefing) {
  const s = b.summary;
  const hasCritical = b.items.some((i) => i.severity === "critical");
  const color: LarkColor = hasCritical ? "red" : s.roasDelta != null && s.roasDelta < 0 ? "orange" : "blue";

  const kpis =
    `💰 จ่าย **${baht(s.spend)}**　รายได้ **${baht(s.revenue)}**\n` +
    `📈 ROAS **${(Number(s.roas) || 0).toFixed(2)}**${delta(s.roasDelta)}　` +
    `Leads **${num(s.leads)}**${s.cplDelta != null ? `　CPL ${delta(s.cplDelta).trim()}` : ""}`;

  const elements: unknown[] = [md(kpis)];

  const top = b.items.slice(0, MAX_ITEMS);
  if (top.length) {
    elements.push(hr);
    elements.push(md("**⚠️ ต้องดูด่วน / Needs attention:**"));
    elements.push(
      md(top.map((i, n) => `${n + 1}. ${SEV_EMOJI[i.severity]} ${i.headline}`).join("\n")),
    );
    if (b.items.length > MAX_ITEMS) {
      elements.push(md(`_…และอีก ${b.items.length - MAX_ITEMS} รายการ_`));
    }
  } else {
    elements.push(md("_✅ ไม่มีรายการที่ต้องดูด่วน_"));
  }

  if (APP_BASE_URL) {
    elements.push(buttons([{ text: "เปิด Dashboard", url: `${APP_BASE_URL}/briefing`, type: "primary" }]));
  }

  const title = `📊 Daily Report · ${b.accountName || b.accountId}`;
  return card(title, elements, color);
}

/** Build a briefing per account and push a Daily Report card for each account with spend. */
export async function sendDailyReport(opts?: { preset?: string; minSpend?: number }): Promise<{
  sent: number; skipped: number; reason?: string; accounts: { id: string; name?: string; ok: boolean; error?: string }[];
}> {
  if (!larkConfigured()) return { sent: 0, skipped: 0, reason: "LARK_WEBHOOK_URL not set", accounts: [] };

  const preset = opts?.preset || "last_7d";
  const minSpend = opts?.minSpend ?? 100;
  let accounts: { id: string; name: string }[] = [];
  try {
    accounts = (await getAccounts()) as { id: string; name: string }[];
  } catch (e) {
    return { sent: 0, skipped: 0, reason: `getAccounts failed: ${(e as Error).message}`, accounts: [] };
  }

  const out: { id: string; name?: string; ok: boolean; error?: string }[] = [];
  let sent = 0, skipped = 0;
  for (const a of accounts) {
    try {
      const briefing = await buildBriefing(a.id, { preset });
      if ((Number(briefing.summary.spend) || 0) < minSpend) { skipped++; continue; }
      const res = await sendLark(buildDailyReportCard(briefing));
      out.push({ id: a.id, name: a.name, ok: res.ok, error: res.error });
      if (res.ok) sent++;
    } catch (e) {
      out.push({ id: a.id, name: a.name, ok: false, error: (e as Error).message });
    }
  }
  return { sent, skipped, accounts: out };
}

/** Live alert: a cron rule applied real action(s). Pushed as a red card. */
export async function sendRuleAlert(
  ruleName: string,
  account: string,
  applied: { entityName: string; action: string; metric?: string; value?: number }[],
): Promise<void> {
  if (!larkConfigured() || applied.length === 0) return;
  const lines = applied
    .map((i) => `• ${i.action} **${i.entityName}**${i.metric ? ` (${i.metric} ${i.value})` : ""}`)
    .join("\n");
  const elements: unknown[] = [
    md(`กฎ **${ruleName}** ทำงานบนบัญชี \`${account}\``),
    md(lines),
  ];
  if (APP_BASE_URL) elements.push(buttons([{ text: "ดูบน Dashboard", url: `${APP_BASE_URL}/agents`, type: "default" }]));
  await sendLark(card(`🔴 Rule fired · ${ruleName}`, elements, "red"));
}
