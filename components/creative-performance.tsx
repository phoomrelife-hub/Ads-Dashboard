"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Flatpickr from "react-flatpickr";
import "flatpickr/dist/flatpickr.min.css";
import { baht, num, dec } from "@/lib/columns";
import type { CreativePoint } from "@/lib/fb";

type Acct = { id: string; name: string; active: boolean };

const DATE_PRESETS = [
  ["today", "วันนี้"], ["yesterday", "เมื่อวาน"], ["last_7d", "7 วันล่าสุด"],
  ["last_30d", "30 วันล่าสุด"], ["this_month", "เดือนนี้"], ["custom", "กำหนดเอง"],
];

const Y_OPTS = [
  { k: "roas",      label: "ROAS",      fmt: (v: number) => dec(v, 2) + "x" },
  { k: "cpl",       label: "CPL",       fmt: (v: number) => baht(v) },
  { k: "spend",     label: "ใช้จ่าย",  fmt: (v: number) => baht(v) },
  { k: "leads",     label: "Leads",     fmt: (v: number) => num(v) },
];

const X_OPTS = [
  { k: "date",      label: "วันที่",    fmt: (_: number) => "" },
  { k: "spend",     label: "ใช้จ่าย",  fmt: (v: number) => v >= 1000 ? (v / 1000).toFixed(1) + "k" : String(Math.round(v)) },
  { k: "leads",     label: "Leads",     fmt: (v: number) => num(v) },
  { k: "purchases", label: "Purchases", fmt: (v: number) => num(v) },
  { k: "roas",      label: "ROAS",      fmt: (v: number) => dec(v, 2) + "x" },
];

/* chart logical units */
const VW = 1100; const VH = 720;
const P = { t: 96, r: 52, b: 72, l: 80 };
const CW = VW - P.l - P.r;
const CH = VH - P.t - P.b;
const CR = 22;

function roasColor(v: number) {
  if (v >= 3)   return "#31c48d";
  if (v >= 1.5) return "#f5b14c";
  if (v > 0)    return "#ff6b6b";
  return "#3a4654";
}

/* ── small icon helpers ── */
function IcoChevron({ size = 10 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M2 4l3 3 3-3"/></svg>;
}
function IcoClose() {
  return <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M2 2l8 8M10 2L2 10"/></svg>;
}
function IcoFacebook() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073C24 5.404 18.629 0 12 0S0 5.404 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.413c0-3.025 1.791-4.697 4.533-4.697 1.312 0 2.686.235 2.686.235v2.97h-1.513c-1.491 0-1.956.932-1.956 1.888v2.264h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/></svg>;
}
function IcoRefreshSpin({ spinning }: { spinning?: boolean }) {
  return (
    <motion.span className="inline-flex" animate={spinning ? { rotate: 360 } : { rotate: 0 }}
      transition={spinning ? { repeat: Infinity, duration: 0.75, ease: "linear" } : { duration: 0 }}>
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11.5 2A5.5 5.5 0 1 1 2 6.5"/><path d="M11.5 2V5M11.5 2H8.5"/>
      </svg>
    </motion.span>
  );
}

