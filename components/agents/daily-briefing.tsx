"use client";
import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Briefing, BriefingItem, BriefingSeverity } from "@/lib/agents/types";
import { useAccountRanking } from "@/components/account-ranking";

interface Account { id: string; name: string; active?: boolean }

const SEV: Record<BriefingSeverity, { bar: string; chip: string; label: string }> = {
  critical:    { bar: "#ff6b6b", chip: "rgba(255,107,107,0.14)", label: "วิกฤต" },
  warning:     { bar: "#f5b14c", chip: "rgba(245,177,76,0.14)",  label: "เตือน" },
  opportunity: { bar: "#31c48d", chip: "rgba(49,196,141,0.14)",  label: "โอกาส" },
  info:        { bar: "#5b6cff", chip: "rgba(91,108,255,0.14)",  label: "แจ้งเตือน" },
};
const KIND_LABEL: Record<string, string> = {
  wasting: "ใช้งบฟุ่มเฟือย", declining: "ตกต่ำ", underperforming: "ต่ำกว่าเกณฑ์",
  fatigue: "โฆษณาเสื่อมสภาพ", scaling: "ขยายงบที่ดี",
  real_loser: "ผลลัพธ์จริงแย่", hidden_winner: "ดาวเด่นที่ซ่อนอยู่",
};
const PRESETS: [string, string][] = [
  ["today", "วันนี้"], ["yesterday", "เมื่อวาน"], ["last_7d", "7 วันล่าสุด"],
  ["last_14d", "14 วันล่าสุด"], ["last_30d", "30 วันล่าสุด"],
];

const selStyle: React.CSSProperties = {
  background: "#0a0e1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8,
  padding: "6px 10px", color: "#c8d0e0", fontSize: 12.5, outline: "none",
};

function Delta({ delta, upIsGood }: { delta?: number | null; upIsGood?: boolean }) {
  if (delta == null) return null;
  const good = delta === 0 ? null : (delta > 0) === (upIsGood ?? true);
  const color = good == null ? "#4a5a7a" : good ? "#31c48d" : "#ff6b6b";
  return (
    <span style={{ color, fontSize: 11, fontWeight: 600 }} className="font-mono">
      {delta > 0 ? "▲" : delta < 0 ? "▼" : ""} {Math.abs(delta)}%
    </span>
  );
}

