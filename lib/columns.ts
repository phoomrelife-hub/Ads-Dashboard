// metric column registry — drives the table + customizer
export type Fmt = "baht" | "num" | "dec" | "pct" | "sec";
export type Agg = "sum" | "cpm" | "cpc" | "ctr" | "linkctr" | "cpl" | "cpmsg" | "cppur" | "roas" | null;
export interface Col { k: string; label: string; g: string; fmt: Fmt; agg: Agg; def: boolean }

export const COLS: Col[] = [
  { k: "spend", label: "ใช้จ่าย", g: "ต้นทุน & การแสดงผล", fmt: "baht", agg: "sum", def: true },
  { k: "reach", label: "Reach", g: "ต้นทุน & การแสดงผล", fmt: "num", agg: "sum", def: true },
  { k: "impressions", label: "Impressions", g: "ต้นทุน & การแสดงผล", fmt: "num", agg: "sum", def: true },
  { k: "frequency", label: "Frequency", g: "ต้นทุน & การแสดงผล", fmt: "dec", agg: null, def: false },
  { k: "cpm", label: "CPM", g: "ต้นทุน & การแสดงผล", fmt: "baht", agg: "cpm", def: true },
  { k: "cpc", label: "CPC", g: "ต้นทุน & การแสดงผล", fmt: "baht", agg: "cpc", def: false },
  { k: "cpp", label: "CPP (ต่อ 1พัน Reach)", g: "ต้นทุน & การแสดงผล", fmt: "baht", agg: null, def: false },
  { k: "clicks", label: "Clicks", g: "คลิก", fmt: "num", agg: "sum", def: true },
  { k: "ctr", label: "CTR", g: "คลิก", fmt: "pct", agg: "ctr", def: true },
  { k: "linkClicks", label: "Link Clicks", g: "คลิก", fmt: "num", agg: "sum", def: false },
  { k: "linkCtr", label: "Link CTR", g: "คลิก", fmt: "pct", agg: "linkctr", def: false },
  { k: "uniqueClicks", label: "Unique Clicks", g: "คลิก", fmt: "num", agg: "sum", def: false },
  { k: "uniqueCtr", label: "Unique CTR", g: "คลิก", fmt: "pct", agg: null, def: false },
  { k: "postEngagement", label: "Post Engagement", g: "การมีส่วนร่วม", fmt: "num", agg: "sum", def: false },
  { k: "pageEngagement", label: "Page Engagement", g: "การมีส่วนร่วม", fmt: "num", agg: "sum", def: false },
  { k: "reactions", label: "Reactions", g: "การมีส่วนร่วม", fmt: "num", agg: "sum", def: false },
  { k: "landingPageViews", label: "Landing Page Views", g: "การมีส่วนร่วม", fmt: "num", agg: "sum", def: false },
  { k: "videoViews", label: "Video Views", g: "การมีส่วนร่วม", fmt: "num", agg: "sum", def: false },
  { k: "leads", label: "Leads", g: "Conversions", fmt: "num", agg: "sum", def: true },
  { k: "messaging", label: "ทักแชท", g: "Conversions", fmt: "num", agg: "sum", def: false },
  { k: "purchases", label: "Purchases", g: "Conversions", fmt: "num", agg: "sum", def: true },
  { k: "addToCart", label: "Add to Cart", g: "Conversions", fmt: "num", agg: "sum", def: false },
  { k: "checkout", label: "Checkout", g: "Conversions", fmt: "num", agg: "sum", def: false },
  { k: "revenue", label: "รายได้", g: "Conversions", fmt: "baht", agg: "sum", def: false },
  { k: "roas", label: "ROAS", g: "Conversions", fmt: "dec", agg: "roas", def: false },
  { k: "cpl", label: "CPL (ต้นทุน/Lead)", g: "ต้นทุนต่อผลลัพธ์", fmt: "baht", agg: "cpl", def: false },
  { k: "costPerMessaging", label: "ต้นทุน/แชท", g: "ต้นทุนต่อผลลัพธ์", fmt: "baht", agg: "cpmsg", def: false },
  { k: "costPerPurchase", label: "ต้นทุน/Purchase", g: "ต้นทุนต่อผลลัพธ์", fmt: "baht", agg: "cppur", def: false },
  { k: "thruplays", label: "ThruPlays", g: "วิดีโอ", fmt: "num", agg: "sum", def: false },
  { k: "videoPlays", label: "Video Plays", g: "วิดีโอ", fmt: "num", agg: "sum", def: false },
  { k: "avgWatch", label: "เวลาดูเฉลี่ย", g: "วิดีโอ", fmt: "sec", agg: null, def: false },
  { k: "vp25", label: "ดู 25%", g: "วิดีโอ", fmt: "num", agg: "sum", def: false },
  { k: "vp50", label: "ดู 50%", g: "วิดีโอ", fmt: "num", agg: "sum", def: false },
  { k: "vp75", label: "ดู 75%", g: "วิดีโอ", fmt: "num", agg: "sum", def: false },
  { k: "vp100", label: "ดูจบ 100%", g: "วิดีโอ", fmt: "num", agg: "sum", def: false },
];
export const DEFAULT_VIS = COLS.filter((c) => c.def).map((c) => c.k);
export const COL_GROUPS = [...new Set(COLS.map((c) => c.g))];

export const baht = (v: number) => "฿" + Number(v).toLocaleString("th-TH", { maximumFractionDigits: 2 });
export const num = (v: number) => Number(v).toLocaleString("th-TH");
export const dec = (v: number, d = 2) => Number(v).toLocaleString("th-TH", { minimumFractionDigits: d, maximumFractionDigits: d });

export function fmtVal(fmt: Fmt, v: number): string {
  if (!v) return "—";
  if (fmt === "baht") return baht(v);
  if (fmt === "num") return num(v);
  if (fmt === "dec") return dec(v, 2);
  if (fmt === "pct") return dec(v, 2) + "%";
  if (fmt === "sec") return dec(v, 1) + " วิ";
  return String(v);
}

// footer total per column, computed from summed totals
export function footVal(c: Col, t: Record<string, number>): string {
  const r = (a: number, b: number, m = 1) => (b ? (a / b) * m : 0);
  switch (c.agg) {
    case "sum": return fmtVal(c.fmt, t[c.k]);
    case "cpm": return fmtVal("baht", r(t.spend, t.impressions, 1000));
    case "cpc": return fmtVal("baht", r(t.spend, t.clicks));
    case "ctr": return fmtVal("pct", r(t.clicks, t.impressions, 100));
    case "linkctr": return fmtVal("pct", r(t.linkClicks, t.impressions, 100));
    case "cpl": return fmtVal("baht", r(t.spend, t.leads));
    case "cpmsg": return fmtVal("baht", r(t.spend, t.messaging));
    case "cppur": return fmtVal("baht", r(t.spend, t.purchases));
    case "roas": return fmtVal("dec", r(t.revenue, t.spend));
    default: return "—";
  }
}