/* ── compact overlay select ── */
function OverlaySelect({ label, value, onChange, children }: {
  label?: string; value: string; onChange: (v: string) => void; children: React.ReactNode;
}) {
  return (
    <div className="relative inline-flex items-center">
      <select value={value} onChange={e => onChange(e.target.value)}
        className="appearance-none pl-2.5 pr-6 py-1.5 text-[11px] font-medium rounded-lg cursor-pointer outline-none transition-colors"
        style={{ background: "rgba(6,10,18,0.82)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.1)", color: "#c9d1e0" }}>
        {children}
      </select>
      <div className="absolute right-2 pointer-events-none text-[#4a5a7a]"><IcoChevron /></div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════ */

export function CreativePerformance() {
  const [accounts,    setAccounts]    = useState<Acct[]>([]);
  const [hiddenAccts, setHiddenAccts] = useState<string[]>([]);
  const [acctId,      setAcctId]      = useState("");
  const [acctName,    setAcctName]    = useState("");
  const [acctOpen,    setAcctOpen]    = useState(false);
  const [acctQuery,   setAcctQuery]   = useState("");
  const [datePreset,  setDatePreset]  = useState("last_7d");
  const [since,       setSince]       = useState("");
  const [until,       setUntil]       = useState("");
  const [statusFilter,setStatusFilter]= useState("ALL");
  const [yMetric,     setYMetric]     = useState("roas");
  const [xMetric,     setXMetric]     = useState("date");
  const [points,      setPoints]      = useState<CreativePoint[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [refreshing,  setRefreshing]  = useState(false);
  const [error,       setError]       = useState("");
  const [selected,    setSelected]    = useState<CreativePoint | null>(null);
  const [roasMin,     setRoasMin]     = useState(0);
  const [roasMax,     setRoasMax]     = useState(20);
  const [roasOpen,    setRoasOpen]    = useState(false);
  const comboRef  = useRef<HTMLDivElement>(null);
  const roasRef   = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let hidden: string[] = [];
    try { const h = JSON.parse(localStorage.getItem("adsHiddenAccounts") || "[]"); if (Array.isArray(h)) { hidden = h; setHiddenAccts(h); } } catch {}
    fetch("/api/accounts").then(r => r.json()).then((a: Acct[] | { error: string }) => {
      if (Array.isArray(a) && a.length) {
        setAccounts(a);
        // default to the first non-hidden account (fall back to all if every account is hidden)
        const visible = a.filter(x => !hidden.includes(x.id));
        const first = (visible.length ? visible : a)[0];
        setAcctId(first.id); setAcctName(first.name);
      }
    });
  }, []);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (comboRef.current && !comboRef.current.contains(e.target as Node)) setAcctOpen(false);
      if (roasRef.current  && !roasRef.current.contains(e.target as Node))  setRoasOpen(false);
    };
    document.addEventListener("click", h); return () => document.removeEventListener("click", h);
  }, []);

  const load = useCallback(async () => {
    if (!acctId) return;
    if (datePreset === "custom" && (!since || !until)) return;
    setLoading(true); setRefreshing(true); setError(""); setSelected(null);
    try {
      const range = since && until ? `&since=${since}&until=${until}` : "";
      const d = await fetch(`/api/creative-timeline?act=${acctId}&preset=${datePreset}${range}`).then(r => r.json());
      if (d.error) throw new Error(d.error);
      setPoints(Array.isArray(d) ? d : []);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, [acctId, datePreset, since, until]);

  useEffect(() => { load(); }, [load]);

  const ROAS_MAX_CAP = 20; // slider ceiling
  const roasActive = roasMin > 0 || roasMax < ROAS_MAX_CAP;

  const filtered = useMemo(() => {
    let pts = statusFilter === "ALL" ? points : points.filter(p => p.status === statusFilter);
    if (roasMin > 0)              pts = pts.filter(p => (p.roas || 0) >= roasMin);
    if (roasMax < ROAS_MAX_CAP)   pts = pts.filter(p => (p.roas || 0) <= roasMax);
    return pts;
  }, [points, statusFilter, roasMin, roasMax]);

  const visibleAccts = hiddenAccts.length === accounts.length ? accounts : accounts.filter(a => !hiddenAccts.includes(a.id));
  const filteredAccts = visibleAccts.filter(a => a.name.toLowerCase().includes(acctQuery.toLowerCase()));
  const yInfo = Y_OPTS.find(o => o.k === yMetric)!;
  const xInfo = X_OPTS.find(o => o.k === xMetric)!;

  /* shared style for overlay controls */
  const ovCtrl = {
    background: "rgba(6,10,18,0.82)",
    backdropFilter: "blur(8px)",
    border: "1px solid rgba(255,255,255,0.1)",
  } as React.CSSProperties;

  /* ── Summary stats ── */
  const summary = useMemo(() => {
    const uniqueAds = new Set(filtered.map(p => p.adId)).size;
    const totalSpend = filtered.reduce((s, p) => s + p.spend, 0);
    const totalClicks = filtered.reduce((s, p) => s + p.clicks, 0);
    const totalImpressions = filtered.reduce((s, p) => s + p.impressions, 0);
    const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
    const totalPurchases = filtered.reduce((s, p) => s + p.purchases, 0);
    const avgCpa = totalPurchases > 0 ? totalSpend / totalPurchases : 0;

    // Aggregate per ad for top/loser
    const adAgg = new Map<string, { adId: string; adName: string; thumb: string; spend: number; revenue: number }>();
    for (const p of filtered) {
      const a = adAgg.get(p.adId);
      if (a) { a.spend += p.spend; a.revenue += p.roas * p.spend; }
      else adAgg.set(p.adId, { adId: p.adId, adName: p.adName, thumb: p.thumb, spend: p.spend, revenue: p.roas * p.spend });
    }
    const qualified = [...adAgg.values()]
      .filter(a => a.spend >= 50)
      .map(a => ({ ...a, roas: a.spend > 0 ? a.revenue / a.spend : 0 }));
    const topAds   = [...qualified].sort((a, b) => b.roas - a.roas).slice(0, 3);
    const loserAds = [...qualified].sort((a, b) => a.roas - b.roas).slice(0, 3);

    return { uniqueAds, totalSpend, avgCtr, avgCpa, topAds, loserAds };
  }, [filtered]);

  /* creative row — used in Top3/Loser3 */
  const CreativeRow = ({ ad, rank, accent }: { ad: { adId: string; adName: string; thumb: string; spend: number; roas: number } | null; rank: number; accent: string }) => (
    <div className="flex items-center gap-3 px-3 py-3 rounded-2xl transition-colors duration-150"
      style={{ cursor: ad ? "pointer" : "default" }}
      onMouseEnter={e => { if (ad) e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
      {/* rank badge */}
      <div className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 text-[13px] font-bold metric-value"
        style={{ background: `${accent}18`, color: accent, border: `1px solid ${accent}30` }}>{rank}</div>
      {ad ? (
        <>
          <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0" style={{ border: `1px solid ${accent}25`, background: "#070c17" }}>
            {ad.thumb
              ? <img src={ad.thumb} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center text-[11px] font-bold" style={{ color: "#3d4f6a" }}>{ad.adName.slice(0, 2).toUpperCase()}</div>}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold truncate leading-snug" style={{ color: "#c9d1e0" }}>{ad.adName}</p>
            <p className="text-[11px] mt-0.5 font-data" style={{ color: "#3d4f6a" }}>{baht(ad.spend)}</p>
          </div>
          <div className="flex-shrink-0 text-right">
            <p className="metric-value text-[18px] font-bold leading-none" style={{ color: accent }}>{dec(ad.roas, 2)}x</p>
            <p className="text-[9px] uppercase tracking-wider mt-1" style={{ color: `${accent}70` }}>ROAS</p>
          </div>
        </>
      ) : loading ? (
        <><div className="w-12 h-12 rounded-xl skeleton flex-shrink-0" /><div className="flex-1 space-y-2"><div className="h-3.5 w-3/4 rounded skeleton" /><div className="h-3 w-1/3 rounded skeleton" /></div></>
      ) : (
        <span className="text-[12px]" style={{ color: "#2a3a50" }}>—</span>
      )}
    </div>
  );

  return (
    <div style={{ background: "#060a12", minHeight: "100vh", display: "flex", flexDirection: "column" }}>

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-5 py-2.5 flex-shrink-0"
        style={{ background: "rgba(6,10,18,0.95)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-[#f5b14c]" style={{ boxShadow: "0 0 8px 2px rgba(245,177,76,0.5)" }} />
          <span className="font-semibold text-[13px] text-[#e8eaf5] tracking-[-0.01em]">ประสิทธิภาพ Creative</span>
        </div>

        {/* Controls row — in topbar */}
        <div className="flex items-center gap-1.5">
          {/* Account */}
          <div ref={comboRef} className="relative">
            <button onClick={() => { setAcctQuery(""); setAcctOpen(o => !o); }}
              className="flex items-center gap-1.5 pl-2.5 pr-2 py-1.5 rounded-lg text-[11px] font-medium cursor-pointer"
              style={ovCtrl}>
              <span className="max-w-[110px] truncate text-[#c9d1e0]">{acctName || "บัญชี"}</span>
              <IcoChevron />
            </button>
            <AnimatePresence>
              {acctOpen && (
                <motion.div initial={{ opacity: 0, y: -6, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.96 }}
                  transition={{ duration: 0.13 }}
                  className="absolute top-[calc(100%+6px)] left-0 w-[230px] max-h-60 overflow-y-auto rounded-xl z-50 shadow-[0_16px_40px_rgba(0,0,0,0.7)]"
                  style={{ background: "#0c1220", border: "1px solid rgba(255,255,255,0.1)" }}>
                  <div className="p-2 border-b border-white/[0.06]">
                    <input value={acctQuery} onChange={e => setAcctQuery(e.target.value)} placeholder="ค้นหา..."
                      className="w-full bg-transparent text-[12px] outline-none text-[#c9d1e0] placeholder:text-[#2a3a50]" autoFocus />
                  </div>
                  {filteredAccts.length ? filteredAccts.map(a => (
                    <div key={a.id} onClick={() => { setAcctId(a.id); setAcctName(a.name); setAcctOpen(false); }}
                      className="px-3 py-2 cursor-pointer text-[12px] truncate transition-colors"
                      style={{ color: a.id === acctId ? "#fff" : "#8a9aba", background: a.id === acctId ? "#2d88ff" : "transparent" }}
                      onMouseEnter={e => { if (a.id !== acctId) e.currentTarget.style.background = "rgba(45,136,255,0.1)"; }}
                      onMouseLeave={e => { if (a.id !== acctId) e.currentTarget.style.background = "transparent"; }}>
                      {a.name}
                    </div>
                  )) : <div className="px-3 py-2 text-[#2a3a50] text-[12px]">ไม่พบบัญชี</div>}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Date preset */}
          <OverlaySelect value={datePreset} onChange={v => { setDatePreset(v); if (v !== "custom") { setSince(""); setUntil(""); } }}>
            {DATE_PRESETS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </OverlaySelect>

          {/* Custom date range */}
          <AnimatePresence>
            {datePreset === "custom" && (
              <motion.div initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: "auto" }} exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.15 }} className="overflow-hidden">
                <Flatpickr options={{ mode: "range", dateFormat: "j M Y", maxDate: "today" }} placeholder="เลือกช่วงเวลา..."
                  className="pl-2.5 pr-2.5 py-1.5 text-[11px] font-medium rounded-lg cursor-pointer outline-none min-w-[150px] text-[#c9d1e0]"
                  style={ovCtrl}
                  onChange={dates => { if (dates.length === 2) { const iso = (d: Date) => d.toISOString().slice(0, 10); setSince(iso(dates[0])); setUntil(iso(dates[1])); } }} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Status */}
          <OverlaySelect value={statusFilter} onChange={setStatusFilter}>
            <option value="ALL">ทุกสถานะ</option>
            <option value="ACTIVE">ใช้งานอยู่</option>
            <option value="PAUSED">ปิดอยู่</option>
          </OverlaySelect>

          {/* ROAS filter */}
          <div ref={roasRef} className="relative">
            <button onClick={() => setRoasOpen(o => !o)}
              className="flex items-center gap-1.5 pl-2.5 pr-2 py-1.5 rounded-lg text-[11px] font-medium cursor-pointer"
              style={{
                background: roasActive ? "rgba(45,136,255,0.18)" : "rgba(6,10,18,0.82)",
                backdropFilter: "blur(8px)",
                border: `1px solid ${roasActive ? "rgba(45,136,255,0.45)" : "rgba(255,255,255,0.1)"}`,
                color: roasActive ? "#2d88ff" : "#c9d1e0",
              }}>
              <span className="font-data">
                {roasActive ? `ROAS ${roasMin}x–${roasMax < 20 ? roasMax + "x" : "∞"}` : "ROAS"}
              </span>
              <IcoChevron />
            </button>
            <AnimatePresence>
              {roasOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.96 }} transition={{ duration: 0.14 }}
                  className="absolute top-[calc(100%+8px)] right-0 z-50 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.7)] p-4"
                  style={{ width: "240px", background: "#0c1220", border: "1px solid rgba(255,255,255,0.1)" }}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[11px] font-semibold text-[#c9d1e0]">ช่วง ROAS</span>
                    {roasActive && (
                      <button onClick={() => { setRoasMin(0); setRoasMax(20); }}
                        className="text-[10px] text-[#2d88ff] cursor-pointer">ล้าง</button>
                    )}
                  </div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-data text-[13px] font-bold text-[#2d88ff]">{roasMin}x</span>
                    <div className="h-px flex-1 mx-3" style={{ background: "rgba(45,136,255,0.3)" }} />
                    <span className="font-data text-[13px] font-bold text-[#2d88ff]">{roasMax < 20 ? roasMax + "x" : "∞"}</span>
                  </div>
                  <div className="relative h-5 mb-4 roas-range">
                    <div className="absolute top-1/2 -translate-y-1/2 w-full h-[4px] rounded-full" style={{ background: "rgba(255,255,255,0.07)" }} />
                    <div className="absolute top-1/2 -translate-y-1/2 h-[4px] rounded-full"
                      style={{ background: "linear-gradient(90deg, #2d88ff, #31c48d)", left: `${(roasMin / 20) * 100}%`, right: `${((20 - roasMax) / 20) * 100}%` }} />
                    <input type="range" min={0} max={20} step={0.5} value={roasMin}
                      style={{ zIndex: roasMin >= roasMax - 0.5 ? 5 : 3 }}
                      onChange={e => setRoasMin(Math.min(Number(e.target.value), roasMax - 0.5))} />
                    <input type="range" min={0} max={20} step={0.5} value={roasMax}
                      style={{ zIndex: 4 }}
                      onChange={e => setRoasMax(Math.max(Number(e.target.value), roasMin + 0.5))} />
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[["< 1x", 0, 1], ["1x–3x", 1, 3], ["≥ 3x", 3, 20]].map(([label, lo, hi]) => {
                      const active = roasMin === lo && roasMax === hi;
                      return (
                        <button key={label as string} onClick={() => { setRoasMin(lo as number); setRoasMax(hi as number); }}
                          className="rounded-lg py-1.5 text-[11px] font-semibold cursor-pointer"
                          style={{
                            background: active ? "rgba(45,136,255,0.2)" : "rgba(255,255,255,0.04)",
                            border: `1px solid ${active ? "rgba(45,136,255,0.4)" : "rgba(255,255,255,0.06)"}`,
                            color: active ? "#2d88ff" : "#4a5a7a",
                          }}>
                          {label as string}
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="w-px h-4 mx-0.5" style={{ background: "rgba(255,255,255,0.08)" }} />

          <button onClick={load} disabled={refreshing}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold text-white cursor-pointer disabled:opacity-60"
            style={{ background: "linear-gradient(135deg, #2d88ff, #1a6fd8)", border: "1px solid rgba(45,136,255,0.4)" }}>
            <IcoRefreshSpin spinning={refreshing} />
            รีเฟรช
          </button>
        </div>
      </div>

      {/* ── Body: scrollable vertical stack ── */}
      <div className="flex-1 overflow-y-auto">

        {/* ── Row 1: Stats strip ── */}
        <div className="flex gap-4 px-6 py-6"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          {[
            { label: "Creatives",  value: loading ? null : String(summary.uniqueAds),                                  sub: `${filtered.length} วัน-โฆษณา`,  color: "#c9d1e0", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M9 21V9"/></svg> },
            { label: "ใช้จ่ายรวม", value: loading ? null : baht(summary.totalSpend),                                   sub: "ในช่วงที่เลือก",            color: "#2d88ff", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> },
            { label: "CTR เฉลี่ย", value: loading ? null : (summary.avgCtr > 0 ? dec(summary.avgCtr, 2) + "%" : "—"), sub: "ค่าเฉลี่ยถ่วงน้ำหนัก",                  color: "#f5b14c", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 3l18 18M10.5 10.677A2 2 0 1 0 13.322 13.5"/><path d="M7.362 7.561C5.68 8.74 4.279 10.42 3.5 12c1.188 2.419 3.373 4.587 5.896 5.53A9.08 9.08 0 0 0 12 18c.855 0 1.72-.12 2.573-.36M20.5 12c-.52-1.02-1.25-2.06-2.13-2.98"/></svg> },
            { label: "CPA เฉลี่ย", value: loading ? null : (summary.avgCpa > 0 ? baht(summary.avgCpa) : "—"),         sub: "ค่าโฆษณา ÷ ยอดซื้อ",             color: "#31c48d", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" x2="21" y1="6" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg> },
          ].map(s => (
            <div key={s.label} className="flex-1 rounded-2xl overflow-hidden"
              style={{ background: "#0c1220", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ height: "2px", background: s.color, opacity: 0.7 }} />
              <div className="px-5 py-5">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-[10px] uppercase tracking-[0.13em] font-semibold" style={{ color: "#4a5a7a" }}>{s.label}</p>
                  <div style={{ color: `${s.color}55` }}>{s.icon}</div>
                </div>
                {s.value === null ? (
                  <div className="space-y-2">
                    <div className="h-8 w-3/4 rounded-lg skeleton" />
                    <div className="h-3 w-1/2 rounded skeleton" />
                  </div>
                ) : (
                  <>
                    <p className="metric-value text-[30px] font-bold leading-none" style={{ color: s.color }}>{s.value}</p>
                    <p className="text-[11px] mt-2.5" style={{ color: "#3d4f6a" }}>{s.sub}</p>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* ── Row 2: Top 3 Performers + Top 3 Losers ── */}
        <div className="grid grid-cols-2 gap-4 px-6 py-6"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>

          {/* Top 3 Performers */}
          <div className="rounded-2xl overflow-hidden"
            style={{ background: "#0c1220", border: "1px solid rgba(49,196,141,0.15)" }}>
            <div style={{ height: "2px", background: "linear-gradient(90deg, #31c48d, transparent)" }} />
            <div className="px-5 pt-5 pb-4">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#31c48d]" style={{ boxShadow: "0 0 6px rgba(49,196,141,0.7)" }} />
                  <span className="text-[11px] uppercase tracking-[0.15em] font-semibold" style={{ color: "#31c48d" }}>ผู้นำ</span>
                </div>
                <span className="text-[10px] font-data" style={{ color: "#2a3a50" }}>ตาม ROAS</span>
              </div>
              <div className="space-y-1">
                {[0, 1, 2].map(i => (
                  <CreativeRow key={i} ad={summary.topAds[i] ?? null} rank={i + 1} accent="#31c48d" />
                ))}
              </div>
            </div>
          </div>

          {/* Top 3 Losers */}
          <div className="rounded-2xl overflow-hidden"
            style={{ background: "#0c1220", border: "1px solid rgba(255,107,107,0.15)" }}>
            <div style={{ height: "2px", background: "linear-gradient(90deg, #ff6b6b, transparent)" }} />
            <div className="px-5 pt-5 pb-4">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#ff6b6b]" style={{ boxShadow: "0 0 6px rgba(255,107,107,0.7)" }} />
                  <span className="text-[11px] uppercase tracking-[0.15em] font-semibold" style={{ color: "#ff6b6b" }}>ต่ำกว่าเกณฑ์</span>
                </div>
                <span className="text-[10px] font-data" style={{ color: "#2a3a50" }}>ตาม ROAS</span>
              </div>
              <div className="space-y-1">
                {[0, 1, 2].map(i => (
                  <CreativeRow key={i} ad={summary.loserAds[i] ?? null} rank={i + 1} accent="#ff6b6b" />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Row 3: Scatter (left) + Detail panel (right) ── */}

        {/* Scatter header: title, axis pickers, legend */}
        <div className="flex items-center gap-3 px-6 py-3 flex-shrink-0"
          style={{ borderTop: "1px solid rgba(255,255,255,0.05)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          <span className="text-[11px] uppercase tracking-[0.14em] font-semibold" style={{ color: "#3d4f6a" }}>กราฟ Creative</span>
          <span className="text-[10px] rounded px-1.5 py-0.5 font-data" style={{ background: "rgba(255,255,255,0.04)", color: "#2a3a50" }}>{filtered.length} จุด</span>

          <div className="flex items-center gap-2 ml-2">
            {[
              { axis: "X", opts: X_OPTS, active: xMetric, set: setXMetric, activeColor: "#f5b14c" },
              { axis: "Y", opts: Y_OPTS, active: yMetric, set: setYMetric, activeColor: "#2d88ff" },
            ].map(({ axis, opts, active, set, activeColor }) => (
              <div key={axis} className="flex items-center gap-0.5 rounded-xl px-1.5 py-1"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 select-none" style={{ color: "#2a3a50" }}>{axis}</span>
                {opts.map(o => (
                  <button key={o.k} onClick={() => set(o.k)}
                    className="px-2.5 py-1 rounded-lg text-[10px] font-semibold cursor-pointer transition-colors duration-150"
                    style={{
                      background: active === o.k ? activeColor : "transparent",
                      color: active === o.k ? (activeColor === "#f5b14c" ? "#060a12" : "#fff") : "#3d4f6a",
                    }}>
                    {o.label}
                  </button>
                ))}
              </div>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-3">
            {[["#31c48d", "ใช้งานอยู่"], ["#3a4654", "ปิดอยู่"], ["#2d88ff", "เลือกอยู่"]].map(([c, l]) => (
              <div key={l} className="flex items-center gap-1.5 text-[10px]" style={{ color: "#4a5a7a" }}>
                <div className="w-2 h-2 rounded-full border-[1.5px]" style={{ borderColor: c }} />
                {l}
              </div>
            ))}
          </div>
        </div>

        <div className="flex" style={{ height: "440px" }}>

          {/* Scatter — left half */}
          <div className="relative overflow-hidden" style={{ width: "50%", borderRight: "1px solid rgba(255,255,255,0.04)" }}>

            {loading ? (
              <div className="w-full h-full flex flex-col items-center justify-center gap-3" style={{ color: "#3d4f6a" }}>
                <div className="w-6 h-6 rounded-full border-2 border-[#2d88ff] border-t-transparent animate-spin" />
                <span className="text-[12px]">กำลังดึงข้อมูล...</span>
              </div>
            ) : error ? (
              <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                <p className="text-[12px] font-semibold" style={{ color: "#ff6b6b" }}>{error}</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="w-full h-full flex flex-col items-center justify-center gap-2" style={{ color: "#3d4f6a" }}>
                <span className="text-[12px]">ไม่มีข้อมูล Creative</span>
              </div>
            ) : (
              <ScatterChart
                points={filtered}
                xMetric={xMetric}
                xInfo={xInfo}
                yMetric={yMetric}
                yInfo={yInfo}
                selectedKey={selected ? selected.adId + selected.date : null}
                onSelect={setSelected}
              />
            )}
          </div>

          {/* Detail panel — right half (always visible) */}
          <div className="relative overflow-hidden" style={{ width: "50%", background: "#070c17" }}>
            <AnimatePresence mode="wait">
              {selected ? (
                <motion.div key="panel" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  transition={{ duration: 0.18, ease: "easeOut" }} className="absolute inset-0 overflow-y-auto">
                  <SidePanel point={selected} yInfo={yInfo} onClose={() => setSelected(null)} />
                </motion.div>
              ) : (
                <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                    style={{ background: "rgba(45,136,255,0.05)", border: "1px solid rgba(45,136,255,0.12)" }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2d88ff" strokeWidth="1.2" strokeLinecap="round" opacity="0.4">
                      <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                    </svg>
                  </div>
                  <div className="text-center">
                    <p className="text-[13px] font-semibold" style={{ color: "#3d4f6a" }}>เลือก Creative</p>
                    <p className="text-[11px] mt-1" style={{ color: "#2a3a50" }}>คลิกที่จุดในกราฟด้านซ้าย</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

        </div>{/* end flex row */}
      </div>{/* end body scroll */}
    </div>
  );
}

/* ─────────────────── Scatter Chart ─────────────────── */
function ScatterChart({ points, xMetric, xInfo, yMetric, yInfo, selectedKey, onSelect }: {
  points: CreativePoint[];
  xMetric: string;
  xInfo: { k: string; label: string; fmt: (v: number) => string };
  yMetric: string;
  yInfo: { k: string; label: string; fmt: (v: number) => string };
  selectedKey: string | null;
  onSelect: (pt: CreativePoint | null) => void;
}) {
  const [hovered, setHovered] = useState<string | null>(null);

  /* ── Y axis ── */
  const yValues = useMemo(() => points.map(p => (p as any)[yMetric] as number), [points, yMetric]);
  const yMaxRaw = useMemo(() => Math.max(0.1, ...yValues), [yValues]);
  const yMax = useMemo(() => {
    if (yMetric === "roas")  return Math.max(5, Math.ceil(yMaxRaw) + 1);
    if (yMetric === "leads") return Math.max(10, Math.ceil(yMaxRaw / 5) * 5 + 5);
    return Math.max(100, Math.ceil(yMaxRaw / 100) * 100 + 100);
  }, [yMaxRaw, yMetric]);

  const yTicks = useMemo(() => {
    if (yMetric === "roas") { const t = []; for (let i = 0; i <= yMax; i++) t.push(i); return t; }
    const step = yMax / 5;
    const t = []; for (let i = 0; i <= yMax; i += step) t.push(Math.round(i)); return t;
  }, [yMax, yMetric]);

  const yOf = useCallback((val: number) => P.t + CH - (val / yMax) * CH, [yMax]);

  /* ── X axis: date mode ── */
  const dates = useMemo(() => [...new Set(points.map(p => p.date))].sort(), [points]);
  const xTickEvery = Math.max(1, Math.ceil(dates.length / 10));

  /* ── X axis: numeric mode ── */
  const xValues = useMemo(() =>
    xMetric === "date" ? [] : points.map(p => (p as any)[xMetric] as number),
  [points, xMetric]);
  const xMaxRaw = useMemo(() => Math.max(0.1, ...xValues), [xValues]);
  const xMax = useMemo(() => {
    if (xMetric === "date") return 0;
    if (xMetric === "roas")  return Math.max(5, Math.ceil(xMaxRaw) + 1);
    if (xMetric === "leads" || xMetric === "purchases") return Math.max(10, Math.ceil(xMaxRaw / 5) * 5 + 5);
    return Math.max(100, Math.ceil(xMaxRaw / 100) * 100 + 100);
  }, [xMaxRaw, xMetric]);

  const NUM_X_TICKS = 6;
  const xNumTicks = useMemo(() => {
    if (xMetric === "date") return [];
    const step = xMax / (NUM_X_TICKS - 1);
    return Array.from({ length: NUM_X_TICKS }, (_, i) => Math.round(i * step));
  }, [xMax, xMetric]);

  /* ── xOf: unified ── */
  const xOf = useCallback((p: CreativePoint): number => {
    if (xMetric === "date") {
      const i = dates.indexOf(p.date);
      if (dates.length <= 1) return P.l + CW / 2;
      return P.l + (i / (dates.length - 1)) * CW;
    }
    const v = (p as any)[xMetric] as number || 0;
    return P.l + (v / xMax) * CW;
  }, [xMetric, dates, xMax]);

  const pts = useMemo(() => points.map(p => ({
    ...p,
    x: xOf(p),
    y: yOf((p as any)[yMetric] as number),
    key: p.adId + p.date,
    xVal: xMetric === "date" ? 0 : (p as any)[xMetric] as number || 0,
    yVal: (p as any)[yMetric] as number || 0,
  })), [points, xOf, yOf, xMetric, yMetric]);

  const hoveredPt = useMemo(() => pts.find(p => p.key === hovered) ?? null, [pts, hovered]);

  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} className="w-full h-full" style={{ display: "block" }}
      preserveAspectRatio="xMidYMid meet">
      <defs>
        {pts.map(p => (
          <clipPath key={p.key} id={`cp-${p.key}`}>
            <circle cx={p.x} cy={p.y} r={CR - 2} />
          </clipPath>
        ))}
      </defs>

      {/* Y grid + labels */}
      {yTicks.map(tick => {
        const yy = yOf(tick);
        const lbl = yInfo.fmt(tick) || (tick >= 1000 ? (tick / 1000) + "k" : String(tick));
        return (
          <g key={tick}>
            <line x1={P.l} y1={yy} x2={VW - P.r} y2={yy} stroke="rgba(255,255,255,0.04)" strokeWidth={1} strokeDasharray="4 6" />
            <text x={P.l - 10} y={yy} textAnchor="end" dominantBaseline="middle" fill="#2a3a50" fontSize={11} fontFamily="'Fira Code', monospace">{lbl}</text>
          </g>
        );
      })}

      {/* X grid lines (numeric mode) */}
      {xMetric !== "date" && xNumTicks.map(tick => {
        const xx = P.l + (tick / xMax) * CW;
        return <line key={tick} x1={xx} y1={P.t} x2={xx} y2={VH - P.b} stroke="rgba(255,255,255,0.03)" strokeWidth={1} strokeDasharray="4 6" />;
      })}

      {/* X column lines (date mode) — one subtle line per date */}
      {xMetric === "date" && dates.map((date, i) => {
        const xx = P.l + (dates.length <= 1 ? CW / 2 : (i / (dates.length - 1)) * CW);
        return <line key={date} x1={xx} y1={P.t} x2={xx} y2={VH - P.b} stroke="rgba(255,255,255,0.025)" strokeWidth={1} strokeDasharray="2 10" />;
      })}

      {/* X labels */}
      {xMetric === "date"
        ? dates.map((date, i) => {
            if (i % xTickEvery !== 0 && i !== dates.length - 1) return null;
            const xx = P.l + (dates.length <= 1 ? CW / 2 : (i / (dates.length - 1)) * CW);
            return (
              <text key={date} x={xx} y={VH - P.b + 22} textAnchor="middle" fill="#2a3a50" fontSize={10} fontFamily="'Fira Code', monospace">
                {date.slice(8)}/{date.slice(5, 7)}
              </text>
            );
          })
        : xNumTicks.map(tick => {
            const xx = P.l + (tick / xMax) * CW;
            return (
              <text key={tick} x={xx} y={VH - P.b + 22} textAnchor="middle" fill="#2a3a50" fontSize={10} fontFamily="'Fira Code', monospace">
                {xInfo.fmt(tick) || String(tick)}
              </text>
            );
          })
      }

      {/* Date crosshair on hover — amber line + date badge above chart */}
      {xMetric === "date" && hoveredPt && (
        <g>
          <line x1={hoveredPt.x} y1={P.t - 6} x2={hoveredPt.x} y2={VH - P.b}
            stroke="rgba(245,177,76,0.45)" strokeWidth={1.5} strokeDasharray="4 5" />
          <rect x={hoveredPt.x - 26} y={P.t - 24} width={52} height={18} rx={5}
            fill="#f5b14c" />
          <text x={hoveredPt.x} y={P.t - 12} textAnchor="middle"
            fill="#050812" fontSize={10} fontWeight="700" fontFamily="'Fira Code', monospace">
            {hoveredPt.date.slice(8)}/{hoveredPt.date.slice(5, 7)}
          </text>
        </g>
      )}

      {/* Axis lines */}
      <line x1={P.l} y1={P.t} x2={P.l} y2={VH - P.b} stroke="rgba(255,255,255,0.06)" strokeWidth={1.5} />
      <line x1={P.l} y1={VH - P.b} x2={VW - P.r} y2={VH - P.b} stroke="rgba(255,255,255,0.06)" strokeWidth={1.5} />

      {/* Axis titles */}
      <text x={22} y={P.t + CH / 2} textAnchor="middle" dominantBaseline="middle" fill="#2a3a50" fontSize={11}
        transform={`rotate(-90,22,${P.t + CH / 2})`}>{yInfo.label}</text>
      <text x={P.l + CW / 2} y={VH - 10} textAnchor="middle" fill="#2a3a50" fontSize={11}>{xInfo.label}</text>

      {/* data points */}
      {pts.map(p => {
        const isSel    = selectedKey === p.key;
        const isHov    = hovered === p.key;
        const isActive = p.status === "ACTIVE";
        const dim      = selectedKey && !isSel && !isHov ? 0.22 : 1;
        const tooltipW = 180;
        const tooltipX = p.x + CR + 14 + tooltipW > VW - P.r ? p.x - CR - 14 - tooltipW : p.x + CR + 14;

        return (
          <g key={p.key} style={{ cursor: "pointer", opacity: dim, transition: "opacity 0.2s" }}
            onClick={() => onSelect(isSel ? null : p)}
            onMouseEnter={() => setHovered(p.key)}
            onMouseLeave={() => setHovered(null)}>

            {/* outer glow ring when selected */}
            {isSel && (
              <>
                <circle cx={p.x} cy={p.y} r={CR + 14} fill="rgba(45,136,255,0.06)" />
                <circle cx={p.x} cy={p.y} r={CR + 8} fill="none" stroke="#2d88ff" strokeWidth={1} opacity={0.4} strokeDasharray="3 4" />
              </>
            )}
            {/* hover ring */}
            {isHov && !isSel && <circle cx={p.x} cy={p.y} r={CR + 6} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={1.5} />}

            {/* bg fill */}
            <circle cx={p.x} cy={p.y} r={CR} fill="#0c1220" />

            {/* thumbnail */}
            {p.thumb
              ? <image href={p.thumb} x={p.x - CR + 2} y={p.y - CR + 2} width={(CR - 2) * 2} height={(CR - 2) * 2}
                  clipPath={`url(#cp-${p.key})`} preserveAspectRatio="xMidYMid slice" />
              : <text x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle" fill="#2a3a50" fontSize={10} fontWeight="bold">
                  {p.adName.slice(0, 2).toUpperCase()}
                </text>}

            {/* border ring */}
            <circle cx={p.x} cy={p.y} r={CR} fill="none"
              stroke={isSel ? "#2d88ff" : isActive ? "#31c48d" : "#2a3a50"}
              strokeWidth={isSel ? 2.5 : 1.5} />

            {/* hover tooltip */}
            {isHov && !isSel && (
              <g>
                {(() => {
                  const hasLink = !!p.permalink;
                  const baseH = xMetric === "date" ? 58 : 72;
                  const tooltipH = hasLink ? baseH + 22 : baseH;
                  return (
                    <>
                      <rect x={tooltipX} y={p.y - 36} width={tooltipW} height={tooltipH} rx={8}
                        fill="#0c1220" stroke="rgba(45,136,255,0.2)" strokeWidth={1} />
                      <text x={tooltipX + 12} y={p.y - 20} fill="#c9d1e0" fontSize={11} fontFamily="'DM Sans', sans-serif">
                        {p.adName.length > 26 ? p.adName.slice(0, 26) + "…" : p.adName}
                      </text>
                      <text x={tooltipX + 12} y={p.y - 2} fill="#2d88ff" fontSize={11} fontWeight="bold" fontFamily="'Fira Code', monospace">
                        Y {yInfo.label}: {yInfo.fmt(p.yVal)}
                      </text>
                      {xMetric !== "date" && (
                        <text x={tooltipX + 12} y={p.y + 16} fill="#f5b14c" fontSize={11} fontWeight="bold" fontFamily="'Fira Code', monospace">
                          X {xInfo.label}: {xInfo.fmt(p.xVal)}
                        </text>
                      )}
                      {xMetric === "date" && (
                        <text x={tooltipX + 12} y={p.y + 16} fill="#3d4f6a" fontSize={10} fontFamily="'Fira Code', monospace">
                          {p.date.slice(8)}/{p.date.slice(5, 7)}/{p.date.slice(0, 4)}
                        </text>
                      )}
                      {hasLink && (
                        <a href={p.permalink} target="_blank" rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}>
                          <rect x={tooltipX + 10} y={p.y + baseH - 32} width={tooltipW - 20} height={18} rx={5}
                            fill="rgba(24,119,242,0.15)" stroke="rgba(24,119,242,0.3)" strokeWidth={1} />
                          <text x={tooltipX + tooltipW / 2} y={p.y + baseH - 20} textAnchor="middle"
                            fill="#4e8ef7" fontSize={10} fontWeight="bold" fontFamily="'DM Sans', sans-serif">
                            ↗ ดูโพสต์ Facebook
                          </text>
                        </a>
                      )}
                    </>
                  );
                })()}
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/* ─────────────────── Side Panel ─────────────────── */
function SidePanel({ point, yInfo, onClose }: {
  point: CreativePoint;
  yInfo: { k: string; label: string; fmt: (v: number) => string };
  onClose: () => void;
}) {
  const isActive = point.status === "ACTIVE";
  const metricVal = (point as any)[yInfo.k] as number;

  const stats = [
    { label: "ใช้จ่าย",   value: baht(point.spend || 0),                         color: "#2d88ff" },
    { label: "ROAS",      value: point.roas > 0 ? dec(point.roas, 2) + "x" : "—", color: roasColor(point.roas || 0) },
    { label: "Leads",     value: num(point.leads || 0),                            color: "#31c48d" },
    { label: "CPL",       value: point.cpl > 0 ? baht(point.cpl) : "—",           color: "#7d8c9c" },
    { label: "Purchases", value: num(point.purchases || 0),                        color: "#f5b14c" },
    { label: "ทักแชท",   value: num(point.messaging || 0),                        color: "#7d8c9c" },
  ];

  return (
    <div className="flex flex-col" style={{ minHeight: "100%" }}>

      {/* panel header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06] flex-shrink-0 sticky top-0 z-10"
        style={{ background: "#0c1220" }}>
        <span className="font-semibold text-[13px] text-[#c9d1e0]">รายละเอียด Creative</span>
        <div className="flex items-center gap-2">
          {point.permalink && (
            <a href={point.permalink} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all cursor-pointer"
              style={{ background: "rgba(24,119,242,0.15)", border: "1px solid rgba(24,119,242,0.3)", color: "#4e8ef7" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(24,119,242,0.25)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(24,119,242,0.15)"; }}>
              <IcoFacebook />
              ดูโพสต์
            </a>
          )}
          <button onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full transition-colors cursor-pointer"
            style={{ color: "#3d4f6a" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)"; (e.currentTarget as HTMLElement).style.color = "#c9d1e0"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "#3d4f6a"; }}>
            <IcoClose />
          </button>
        </div>
      </div>

      {/* thumbnail hero */}
      <div className="relative flex-shrink-0 overflow-hidden" style={{ height: "240px", background: "#070c17" }}>
        {point.thumb
          ? <img src={point.thumb} alt={point.adName} referrerPolicy="no-referrer" loading="lazy"
              width={800} height={600}
              className="w-full h-full object-cover" style={{ opacity: 0.7 }} />
          : <div className="w-full h-full" style={{ background: "linear-gradient(135deg, #0c1220, #070c17)" }} />}

        {/* bottom gradient */}
        <div className="absolute inset-0" style={{ background: "linear-gradient(to top, #0c1220 0%, rgba(12,18,32,0.3) 60%, transparent 100%)" }} />

        {/* status badge */}
        <div className="absolute top-3 right-3">
          <span className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full font-semibold"
            style={{
              color: isActive ? "#31c48d" : "#4a5a7a",
              background: isActive ? "rgba(49,196,141,0.15)" : "rgba(255,255,255,0.06)",
              border: `1px solid ${isActive ? "rgba(49,196,141,0.25)" : "rgba(255,255,255,0.08)"}`,
            }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: isActive ? "#31c48d" : "#4a5a7a" }} />
            {isActive ? "ใช้งานอยู่" : "ปิดอยู่"}
          </span>
        </div>

        {/* avatar circle */}
        <div className="absolute bottom-[-20px] left-5 z-10">
          <div className="w-[56px] h-[56px] rounded-2xl overflow-hidden shadow-xl"
            style={{ border: `2px solid ${isActive ? "#31c48d" : "#2a3a50"}` }}>
            {point.thumb
              ? <img src={point.thumb} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center text-[14px] font-bold text-[#3d4f6a]"
                  style={{ background: "#070c17" }}>
                  {point.adName.slice(0, 2).toUpperCase()}
                </div>}
          </div>
        </div>
      </div>

      {/* ad info */}
      <div className="px-5 pt-9 pb-4">
        <h3 className="font-bold text-[15px] text-[#e8eaf5] leading-snug break-words">{point.adName}</h3>
        <p className="text-[#2a3a50] text-[11px] mt-1 truncate">{point.campaign}</p>
        <p className="text-[#2a3a50] text-[11px] mt-0.5">
          {point.date.slice(8)}/{point.date.slice(5, 7)}/{point.date.slice(0, 4)}
        </p>
      </div>

      {/* highlighted y-metric */}
      <div className="mx-5 mb-4 rounded-xl p-4"
        style={{ background: "#070c17", border: "1px solid rgba(45,136,255,0.15)" }}>
        <p className="text-[#2a3a50] text-[10px] uppercase tracking-[0.12em] font-semibold">{yInfo.label}</p>
        <p className="metric-value text-[28px] font-bold mt-1" style={{ color: "#2d88ff" }}>{yInfo.fmt(metricVal)}</p>
      </div>

      {/* stats grid */}
      <div className="px-5 pb-6 grid grid-cols-2 gap-2">
        {stats.map(s => (
          <div key={s.label} className="rounded-xl p-3" style={{ background: "#070c17", border: "1px solid rgba(255,255,255,0.05)" }}>
            <p className="text-[#2a3a50] text-[10px] uppercase tracking-[0.1em] font-semibold mb-1.5">{s.label}</p>
            <p className="metric-value font-bold text-[15px]" style={{ color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