export function DailyBriefing() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [hiddenAccts, setHiddenAccts] = useState<string[]>([]);
  const [account, setAccount] = useState<string>("");
  const [preset, setPreset] = useState("last_7d");
  const [data, setData] = useState<Briefing | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<Record<string, "applying" | "done" | string>>({});

  useEffect(() => {
    let hidden: string[] = [];
    try { const h = JSON.parse(localStorage.getItem("adsHiddenAccounts") || "[]"); if (Array.isArray(h)) { hidden = h; setHiddenAccts(h); } } catch {}
    fetch("/api/accounts").then((r) => r.json()).then((list: Account[]) => {
      if (!Array.isArray(list)) return;
      setAccounts(list);
      const pool = list.filter((a) => !hidden.includes(a.id));
      const visible = pool.length ? pool : list;
      const first = visible.find((a) => a.active) || visible[0];
      if (first) setAccount(first.id);
    }).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    if (!account) return;
    setLoading(true); setError(null); setApplied({});
    try {
      const r = await fetch(`/api/agents/briefing?account=${encodeURIComponent(account)}&preset=${preset}`);
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setData(d);
    } catch (e: any) { setError(e.message); setData(null); }
    finally { setLoading(false); }
  }, [account, preset]);

  useEffect(() => { load(); }, [load]);

  async function apply(item: BriefingItem) {
    if (!item.proposal || !data) return;
    setApplied((p) => ({ ...p, [item.id]: "applying" }));
    try {
      const r = await fetch("/api/agents/briefing/apply", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ accountId: data.accountId, tool: item.proposal.tool, args: item.proposal.args, summary: item.proposal.summary }),
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setApplied((p) => ({ ...p, [item.id]: "done" }));
    } catch (e: any) { setApplied((p) => ({ ...p, [item.id]: e.message })); }
  }

  const s = data?.summary;

  const visibleAccounts = hiddenAccts.length === accounts.length ? accounts : accounts.filter((a) => !hiddenAccts.includes(a.id));
  const { sorted: sortedAccounts, tagOf, controls: rankControls, loading: statsLoading } = useAccountRanking(visibleAccounts, hiddenAccts);

  return (
    <div className="min-h-screen" style={{ background: "#050810" }}>
      {/* header */}
      <div className="flex items-center justify-between px-7 py-5 flex-wrap gap-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div>
          <div className="text-[19px] font-bold text-[#e8eaf5]">รายงานประจำวัน</div>
          <div className="text-[12.5px] text-[#3a4a6a]">สิ่งที่ต้องดูแลวันนี้ — เรียงตามความสำคัญ พร้อมแก้ไขด้วยคลิกเดียว</div>
        </div>
        <div className="flex items-center gap-2">
          {rankControls}
          <select value={account} onChange={(e) => setAccount(e.target.value)} style={selStyle}>
            {sortedAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}{tagOf(a.id)}</option>)}
          </select>
          {statsLoading && <span className="text-[11px] text-[#3a4a6a] whitespace-nowrap">กำลังโหลดสถิติ…</span>}
          <select value={preset} onChange={(e) => setPreset(e.target.value)} style={selStyle}>
            {PRESETS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <button onClick={load} disabled={loading}
            className="px-4 py-2 rounded-lg text-[12.5px] font-semibold"
            style={{ background: "linear-gradient(135deg,#5b6cff,#a78bfa)", color: "#fff", opacity: loading ? 0.6 : 1 }}>
            {loading ? "กำลังสแกน..." : "รีเฟรช"}
          </button>
        </div>
      </div>

      <div className="px-7 py-6 max-w-[1100px] mx-auto">
        {/* summary strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          {loading || !s ? (
            [0, 1, 2, 3].map((i) => <div key={i} className="skeleton rounded-xl" style={{ height: 78 }} />)
          ) : (
            <>
              <SummaryCard label="ค่าโฆษณา" value={"฿" + Math.round(s.spend).toLocaleString("en-US")} delta={s.spendDelta} upIsGood={false} />
              <SummaryCard label="ROAS" value={s.roas ? s.roas.toFixed(2) : "—"} delta={s.roasDelta} upIsGood />
              <SummaryCard label="Leads" value={s.leads.toLocaleString("en-US")} />
              <SummaryCard label="Purchases" value={s.purchases.toLocaleString("en-US")} />
            </>
          )}
        </div>

        {/* headline */}
        {!loading && data && (
          <div className="mb-5 px-4 py-3 rounded-xl text-[13.5px] font-medium"
            style={{ background: "rgba(91,108,255,0.08)", border: "1px solid rgba(91,108,255,0.18)", color: "#c8d0e0" }}>
            {data.headline}
            <span className="text-[#3a4a6a] font-normal"> · {data.period.since} → {data.period.until}</span>
          </div>
        )}

        {error && (
          <div className="px-4 py-3 rounded-xl text-[13px]" style={{ background: "rgba(255,107,107,0.1)", border: "1px solid rgba(255,107,107,0.25)", color: "#ff9a9a" }}>
            {error}
          </div>
        )}

        {/* item cards */}
        {loading ? (
          <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton rounded-xl" style={{ height: 120 }} />)}</div>
        ) : data && data.items.length === 0 && !error ? (
          <div className="text-center py-16">
            <div className="text-[15px] font-semibold text-[#31c48d] mb-1">ทุกอย่างปกติ ✓</div>
            <div className="text-[13px] text-[#3a4a6a]">ไม่มีโฆษณาที่ต้องดูแลในช่วงเวลานี้</div>
          </div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence initial={false}>
              {data?.items.map((item) => {
                const sev = SEV[item.severity];
                const st = applied[item.id];
                return (
                  <motion.div key={item.id}
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}
                    className="rounded-xl overflow-hidden flex"
                    style={{ background: "#0a0e1a", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <div style={{ width: 4, background: sev.bar, flexShrink: 0 }} />
                    <div className="flex-1 p-4">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wide" style={{ background: sev.chip, color: sev.bar }}>
                              {KIND_LABEL[item.kind] || item.kind}
                            </span>
                            {item.campaign && <span className="text-[11px] text-[#3a4a6a] truncate">{item.campaign}</span>}
                          </div>
                          <div className="text-[14px] font-semibold text-[#e8eaf5] truncate">{item.entityName}</div>
                          <div className="text-[13px] font-medium mt-0.5" style={{ color: sev.bar }}>{item.headline}</div>
                        </div>
                        {item.proposal && (
                          <button
                            onClick={() => apply(item)}
                            disabled={st === "applying" || st === "done"}
                            className="px-3.5 py-2 rounded-lg text-[12px] font-semibold flex-shrink-0"
                            style={st === "done"
                              ? { background: "rgba(49,196,141,0.15)", color: "#31c48d", border: "1px solid rgba(49,196,141,0.3)" }
                              : { background: item.severity === "opportunity" ? "rgba(49,196,141,0.15)" : "rgba(255,255,255,0.06)", color: item.severity === "opportunity" ? "#31c48d" : "#c8d0e0", border: "1px solid rgba(255,255,255,0.1)" }}>
                            {st === "done" ? "✓ ดำเนินการแล้ว" : st === "applying" ? "กำลังดำเนินการ..." :
                              item.proposal.tool === "set_status" ? "หยุดชั่วคราว" : "เพิ่มงบ +30%"}
                          </button>
                        )}
                      </div>
                      <div className="text-[12.5px] text-[#8a9aba] leading-relaxed mb-3">{item.detail}</div>
                      <div className="flex items-center gap-4 flex-wrap">
                        {item.metrics.map((m, i) => (
                          <div key={i} className="flex items-baseline gap-1.5">
                            <span className="text-[10.5px] uppercase tracking-wide text-[#3a4a6a]">{m.label}</span>
                            <span className="text-[13px] font-semibold text-[#d8deec] font-mono">{m.value}</span>
                            <Delta delta={m.delta} upIsGood={m.upIsGood} />
                          </div>
                        ))}
                      </div>
                      {typeof st === "string" && st !== "applying" && st !== "done" && (
                        <div className="text-[11.5px] mt-2" style={{ color: "#ff9a9a" }}>ล้มเหลว: {st}</div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, delta, upIsGood }: { label: string; value: string; delta?: number | null; upIsGood?: boolean }) {
  return (
    <div className="rounded-xl p-3.5" style={{ background: "#0a0e1a", border: "1px solid rgba(255,255,255,0.07)" }}>
      <div className="text-[10.5px] uppercase tracking-wide text-[#3a4a6a] mb-1.5">{label}</div>
      <div className="flex items-baseline gap-2">
        <span className="text-[20px] font-bold text-[#e8eaf5] font-mono">{value}</span>
        <Delta delta={delta} upIsGood={upIsGood} />
      </div>
    </div>
  );
}
