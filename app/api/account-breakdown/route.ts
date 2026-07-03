import { NextRequest, NextResponse } from "next/server";
import { getAccounts, getAccountTotals, getAdDaily } from "@/lib/fb";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const preset = sp.get("preset") || "last_30d";
  const since = sp.get("since") || undefined;
  const until = sp.get("until") || undefined;
  const page = sp.get("page") || "";
  // `pages` = comma-separated list for brand filtering (multiple pages at once)
  const pagesParam = sp.get("pages") || "";
  const pageSet: Set<string> | null = pagesParam
    ? new Set(pagesParam.split(",").filter(Boolean))
    : page ? new Set([page]) : null;

  try {
    const accounts = await getAccounts();

    // When filtering by brand pages, only call getAdDaily for accounts that actually
    // have those pages. fb_pages table maps page_id → account_id, so we can skip the
    // 20+ accounts that never ran ads for those pages — dropping from 22 getAdDaily
    // calls to typically 2-5.
    let relevantActIds: Set<string> | null = null;
    if (pageSet) {
      const { data: pageRows } = await supabase
        .from("fb_pages")
        .select("account_id")
        .in("id", [...pageSet]);
      if (pageRows && pageRows.length > 0) {
        relevantActIds = new Set(pageRows.map((r: { account_id: string }) => r.account_id));
      }
      // If nothing in cache yet (fb_pages empty), fall back to querying all accounts
    }

    const rows = await Promise.all(
      accounts.map(async (a: { id: string; name: string; active: boolean }) => {
        try {
          let spend = 0, messaging = 0, orders = 0, revenue = 0, roas = 0;
          if (pageSet) {
            // Skip accounts that provably don't have these pages
            if (relevantActIds && !relevantActIds.has(a.id)) {
              return { id: a.id, name: a.name, active: a.active, spend: 0, messaging: 0, orders: 0, revenue: 0, roas: 0, cpi: 0, costPerOrder: 0 };
            }
            const ad = await getAdDaily(a.id, preset, since, until);
            for (const r of ad) {
              if (pageSet.has(r.pageId)) {
                spend += r.metrics.spend; messaging += r.metrics.messaging;
                orders += r.metrics.purchases; revenue += r.metrics.revenue;
              }
            }
            roas = spend ? revenue / spend : 0;
          } else {
            const m = await getAccountTotals(a.id, preset, since, until);
            spend = m.spend; messaging = m.messaging; orders = m.purchases; revenue = m.revenue; roas = m.roas;
          }
          return {
            id: a.id, name: a.name, active: a.active,
            spend, messaging, orders, revenue, roas,
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
