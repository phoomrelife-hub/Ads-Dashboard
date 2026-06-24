import { NextRequest, NextResponse } from "next/server";
import { getAccounts, getAccountTotals, getAdDaily } from "@/lib/fb";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const preset = sp.get("preset") || "last_30d";
  const since = sp.get("since") || undefined;
  const until = sp.get("until") || undefined;
  const page = sp.get("page") || ""; // when set → each account's totals scoped to this page

  try {
    const accounts = await getAccounts();

    const rows = await Promise.all(
      accounts.map(async (a: { id: string; name: string; active: boolean }) => {
        try {
          let spend = 0, messaging = 0, orders = 0, revenue = 0, roas = 0;
          if (page) {
            // sum only this page's ads within the account
            const ad = await getAdDaily(a.id, preset, since, until);
            for (const r of ad) if (r.pageId === page) { spend += r.metrics.spend; messaging += r.metrics.messaging; orders += r.metrics.purchases; revenue += r.metrics.revenue; }
            roas = spend ? revenue / spend : 0;
          } else {
            const m = await getAccountTotals(a.id, preset, since, until);
            spend = m.spend; messaging = m.messaging; orders = m.purchases; revenue = m.revenue; roas = m.roas;
          }
          return {
            id: a.id,
            name: a.name,
            active: a.active,
            spend,
            messaging,
            orders,
            revenue,
            roas,
            cpi: messaging ? spend / messaging : 0,
            costPerOrder: orders ? spend / orders : 0,
          };
        } catch {
          return { id: a.id, name: a.name, active: a.active, spend: 0, messaging: 0, orders: 0, revenue: 0, roas: 0, cpi: 0, costPerOrder: 0 };
        }
      })
    );

    rows.sort((a, b) => b.spend - a.spend);
    const totalSpend = rows.reduce((s, r) => s + r.spend, 0);
    const withShare = rows.map((r) => ({ ...r, share: totalSpend ? r.spend / totalSpend : 0 }));

    return NextResponse.json({ rows: withShare, totalSpend });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
