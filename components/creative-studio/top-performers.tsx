"use client";
import { useEffect, useState } from "react";

// Read-only reference: the account's best existing creatives by ROAS, from
// /api/creative-timeline (getAdTimeline). Per-ad daily points are aggregated here.

type Point = {
  adId: string;
  adName: string;
  thumb: string;
  roas: number;
  spend: number;
  leads: number;
  cpl: number;
  permalink?: string;
};

type AggAd = {
  adId: string;
  adName: string;
  thumb: string;
  spend: number;
  leads: number;
  roas: number;
  cpl: number;
  permalink?: string;
};

function aggregate(points: Point[]): AggAd[] {
  const byAd = new Map<string, { name: string; thumb: string; spend: number; revenue: number; leads: number; permalink?: string }>();
  for (const p of points) {
    const cur = byAd.get(p.adId) ?? { name: p.adName, thumb: p.thumb, spend: 0, revenue: 0, leads: 0, permalink: p.permalink };
    cur.spend += p.spend || 0;
    cur.revenue += (p.roas || 0) * (p.spend || 0); // reconstruct revenue from per-day roas
    cur.leads += p.leads || 0;
    if (!cur.thumb && p.thumb) cur.thumb = p.thumb;
    if (!cur.permalink && p.permalink) cur.permalink = p.permalink;
    byAd.set(p.adId, cur);
  }
  return [...byAd.entries()]
    .map(([adId, a]): AggAd => ({
      adId,
      adName: a.name,
      thumb: a.thumb,
      spend: a.spend,
      leads: a.leads,
      roas: a.spend > 0 ? a.revenue / a.spend : 0,
      cpl: a.leads > 0 ? a.spend / a.leads : 0,
      permalink: a.permalink,
    }))
    .filter((a) => a.spend > 0)
    .sort((a, b) => b.roas - a.roas)
    .slice(0, 6);
}

function fmtBaht(n: number): string {
  return `฿${Math.round(n).toLocaleString("th-TH")}`;
}

export function TopPerformers({ act }: { act: string }) {
  const [ads, setAds] = useState<AggAd[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!act) return;
    setLoading(true);
    setError(null);
    fetch(`/api/creative-timeline?act=${act}&preset=last_30d`)
      .then((r) => r.json())
      .then((d) => {
        if (d?.error) { setError(d.error); setAds([]); return; }
        setAds(aggregate(Array.isArray(d) ? d : []));
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [act]);

  return (
    <div className="rounded-xl p-4" style={{ background: "#0a0e1a", border: "1px solid rgba(255,255,255,0.07)" }}>
      <div className="flex items-center justify-between mb-3">
        <div className="text-[12px] font-semibold text-[#e8eaf5]">Creative ที่ทำผลงานดี</div>
        <div className="text-[10px] text-[#3a4a6a]">30 วันล่าสุด</div>
      </div>

      {loading && <div className="text-[12px] text-[#3a4a6a]">กำลังโหลด…</div>}
      {error && <div className="text-[12px]" style={{ color: "#ff6b6b" }}>{error}</div>}
      {!loading && !error && ads.length === 0 && (
        <div className="text-[12px] text-[#3a4a6a]">ยังไม่มีข้อมูลสำหรับบัญชีนี้</div>
      )}

      <div className="space-y-2">
        {ads.map((a) => (
          <a
            key={a.adId}
            href={a.permalink || undefined}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 rounded-lg p-2 transition-colors"
            style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", cursor: a.permalink ? "pointer" : "default" }}
          >
            <div className="w-11 h-11 rounded-md flex-shrink-0 overflow-hidden bg-[#070b14]">
              {a.thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.thumb} alt="" className="w-full h-full object-cover" />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[12px] text-[#c9d1e0] truncate">{a.adName}</div>
              <div className="text-[11px] text-[#6a7a9a]">
                ROAS <span className="text-[#31c48d] font-semibold">{a.roas.toFixed(2)}x</span>
                {a.leads > 0 && <> · CPL {fmtBaht(a.cpl)}</>}
                {" "}· {fmtBaht(a.spend)}
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
