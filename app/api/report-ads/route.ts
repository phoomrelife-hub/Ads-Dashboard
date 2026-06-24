import { NextRequest, NextResponse } from "next/server";
import { getBreakdown, getAccounts, getAdDaily } from "@/lib/fb";

export const dynamic = "force-dynamic";

function fmtDate(s: string) {
  const [, m, d] = s.split("-");
  return `${parseInt(d)}/${parseInt(m)}`;
}

type DayAcc = { spend: number; revenue: number; messages: number; orders: number; newAccounts: number };

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const act = sp.get("act") || "";
  const preset = sp.get("preset") || "last_30d";
  const since = sp.get("since") || undefined;
  const until = sp.get("until") || undefined;
  const page = sp.get("page") || ""; // when set → ad-level path filtered to this page

  if (!act) return NextResponse.json({ error: "act required" }, { status: 400 });

  try {
    // "all" merges the daily breakdown of every account; otherwise just the one
    const acts: string[] = act === "all"
      ? (await getAccounts()).map((a: { id: string }) => a.id)
      : [act];

    const add = (byDate: Map<string, DayAcc>, key: string, m: { spend: number; revenue: number; messaging: number; purchases: number; leads: number }) => {
      const d = byDate.get(key) || { spend: 0, revenue: 0, messages: 0, orders: 0, newAccounts: 0 };
      d.spend += m.spend; d.revenue += m.revenue; d.messages += m.messaging; d.orders += m.purchases; d.newAccounts += m.leads;
      byDate.set(key, d);
    };

    // sum raw metrics per date across all accounts
    const byDate = new Map<string, DayAcc>();
    if (page) {
      // ad-level: keep only ads belonging to the selected page, then aggregate by day
      const perAct = await Promise.all(acts.map((id) => getAdDaily(id, preset, since, until).catch(() => [])));
      for (const rows of perAct)
        for (const r of rows)
          if (r.pageId === page)
            add(byDate, r.date, r.metrics as any);
    } else {
      // fast path: pre-aggregated account-level day breakdown
      const results = await Promise.all(
        acts.map((id) => getBreakdown(id, preset, "day", since, until).then(r => r.rows).catch(() => []))
      );
      for (const rows of results)
        for (const r of rows)
          add(byDate, String(r.key), { spend: Number(r.spend), revenue: Number(r.revenue), messaging: Number(r.messaging), purchases: Number(r.purchases), leads: Number(r.leads) });
    }

    const daily = [...byDate.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([date, d]) => {
        const conversions = d.orders + d.newAccounts;
        return {
          date,
          dateStr: fmtDate(date),
          spend: d.spend,
          revenue: d.revenue,
          messages: d.messages,
          orders: d.orders,
          newAccounts: d.newAccounts,
          roas: d.spend ? d.revenue / d.spend : 0,
          conversions,
          costPerConv: conversions ? d.spend / conversions : 0,
          aov: d.orders ? d.revenue / d.orders : 0,
          closeRate: d.messages ? d.orders / d.messages : 0,
        };
      });

    const n = daily.length || 1;
    const totalSpend = daily.reduce((a, d) => a + d.spend, 0);
    const totalRevenue = daily.reduce((a, d) => a + d.revenue, 0);
    const totalMessages = daily.reduce((a, d) => a + d.messages, 0);
    const totalOrders = daily.reduce((a, d) => a + d.orders, 0);
    const totalNewAccounts = daily.reduce((a, d) => a + d.newAccounts, 0);

    return NextResponse.json({
      daily,
      stats: {
        roas: totalSpend ? totalRevenue / totalSpend : 0,
        avgRoas: daily.reduce((a, d) => a + d.roas, 0) / n,
        totalSpend,
        avgSpend: totalSpend / n,
        totalRevenue,
        avgRevenue: totalRevenue / n,
        totalMessages,
        avgMessages: totalMessages / n,
        totalOrders,
        avgOrders: totalOrders / n,
        costPerOrder: totalOrders ? totalSpend / totalOrders : 0,
        totalNewAccounts,
        avgNewAccounts: totalNewAccounts / n,
        totalConversions: totalOrders + totalNewAccounts,
        costPerConv: (totalOrders + totalNewAccounts) ? totalSpend / (totalOrders + totalNewAccounts) : 0,
        convRate: totalMessages ? (totalOrders + totalNewAccounts) / totalMessages : 0,
        aov: totalOrders ? totalRevenue / totalOrders : 0,
        closeRate: totalMessages ? totalOrders / totalMessages : 0,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
