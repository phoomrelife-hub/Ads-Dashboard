"use client";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import dynamic from "next/dynamic";
import "flatpickr/dist/flatpickr.min.css";
// Lazy-loaded: the date picker only mounts for the "custom"/compare ranges, so keep its
// JS (flatpickr + react-flatpickr) out of the initial bundle that blocks first paint/fetch.
const Flatpickr = dynamic(() => import("react-flatpickr"), { ssr: false });
import { ThailandMap } from "@/components/thailand-map";
import { COLS, COL_GROUPS, DEFAULT_VIS, fmtVal, footVal, baht, num, type Col } from "@/lib/columns";
import { scoreAd, type Criterion, type Direction, type Score } from "@/lib/scoring";
import { useAccountRanking } from "@/components/account-ranking";

type Row = Record<string, any>;
type Acct = { id: string; name: string; active: boolean };

const PAGE_SIZE = 20;
const TABS = [
  { k: "campaign", label: "แคมเปญ" }, { k: "adset", label: "ชุดโฆษณา" },
  { k: "ad", label: "โฆษณา" }, { k: "breakdown", label: "ข้อมูลแยกย่อย" },
] as const;
type TabKey = (typeof TABS)[number]["k"];
const UNIT: Record<string, string> = { campaign: "แคมเปญ", adset: "ชุด", ad: "โฆษณา", breakdown: "รายการ" };
const PRESETS = [
  ["today", "วันนี้"], ["yesterday", "เมื่อวาน"], ["last_7d", "7 วันล่าสุด"],
  ["last_30d", "30 วันล่าสุด"], ["this_month", "เดือนนี้"], ["maximum", "ทั้งหมด"],
  ["custom", "กำหนดเอง"],
];
const OBJ: Record<string, string> = { OUTCOME_SALES: "ยอดขาย", OUTCOME_ENGAGEMENT: "การมีส่วนร่วม", OUTCOME_LEADS: "ลูกค้าเป้าหมาย", OUTCOME_TRAFFIC: "ทราฟฟิก", OUTCOME_AWARENESS: "การรับรู้", OUTCOME_APP_PROMOTION: "โปรโมทแอป" };
const BD_DIMS = [
  ["day", "รายวัน"], ["region", "จังหวัด (พื้นที่)"], ["age", "อายุ"], ["gender", "เพศ"],
  ["publisher_platform", "แพลตฟอร์ม"], ["impression_device", "อุปกรณ์"], ["platform_position", "ตำแหน่งโฆษณา"],
];
const BD_METRICS: [string, string, "baht" | "num"][] = [
  ["spend", "ใช้จ่าย", "baht"], ["impressions", "Impressions", "num"], ["reach", "Reach", "num"],
  ["clicks", "Clicks", "num"], ["leads", "Leads", "num"], ["messaging", "ทักแชท", "num"], ["purchases", "Purchases", "num"],
];
const GENDER: Record<string, string> = { female: "หญิง", male: "ชาย", unknown: "ไม่ระบุ" };

/* ── Summary card definitions ── */
const SUMMARY_CARDS = [
  { key: "spend",       label: "ใช้จ่าย",     color: "#2d88ff", glow: "rgba(45,136,255,0.2)",  fmt: baht,    icon: IcoSpend },
  { key: "reach",       label: "Reach",        color: "#31c48d", glow: "rgba(49,196,141,0.2)",  fmt: num,     icon: IcoReach },
  { key: "impressions", label: "Impressions",  color: "#a78bfa", glow: "rgba(167,139,250,0.2)", fmt: num,     icon: IcoEye },
  { key: "clicks",      label: "Clicks",       color: "#f5b14c", glow: "rgba(245,177,76,0.2)",  fmt: num,     icon: IcoClick },
  { key: "leads",       label: "Leads",        color: "#31c48d", glow: "rgba(49,196,141,0.2)",  fmt: num,     icon: IcoLead },
  { key: "purchases",   label: "Purchases",    color: "#f5b14c", glow: "rgba(245,177,76,0.2)",  fmt: num,     icon: IcoPurchase },
];

/* ─────────── SVG Icon set ─────────── */
function IcoSearch() {
  return <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="6.5" cy="6.5" r="4"/><path d="M10.5 10.5L13 13"/></svg>;
}
function IcoSettings() {
  return <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="7.5" cy="7.5" r="2"/><path d="M7.5 1v1.5M7.5 12.5V14M1 7.5h1.5M12.5 7.5H14M2.93 2.93l1.06 1.06M11.01 11.01l1.06 1.06M2.93 12.07l1.06-1.06M11.01 3.99l1.06-1.06"/></svg>;
}
function IcoRefresh({ spinning }: { spinning?: boolean }) {
  return (
    <motion.span className="inline-flex" animate={spinning ? { rotate: 360 } : { rotate: 0 }}
      transition={spinning ? { repeat: Infinity, duration: 0.7, ease: "linear" } : { duration: 0 }}>
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12.5 2.5A6 6 0 1 1 2.5 7"/>
        <path d="M12.5 2.5V6M12.5 2.5H9"/>
      </svg>
    </motion.span>
  );
}
function IcoAlert() {
  return <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8.57 2.85L1.43 15a1.65 1.65 0 0 0 1.43 2.5h14.28a1.65 1.65 0 0 0 1.43-2.5L11.43 2.85a1.65 1.65 0 0 0-2.86 0z"/><path d="M10 8v4M10 14h.01"/></svg>;
}
function IcoEmpty() {
  return <svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="8" width="28" height="22" rx="3"/><path d="M4 14h28M12 8V4M24 8V4M14 21h8M14 25h5"/></svg>;
}
function IcoChevronLeft() {
  return <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M9 3L5 7l4 4"/></svg>;
}
function IcoChevronRight() {
  return <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M5 3l4 4-4 4"/></svg>;
}
function IcoCompare() {
  return <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M7 2v10M3 5l4-4 4 4M3 9l4 4 4-4"/></svg>;
}
function IcoColumns() {
  return <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="1" y="1" width="4" height="12" rx="1"/><rect x="5" y="1" width="4" height="12" rx="1"/><rect x="9" y="1" width="4" height="12" rx="1"/></svg>;
}
function IcoAnalyze() {
  return <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 11L4.5 7 7.5 9.5 12 3.5"/><circle cx="12" cy="3.5" r="1.5" fill="currentColor" stroke="none"/></svg>;
}
function IcoSpend() {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="6"/><path d="M8 5v1.5M8 9.5V11M6 7.5s.5-1.5 2-1.5 2 1 2 1.5-1.5 1-2 1-2 1-2 1.5S6.5 12 8 12s2-1 2-1"/></svg>;
}
function IcoReach() {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="6" r="2.5"/><path d="M3 13c0-2.76 2.24-5 5-5s5 2.24 5 5"/></svg>;
}
function IcoEye() {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z"/><circle cx="8" cy="8" r="2"/></svg>;
}
function IcoClick() {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2v5H2l6 7 6-7h-4V2z" transform="rotate(15 8 8)"/></svg>;
}
function IcoLead() {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M13 12c0-2.21-2.24-4-5-4S3 9.79 3 12"/><circle cx="8" cy="5.5" r="2.5"/><path d="M10.5 7.5l1 1 2.5-2.5"/></svg>;
}
function IcoPurchase() {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M2 2h1.5l1.5 7h7l1-4H5"/><circle cx="6.5" cy="12.5" r="1"/><circle cx="11.5" cy="12.5" r="1"/></svg>;
}

/* ── Skeleton building blocks ── */
function SkeletonBox({ w, h, className = "", style }: { w?: string; h?: string; className?: string; style?: React.CSSProperties }) {
  return <div className={`skeleton rounded ${className}`} style={{ width: w, height: h, ...style }} />;
}

function SkeletonCards() {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3.5 mb-5">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-2xl p-4 border border-white/[0.06]" style={{ background: "#0c1220" }}>
          <SkeletonBox w="60px" h="11px" className="mb-3" />
          <SkeletonBox w="90px" h="26px" />
        </div>
      ))}
    </div>
  );
}

function SkeletonTable() {
  return (
    <div>
      {/* header */}
      <div className="flex items-center gap-3 px-[18px] py-3.5 border-b border-white/[0.05]">
        <SkeletonBox w="120px" h="13px" />
      </div>
      {/* rows */}
      <div className="divide-y divide-white/[0.04]">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-[18px] py-3.5">
            <SkeletonBox w="36px" h="20px" className="rounded-full flex-shrink-0" />
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <SkeletonBox w="44px" h="44px" className="rounded-lg flex-shrink-0" style={{ opacity: i % 3 !== 0 ? 0 : 1 } as React.CSSProperties} />
              <div className="flex-1 min-w-0">
                <SkeletonBox w={`${60 + (i % 4) * 10}%`} h="13px" className="mb-2" />
                <SkeletonBox w={`${30 + (i % 3) * 8}%`} h="10px" />
              </div>
            </div>
            <SkeletonBox w="60px" h="20px" className="rounded-full" />
            {Array.from({ length: 5 }).map((_, j) => (
              <SkeletonBox key={j} w="64px" h="13px" className="hidden sm:block" />
            ))}
          </div>
        ))}
      </div>
      {/* footer */}
      <div className="flex items-center justify-end gap-3 px-[18px] py-3.5 border-t border-white/[0.05]">
        <SkeletonBox w="80px" h="13px" />
        <SkeletonBox w="88px" h="34px" className="rounded-lg" />
        <SkeletonBox w="76px" h="34px" className="rounded-lg" />
      </div>
    </div>
  );
}

/* ── Main component ── */
export function Dashboard({ initialAccounts = [] }: { initialAccounts?: Acct[] }) {
  const [accounts, setAccounts] = useState<Acct[]>(initialAccounts);
  // The selected account is chosen by an effect once the hidden-accounts list is known
  // (see below), NOT seeded to accounts[0] here — that could pick a hidden account and
  // fire a wasted insights fetch before switching, which showed as a flash + double load.
  const [acctId, setAcctId] = useState("");
  const [acctName, setAcctName] = useState("");
  const [hydrated, setHydrated] = useState(false); // localStorage prefs (incl. hidden lists) parsed
  const [acctOpen, setAcctOpen] = useState(false);
  const [acctQuery, setAcctQuery] = useState("");
  const [preset, setPreset] = useState("last_30d");
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  const [compareOn, setCompareOn] = useState(false);
  const [compareRows, setCompareRows] = useState<Row[]>([]);
  const [compareTotals, setCompareTotals] = useState<Record<string, number>>({});
  const [cmpSince, setCmpSince] = useState("");
  const [cmpUntil, setCmpUntil] = useState("");
  const [tab, setTab] = useState<TabKey>("campaign");
  const [rows, setRows] = useState<Row[]>([]);
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState("");
  const [vis, setVis] = useState<string[]>(DEFAULT_VIS);
  const [colOpen, setColOpen] = useState(false);
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [criteriaOpen, setCriteriaOpen] = useState(false);
  const [scoreFilter, setScoreFilter] = useState<Set<Score>>(new Set()); // empty = show all score levels
  const [hiddenAccts, setHiddenAccts] = useState<string[]>([]);
  const [bdDim, setBdDim] = useState("day");
  const [bdMetric, setBdMetric] = useState("spend");
  const [pages, setPages] = useState<{ id: string; name: string }[]>([]);
  const [pageId, setPageId] = useState(""); // "" = all pages (ad tab filter)
  const [hiddenPages, setHiddenPages] = useState<string[]>([]);
  const [problems, setProblems] = useState<{ id: string; name: string; reason: string; detail: string }[]>([]);
  const comboRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try { const s = JSON.parse(localStorage.getItem("adsCols") || "[]"); if (Array.isArray(s) && s.length) setVis(s); } catch {}
    try { const c = JSON.parse(localStorage.getItem("adsCriteria") || "[]"); if (Array.isArray(c)) setCriteria(c); } catch {}
    try { const h = JSON.parse(localStorage.getItem("adsHiddenAccounts") || "[]"); if (Array.isArray(h)) setHiddenAccts(h); } catch {}
    try { const p = JSON.parse(localStorage.getItem("adsHiddenPages") || "[]"); if (Array.isArray(p)) setHiddenPages(p); } catch {}
    setHydrated(true); // hidden lists now known → safe to pick the first visible account
  }, []);
  const saveVis = (v: string[]) => { setVis(v); localStorage.setItem("adsCols", JSON.stringify(v)); };
  const saveCriteria = (c: Criterion[]) => { setCriteria(c); localStorage.setItem("adsCriteria", JSON.stringify(c)); };

  useEffect(() => {
    if (accounts.length) return; // server already supplied the account list — skip the round-trip
    fetch("/api/accounts").then((r) => r.json()).then((a: Acct[] | { error: string }) => {
      if (Array.isArray(a) && a.length) setAccounts(a); // selection handled by the effect below
      else setError((a as any).error || "โหลดบัญชีไม่ได้");
    });
  }, []);

  // Select the first VISIBLE account once both the account list and the hidden-accounts
  // list are known. Covers the initial pick AND re-picking when the current account gets
  // hidden in settings. Gating on `hydrated` is what prevents loading a hidden account
  // first and then switching (the flash + wasted insights fetch). "all" is left untouched.
  useEffect(() => {
    if (!hydrated || accounts.length === 0) return;
    if (acctId === "all") return;
    const allHidden = hiddenAccts.length === accounts.length; // everything hidden → fall back to showing all
    const isVisible = (id: string) => allHidden || !hiddenAccts.includes(id);
    if (acctId && isVisible(acctId)) return; // current selection is fine
    const first = accounts.find((a) => isVisible(a.id));
    if (first) { setAcctId(first.id); setAcctName(first.name); }
  }, [hydrated, accounts, hiddenAccts, acctId]);

  useEffect(() => {
    if (!acctId) return;
    setPages([]);
    fetch(`/api/pages?act=${acctId}`).then((r) => r.json()).then((p) => { if (Array.isArray(p)) setPages(p); }).catch(() => {});
  }, [acctId]);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (comboRef.current && !comboRef.current.contains(e.target as Node)) setAcctOpen(false); };
    document.addEventListener("click", h); return () => document.removeEventListener("click", h);
  }, []);

  // reset page filter when the account or tab changes
  useEffect(() => { setPageId(""); }, [acctId, tab]);
  useEffect(() => { setPage(1); }, [pageId]);

  const range = since && until ? `&since=${since}&until=${until}` : "";
  const cmpRange = compareOn && cmpSince && cmpUntil ? `&since=${cmpSince}&until=${cmpUntil}` : "";
  // In the "all accounts" merge, exclude accounts hidden in Workspace Settings server-side
  // so their spend/rows don't leak into the combined totals.
  const hiddenParam = acctId === "all" && hiddenAccts.length ? `&hidden=${hiddenAccts.join(",")}` : "";

  const load = useCallback(async () => {
    if (!acctId) return;
    if (preset === "custom" && (!since || !until)) return;
    setLoading(true); setRefreshing(true); setError(""); setFilter(""); setPage(1);
    try {
      const url = tab === "breakdown"
        ? `/api/breakdown?act=${acctId}&preset=${preset}&dim=${bdDim}${range}${hiddenParam}`
        : `/api/insights?act=${acctId}&level=${tab}&preset=${preset}${range}${hiddenParam}`;
      const cmpUrl = (cmpRange && tab !== "breakdown")
        ? `/api/insights?act=${acctId}&level=${tab}&preset=${preset}${cmpRange}${hiddenParam}`
        : null;
      const [d, cmp] = await Promise.all([
        fetch(url).then((r) => r.json()),
        cmpUrl ? fetch(cmpUrl).then((r) => r.json()) : Promise.resolve(null),
      ]);
      if (d.error) throw new Error(d.error);
      setRows(d.rows); setTotals(d.totals);
      setProblems(Array.isArray(d.problems) ? d.problems : []);
      setCompareRows(cmp?.rows ?? []);
      setCompareTotals(cmp?.totals ?? {});
    } catch (e: any) { setError(e.message); setProblems([]); }
    finally { setLoading(false); setRefreshing(false); }
  }, [acctId, tab, preset, bdDim, range, cmpRange, hiddenParam, since, until]);

  useEffect(() => { load(); }, [load]);

  const cols = useMemo(() => COLS.filter((c) => vis.includes(c.k)), [vis]);

  // pages present in the currently loaded ad rows (for the dropdown)
  const pageMap = useMemo(() => new Map(pages.map((p) => [p.id, p.name])), [pages]);
  const rowPages = useMemo(() => {
    if (tab !== "ad") return [];
    const ids = new Set<string>();
    rows.forEach((r) => { if (r.pageId) ids.add(String(r.pageId)); });
    return [...ids].filter((id) => !hiddenPages.includes(id))
      .map((id) => ({ id, name: pageMap.get(id) || `เพจ ${id}` }))
      .sort((a, b) => a.name.localeCompare(b.name, "th"));
  }, [rows, tab, pageMap, hiddenPages]);

  // if the selected page got hidden in settings, clear the filter
  useEffect(() => { if (pageId && hiddenPages.includes(pageId)) setPageId(""); }, [hiddenPages, pageId]);

  const filtered = useMemo(() => {
    let rs = rows;
    if (tab === "ad" && pageId) rs = rs.filter((r) => String(r.pageId) === pageId);
    if (filter) {
      const q = filter.toLowerCase();
      rs = rs.filter((r) => ["name", "title", "adset", "campaign", "key"].some((k) => String(r[k] || "").toLowerCase().includes(q)));
    }
    return rs;
  }, [rows, filter, tab, pageId]);
  const scoreDist = useMemo(() => {
    if (tab !== "ad" || !criteria.length || !filtered.length) return null;
    const counts = { ดี: 0, ปานกลาง: 0, ไม่ดี: 0 };
    filtered.forEach((r) => { const s = scoreAd(r, criteria); if (s) counts[s]++; });
    return counts;
  }, [tab, criteria, filtered]);

  // final view: filtered rows narrowed to the selected score levels (empty filter = all)
  const visible = useMemo(() => {
    if (tab !== "ad" || !criteria.length || scoreFilter.size === 0) return filtered;
    return filtered.filter((r) => scoreFilter.has(scoreAd(r, criteria)));
  }, [filtered, tab, criteria, scoreFilter]);

  const toggleScore = (s: Score) => {
    setScoreFilter((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });
    setPage(1);
  };

  // clear the score filter whenever scores become invalid (tab/account/criteria change)
  useEffect(() => { setScoreFilter(new Set()); }, [tab, acctId, criteria]);

  async function toggle(id: string, next: boolean) {
    const status = next ? "ACTIVE" : "PAUSED";
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status } : r)));
    try {
      const j = await (await fetch("/api/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) })).json();
      if (j.error) throw new Error(j.error);
    } catch (e: any) {
      setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status: next ? "PAUSED" : "ACTIVE" } : r)));
      alert("เปลี่ยนสถานะไม่ได้: " + e.message);
    }
  }

  const visibleAccts = hiddenAccts.length === accounts.length
    ? accounts
    : accounts.filter((a) => !hiddenAccts.includes(a.id));
  const { sorted: rankedAccts, tagOf, controls: rankControls } = useAccountRanking(visibleAccts, hiddenAccts);
  const filteredAccts = rankedAccts.filter((a) => a.name.toLowerCase().includes(acctQuery.toLowerCase()));

  /* ── Input / control shared styles ── */
  const inputCls = "bg-[#0c1220] border border-white/[0.08] rounded-xl px-3 py-2 text-[13px] outline-none transition-colors focus:border-[#2d88ff]/60 hover:border-white/[0.14] placeholder:text-[#3d4f6a] text-[#c9d1e0]";

  return (
    <div style={{ background: "#060a12", minHeight: "100vh" }}>

      {/* ── Top Bar ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap px-6 py-3 border-b border-white/[0.06] sticky top-0 z-30"
        style={{ background: "rgba(6,10,18,0.92)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}>

        {/* title */}
        <div className="flex items-center gap-2.5">
          <div className="w-2 h-2 rounded-full bg-[#31c48d] shadow-[0_0_10px_2px_rgba(49,196,141,0.5)]" />
          <span className="font-semibold text-[14px] text-[#e8eaf5] tracking-[-0.01em]">จัดการโฆษณา</span>
        </div>

        {/* controls */}
        <div className="flex items-center gap-2 flex-wrap">

          {/* account combobox */}
          <div ref={comboRef} className="relative">
            <input
              value={acctOpen ? acctQuery : acctName}
              onChange={(e) => { setAcctQuery(e.target.value); setAcctOpen(true); }}
              onFocus={() => { setAcctQuery(""); setAcctOpen(true); }}
              placeholder="ค้นหาบัญชี..."
              className={`${inputCls} min-w-[220px] cursor-pointer`}
            />
            <AnimatePresence>
              {acctOpen && (
                <motion.div initial={{ opacity: 0, y: -8, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.97 }}
                  transition={{ duration: 0.14, ease: "easeOut" }}
                  className="absolute top-[calc(100%+6px)] left-0 right-0 max-h-72 overflow-y-auto rounded-xl z-40 shadow-[0_16px_48px_rgba(0,0,0,0.7)]"
                  style={{ background: "#0c1220", border: "1px solid rgba(255,255,255,0.08)" }}>
                  {/* rank-by controls — reorder accounts by 7-day performance */}
                  <div className="flex items-center gap-1.5 px-2.5 py-2 sticky top-0 z-10" style={{ background: "#0c1220", borderBottom: "1px solid rgba(255,255,255,0.08)" }}
                    onClick={(e) => e.stopPropagation()}>
                    {rankControls}
                  </div>
                  {/* All accounts (merged) */}
                  {(!acctQuery || "บัญชีทั้งหมด all".toLowerCase().includes(acctQuery.toLowerCase())) && (
                    <div onClick={() => { setAcctId("all"); setAcctName("บัญชีทั้งหมด"); setAcctOpen(false); }}
                      className="flex items-center gap-2 px-3.5 py-2.5 cursor-pointer truncate text-[13px] font-medium transition-colors"
                      style={{ color: acctId === "all" ? "#fff" : "#c9d1e0", background: acctId === "all" ? "#2d88ff" : "transparent", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
                      onMouseEnter={e => { if (acctId !== "all") e.currentTarget.style.background = "rgba(45,136,255,0.1)"; }}
                      onMouseLeave={e => { if (acctId !== "all") e.currentTarget.style.background = "transparent"; }}>
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="1.5" y="1.5" width="6" height="6" rx="1.5" /><rect x="8.5" y="1.5" width="6" height="6" rx="1.5" />
                        <rect x="1.5" y="8.5" width="6" height="6" rx="1.5" /><rect x="8.5" y="8.5" width="6" height="6" rx="1.5" />
                      </svg>
                      <span className="truncate">บัญชีทั้งหมด</span>
                      <span className="ml-auto text-[10px]" style={{ color: acctId === "all" ? "#dbe7ff" : "#3d4f6a" }}>{visibleAccts.length}</span>
                    </div>
                  )}
                  {filteredAccts.length ? filteredAccts.map((a) => (
                    <div key={a.id} onClick={() => { setAcctId(a.id); setAcctName(a.name); setAcctOpen(false); }}
                      className="px-3.5 py-2.5 cursor-pointer truncate text-[13px] transition-colors"
                      style={{ color: a.id === acctId ? "#fff" : "#8a9aba", background: a.id === acctId ? "#2d88ff" : "transparent" }}
                      onMouseEnter={e => { if (a.id !== acctId) { e.currentTarget.style.background = "rgba(45,136,255,0.1)"; e.currentTarget.style.color = "#c9d1e0"; } }}
                      onMouseLeave={e => { if (a.id !== acctId) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#8a9aba"; } }}>
                      <div className="flex items-center gap-2">
                        <span className="truncate">{a.name}</span>
                        <span className="ml-auto text-[10px] flex-shrink-0 font-mono opacity-70">{tagOf(a.id).replace(/^ · /, "")}</span>
                      </div>
                    </div>
                  )) : <div className="px-3.5 py-2.5 text-[#3d4f6a] text-[13px]">ไม่พบบัญชี</div>}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* page filter (ad tab only) */}
          {tab === "ad" && (
            <select value={pageId} onChange={(e) => setPageId(e.target.value)}
              className={`${inputCls} cursor-pointer max-w-[200px]`}
              title="กรองตามเพจ">
              <option value="">ทุกเพจ{rowPages.length ? ` (${rowPages.length})` : ""}</option>
              {rowPages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}

          {/* preset select */}
          <select value={preset} onChange={(e) => { setPreset(e.target.value); if (e.target.value !== "custom") { setSince(""); setUntil(""); } }}
            className={`${inputCls} cursor-pointer`}>
            {PRESETS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>

          {/* custom date range */}
          <AnimatePresence>
            {preset === "custom" && (
              <motion.div initial={{ opacity: 0, x: -8, width: 0 }} animate={{ opacity: 1, x: 0, width: "auto" }} exit={{ opacity: 0, x: -8, width: 0 }} transition={{ duration: 0.18 }}>
                <Flatpickr
                  options={{ mode: "range", dateFormat: "j M Y", maxDate: "today" }}
                  placeholder="เลือกช่วงเวลา..."
                  className={`${inputCls} min-w-[200px] cursor-pointer`}
                  onChange={(dates) => {
                    if (dates.length === 2) {
                      const iso = (d: Date) => d.toISOString().slice(0, 10);
                      setSince(iso(dates[0])); setUntil(iso(dates[1]));
                    }
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* compare toggle */}
          <button
            onClick={() => { setCompareOn((o) => !o); if (compareOn) { setCmpSince(""); setCmpUntil(""); setCompareRows([]); setCompareTotals({}); } }}
            className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] border transition-all duration-150 cursor-pointer font-medium"
            style={{
              background: compareOn ? "rgba(45,136,255,0.1)" : "#0c1220",
              border: compareOn ? "1px solid rgba(45,136,255,0.4)" : "1px solid rgba(255,255,255,0.08)",
              color: compareOn ? "#2d88ff" : "#7d8c9c",
            }}>
            <IcoCompare /> เปรียบเทียบ
          </button>

          {/* compare date range */}
          <AnimatePresence>
            {compareOn && (
              <motion.div initial={{ opacity: 0, x: -8, width: 0 }} animate={{ opacity: 1, x: 0, width: "auto" }} exit={{ opacity: 0, x: -8, width: 0 }} transition={{ duration: 0.18 }}>
                <Flatpickr
                  options={{ mode: "range", dateFormat: "j M Y", maxDate: "today" }}
                  placeholder="เลือกช่วงเปรียบเทียบ..."
                  className={`${inputCls} min-w-[210px] cursor-pointer`}
                  onChange={(dates) => {
                    if (dates.length === 2) {
                      const iso = (d: Date) => d.toISOString().slice(0, 10);
                      setCmpSince(iso(dates[0])); setCmpUntil(iso(dates[1]));
                    }
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* refresh */}
          <button onClick={load} disabled={refreshing}
            className="flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-semibold text-white border transition-all duration-150 cursor-pointer disabled:opacity-60"
            style={{ background: "linear-gradient(135deg, #2d88ff, #1a6fd8)", border: "1px solid rgba(45,136,255,0.5)", boxShadow: "0 0 16px rgba(45,136,255,0.25)" }}>
            <IcoRefresh spinning={refreshing} />
            รีเฟรช
          </button>
        </div>
      </div>

      {/* ── Page content ── */}
      <div className="p-6">
        {/* page header */}
        <div className="mb-5">
          <h1 className="text-[17px] font-bold text-[#e8eaf5] tracking-[-0.02em] mb-1">ภาพรวมโฆษณา</h1>
          <p className="text-[#3d4f6a] text-[13px]">
            {loading ? "กำลังโหลดข้อมูล..." : error ? "เกิดข้อผิดพลาด" : `${acctName} · ${totals.count || 0} ${UNIT[tab]}${since && until ? ` · ${since} – ${until}` : ""}`}
          </p>
        </div>

        {/* ── Urgent: accounts that didn't load in "บัญชีทั้งหมด" ── */}
        <AnimatePresence>
          {acctId === "all" && !loading && problems.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -8, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, y: -8, height: 0 }}
              className="mb-5 rounded-xl overflow-hidden"
              style={{ background: "rgba(255,107,107,0.07)", border: "1px solid rgba(255,107,107,0.28)" }}>
              <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: "1px solid rgba(255,107,107,0.16)" }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#ff6b6b" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6.6 2.5L1 13h14L9.4 2.5a1.6 1.6 0 0 0-2.8 0z" /><path d="M8 6.5v3M8 11.5v.3" />
                </svg>
                <span className="text-[13px] font-semibold text-[#ff8585]">
                  {problems.length} บัญชีโหลดไม่สำเร็จ — ข้อมูลรวมยังไม่ครบ
                </span>
                <button onClick={load} disabled={refreshing}
                  className="ml-auto text-[11px] px-2.5 py-1 rounded-lg cursor-pointer transition-colors disabled:opacity-50"
                  style={{ color: "#ff8585", background: "rgba(255,107,107,0.1)", border: "1px solid rgba(255,107,107,0.25)" }}>
                  ลองใหม่
                </button>
              </div>
              <div className="px-4 py-2 flex flex-col gap-1.5">
                {problems.map((p) => (
                  <div key={p.id} className="flex items-start gap-2 text-[12px] py-1" title={p.detail}>
                    <span className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: "#ff6b6b" }} />
                    <span className="text-[#e8a0a0] font-medium flex-shrink-0">{p.name}</span>
                    <span className="text-[#5a6a8a]">—</span>
                    <span className="text-[#9aa8c0]">{p.reason}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Tabs ── */}
        <div className="flex gap-1 mb-5 relative" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          {TABS.map((t) => (
            <button key={t.k} onClick={() => setTab(t.k)}
              className="relative px-4 py-2.5 text-[13px] font-medium transition-colors duration-150 cursor-pointer"
              style={{ color: tab === t.k ? "#e8eaf5" : "#3d4f6a" }}>
              {tab === t.k && (
                <motion.div layoutId="tab-indicator"
                  className="absolute bottom-0 left-0 right-0 h-[2px] rounded-t-full"
                  style={{ background: "#2d88ff" }}
                  transition={{ type: "spring", stiffness: 500, damping: 35 }} />
              )}
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Summary cards ── */}
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div key="skeleton-cards" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <SkeletonCards />
            </motion.div>
          ) : (
            <motion.div key={`cards-${String(loading)}`} initial="hidden" animate="show"
              variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
              className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3.5 mb-5">
              {SUMMARY_CARDS.map(({ key, label, color, glow, fmt, icon: Icon }) => (
                <motion.div key={key}
                  variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } } }}
                  className="relative rounded-2xl p-4 overflow-hidden cursor-default"
                  style={{ background: "#0c1220", border: "1px solid rgba(255,255,255,0.06)" }}
                  whileHover={{ borderColor: `${color}30`, boxShadow: `0 0 20px ${glow}` }}
                  transition={{ duration: 0.2 }}>
                  {/* top accent line */}
                  <div className="absolute top-0 left-4 right-4 h-[1.5px] rounded-full" style={{ background: `linear-gradient(90deg, transparent, ${color}60, transparent)` }} />
                  {/* icon */}
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: "#3d4f6a" }}>{label}</span>
                    <div style={{ color: `${color}70` }}><Icon /></div>
                  </div>
                  {/* value */}
                  <div className="metric-value text-[22px] font-bold leading-none" style={{ color }}>
                    {fmt(totals[key] || 0)}
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Table panel ── */}
        <div className="rounded-2xl overflow-hidden" style={{ background: "#0c1220", border: "1px solid rgba(255,255,255,0.06)" }}>

          {/* panel header */}
          <div className="flex justify-between items-center gap-2.5 flex-wrap px-5 py-3.5 border-b border-white/[0.05]">
            <div className="font-semibold text-[14px] text-[#c9d1e0]">
              {tab === "breakdown" ? "ข้อมูลแยกย่อย" : TABS.find((t) => t.k === tab)!.label}
            </div>
            {tab !== "breakdown" && (
              <div className="flex items-center gap-2 relative">
                {/* search */}
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#3d4f6a] pointer-events-none">
                    <IcoSearch />
                  </div>
                  <input value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1); }}
                    placeholder="ค้นหาในตาราง..."
                    className="bg-[#070c17] border border-white/[0.06] rounded-xl pl-9 pr-3 py-2 text-[13px] min-w-[190px] outline-none transition-colors focus:border-[#2d88ff]/40 placeholder:text-[#2a3a50] text-[#c9d1e0]" />
                </div>
                <span className="text-[#3d4f6a] text-[12px] whitespace-nowrap">
                  {filter || scoreFilter.size > 0 ? `${visible.length} / ${totals.count}` : `${totals.count || 0}`} {UNIT[tab]}
                </span>
                {scoreDist && (
                  <div className="flex items-center gap-1.5 text-[12px] font-semibold whitespace-nowrap">
                    {([
                      ["ดี", scoreDist.ดี, "#31c48d"],
                      ["ปานกลาง", scoreDist.ปานกลาง, "#f5b14c"],
                      ["ไม่ดี", scoreDist.ไม่ดี, "#ff6b6b"],
                    ] as [Score, number, string][]).map(([level, count, color]) => {
                      const active = scoreFilter.has(level);
                      const dimmed = scoreFilter.size > 0 && !active;
                      return (
                        <button key={level} onClick={() => toggleScore(level)}
                          title={active ? `กำลังกรอง: ${level}` : `กรองเฉพาะ ${level}`}
                          className="rounded-lg px-2 py-1 cursor-pointer transition-all duration-150"
                          style={{
                            color: active ? "#0a0e17" : color,
                            background: active ? color : "transparent",
                            border: `1px solid ${active ? color : "rgba(255,255,255,0.06)"}`,
                            boxShadow: active ? `0 0 12px ${color}55` : "none",
                            opacity: dimmed ? 0.4 : 1,
                          }}>
                          {count} {level}
                        </button>
                      );
                    })}
                    {scoreFilter.size > 0 && (
                      <button onClick={() => setScoreFilter(new Set())}
                        title="ล้างตัวกรอง" className="ml-0.5 rounded-lg px-1.5 py-1 cursor-pointer transition-colors text-[#7d8c9c] hover:text-[#c9d1e0]"
                        style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
                        ✕
                      </button>
                    )}
                  </div>
                )}
                {tab === "ad" && (
                  <button onClick={() => { setCriteriaOpen((o) => !o); setColOpen(false); }}
                    className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-medium transition-colors duration-150 cursor-pointer"
                    style={{ background: criteriaOpen ? "rgba(245,177,76,0.1)" : "#070c17", border: `1px solid ${criteriaOpen ? "rgba(245,177,76,0.35)" : "rgba(255,255,255,0.06)"}`, color: criteriaOpen ? "#f5b14c" : (criteria.length > 0 ? "#f5b14c" : "#7d8c9c") }}>
                    <IcoAnalyze /> วิเคราะห์{criteria.length > 0 ? ` (${criteria.length})` : ""}
                  </button>
                )}
                <AnimatePresence>
                  {criteriaOpen && <CriteriaPanel key="criteria-panel" criteria={criteria} onChange={saveCriteria} onClose={() => setCriteriaOpen(false)} />}
                </AnimatePresence>
                <button onClick={() => { setColOpen((o) => !o); setCriteriaOpen(false); }}
                  className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-medium transition-colors duration-150 cursor-pointer"
                  style={{ background: colOpen ? "rgba(45,136,255,0.1)" : "#070c17", border: `1px solid ${colOpen ? "rgba(45,136,255,0.35)" : "rgba(255,255,255,0.06)"}`, color: colOpen ? "#2d88ff" : "#7d8c9c" }}>
                  <IcoColumns /> คอลัมน์
                </button>
                <AnimatePresence>
                  {colOpen && <ColPanel key="col-panel" vis={vis} onChange={saveVis} onClose={() => setColOpen(false)} />}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* content */}
          <AnimatePresence mode="wait" initial={false}>
            {loading ? (
              <motion.div key="loading-state" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <SkeletonTable />
              </motion.div>
            ) : error ? (
              <motion.div key="error-state" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="py-16 flex flex-col items-center gap-4 text-center">
                <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: "rgba(255,107,107,0.1)", color: "#ff6b6b" }}>
                  <IcoAlert />
                </div>
                <div>
                  <div className="text-[#ff6b6b] font-semibold text-[14px] mb-1">เกิดข้อผิดพลาด</div>
                  <div className="text-[#3d4f6a] text-[12px] max-w-[280px]">{error}</div>
                </div>
                <button onClick={load} className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-medium text-[#c9d1e0] cursor-pointer transition-colors"
                  style={{ background: "#0c1220", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <IcoRefresh /> ลองใหม่
                </button>
              </motion.div>
            ) : (
              <motion.div key={`${tab}-content`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                {tab === "breakdown"
                  ? <BreakdownView rows={rows} dim={bdDim} setDim={setBdDim} metric={bdMetric} setMetric={setBdMetric} />
                  : <LevelTable tab={tab} rows={visible} cols={cols} totals={totals} page={page} setPage={setPage} onToggle={toggle}
                    compareRows={compareOn ? compareRows : []} compareTotals={compareOn ? compareTotals : {}} criteria={criteria} />}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

/* ── Column customizer panel ── */
function ColPanel({ vis, onChange, onClose }: { vis: string[]; onChange: (v: string[]) => void; onClose: () => void }) {
  const toggle = (k: string) => onChange(vis.includes(k) ? vis.filter((x) => x !== k) : [...vis, k]);
  return (
    <motion.div initial={{ opacity: 0, scale: 0.94, y: -10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.94, y: -10 }}
      transition={{ duration: 0.16, ease: "easeOut" }}
      className="absolute top-[calc(100%+8px)] right-0 w-[340px] max-h-[70vh] overflow-y-auto rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.7)] z-50 p-3.5"
      style={{ transformOrigin: "top right", background: "#0c1220", border: "1px solid rgba(255,255,255,0.08)" }}>

      {/* action buttons */}
      <div className="flex gap-2 mb-3">
        {[["เลือกทั้งหมด", () => onChange(COLS.map((c) => c.k))], ["ล้าง", () => onChange([])], ["ค่าเริ่มต้น", () => onChange([...DEFAULT_VIS])]].map(([label, fn]) => (
          <button key={label as string} onClick={fn as () => void}
            className="flex-1 rounded-lg py-1.5 text-[12px] font-medium transition-colors duration-150 cursor-pointer text-[#7d8c9c] hover:text-[#c9d1e0]"
            style={{ background: "#070c17", border: "1px solid rgba(255,255,255,0.06)" }}>
            {label as string}
          </button>
        ))}
      </div>

      {/* groups */}
      {COL_GROUPS.map((g) => (
        <div key={g} className="mb-2">
          <div className="text-[10px] uppercase tracking-[0.12em] text-[#2d88ff] font-bold px-1 pt-3 pb-2">{g}</div>
          {COLS.filter((c) => c.g === g).map((c) => (
            <label key={c.k} className="flex items-center gap-3 px-2 py-1.5 rounded-lg cursor-pointer transition-colors duration-100"
              style={{ color: vis.includes(c.k) ? "#c9d1e0" : "#4a5a7a" }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(45,136,255,0.06)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
              <div className="relative w-[15px] h-[15px] flex-shrink-0">
                <input type="checkbox" checked={vis.includes(c.k)} onChange={() => toggle(c.k)} className="sr-only" />
                <div className="w-[15px] h-[15px] rounded border transition-all duration-150"
                  style={{ background: vis.includes(c.k) ? "#2d88ff" : "transparent", borderColor: vis.includes(c.k) ? "#2d88ff" : "rgba(255,255,255,0.15)" }}>
                  {vis.includes(c.k) && (
                    <svg viewBox="0 0 10 10" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2 5l2.5 2.5L8 3" />
                    </svg>
                  )}
                </div>
              </div>
              <span className="text-[13px]">{c.label}</span>
            </label>
          ))}
        </div>
      ))}
    </motion.div>
  );
}

/* ── Criteria panel ── */
const CRITERIA_PRESETS = [
  { label: "Lead Gen", items: [
    { key: "ctr", direction: "higher" as Direction, good: 2, bad: 0.5 },
    { key: "cpl", direction: "lower" as Direction, good: 50, bad: 200 },
    { key: "leads", direction: "higher" as Direction, good: 1, bad: 0.1 },
  ]},
  { label: "E-Commerce", items: [
    { key: "roas", direction: "higher" as Direction, good: 3, bad: 1 },
    { key: "costPerPurchase", direction: "lower" as Direction, good: 300, bad: 1000 },
    { key: "purchases", direction: "higher" as Direction, good: 1, bad: 0.1 },
  ]},
  { label: "Engagement", items: [
    { key: "ctr", direction: "higher" as Direction, good: 2, bad: 0.5 },
    { key: "cpc", direction: "lower" as Direction, good: 5, bad: 20 },
    { key: "clicks", direction: "higher" as Direction, good: 100, bad: 10 },
  ]},
];

function CriteriaPanel({ criteria, onChange, onClose }: { criteria: Criterion[]; onChange: (c: Criterion[]) => void; onClose: () => void }) {
  const update = (i: number, patch: Partial<Criterion>) =>
    onChange(criteria.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  const remove = (i: number) => onChange(criteria.filter((_, idx) => idx !== i));
  const add = () => onChange([...criteria, { key: "ctr", direction: "higher" as Direction, good: 2, bad: 0.5 }]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94, y: -10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.94, y: -10 }}
      transition={{ duration: 0.16, ease: "easeOut" }}
      className="absolute top-[calc(100%+8px)] right-0 w-[430px] max-h-[75vh] overflow-y-auto rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.7)] z-50 p-3.5"
      style={{ transformOrigin: "top right", background: "#0c1220", border: "1px solid rgba(255,255,255,0.08)" }}>

      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#f5b14c] mb-3 px-1">ตั้งเกณฑ์วิเคราะห์</div>

      {/* quick presets */}
      <div className="flex gap-2 mb-4">
        {CRITERIA_PRESETS.map((p) => (
          <button key={p.label} onClick={() => onChange(p.items)}
            className="flex-1 rounded-lg py-1.5 text-[12px] font-medium transition-colors duration-150 cursor-pointer text-[#7d8c9c] hover:text-[#c9d1e0]"
            style={{ background: "#070c17", border: "1px solid rgba(255,255,255,0.06)" }}>
            {p.label}
          </button>
        ))}
      </div>

      {/* criteria rows */}
      {criteria.length === 0 ? (
        <div className="text-center py-5 text-[#3d4f6a] text-[12px]">ยังไม่มีเกณฑ์ · เลือก preset หรือกด + เพิ่มเกณฑ์</div>
      ) : (
        <div className="space-y-2 mb-3">
          {criteria.map((c, i) => (
            <div key={i} className="rounded-xl p-3 flex gap-2 flex-wrap items-center" style={{ background: "#070c17", border: "1px solid rgba(255,255,255,0.06)" }}>
              <select value={c.key} onChange={(e) => update(i, { key: e.target.value })}
                className="flex-1 min-w-[120px] rounded-lg px-2 py-1.5 text-[12px] text-[#c9d1e0] outline-none cursor-pointer"
                style={{ background: "#0c1220", border: "1px solid rgba(255,255,255,0.08)" }}>
                {COLS.map((col) => <option key={col.k} value={col.k}>{col.label}</option>)}
              </select>
              <button onClick={() => update(i, { direction: c.direction === "higher" ? "lower" : "higher" })}
                className="text-[11px] font-semibold rounded-lg px-2 py-1.5 cursor-pointer transition-colors whitespace-nowrap"
                style={{ background: c.direction === "higher" ? "rgba(49,196,141,0.1)" : "rgba(255,107,107,0.1)", color: c.direction === "higher" ? "#31c48d" : "#ff6b6b", border: `1px solid ${c.direction === "higher" ? "rgba(49,196,141,0.2)" : "rgba(255,107,107,0.2)"}` }}>
                {c.direction === "higher" ? "↑ สูง ดีกว่า" : "↓ ต่ำ ดีกว่า"}
              </button>
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-semibold" style={{ color: "#31c48d" }}>ดี</span>
                <span className="text-[10px] text-[#3d4f6a]">{c.direction === "higher" ? "≥" : "≤"}</span>
                <input type="number" value={c.good} onChange={(e) => update(i, { good: Number(e.target.value) })}
                  className="w-16 rounded-lg px-2 py-1 text-[12px] text-[#c9d1e0] outline-none text-center"
                  style={{ background: "#0c1220", border: "1px solid rgba(255,255,255,0.08)" }} />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-semibold" style={{ color: "#ff6b6b" }}>ไม่ดี</span>
                <span className="text-[10px] text-[#3d4f6a]">{c.direction === "higher" ? "<" : ">"}</span>
                <input type="number" value={c.bad} onChange={(e) => update(i, { bad: Number(e.target.value) })}
                  className="w-16 rounded-lg px-2 py-1 text-[12px] text-[#c9d1e0] outline-none text-center"
                  style={{ background: "#0c1220", border: "1px solid rgba(255,255,255,0.08)" }} />
              </div>
              <button onClick={() => remove(i)} className="text-[#4a5a7a] hover:text-[#ff6b6b] transition-colors cursor-pointer text-[18px] leading-none">&times;</button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={add}
          className="flex-1 rounded-lg py-2 text-[12px] font-medium transition-colors duration-150 cursor-pointer"
          style={{ background: "rgba(245,177,76,0.08)", border: "1px solid rgba(245,177,76,0.2)", color: "#f5b14c" }}>
          + เพิ่มเกณฑ์
        </button>
        {criteria.length > 0 && (
          <button onClick={() => onChange([])}
            className="rounded-lg py-2 px-3 text-[12px] font-medium cursor-pointer transition-colors text-[#4a5a7a] hover:text-[#ff6b6b]"
            style={{ background: "#070c17", border: "1px solid rgba(255,255,255,0.06)" }}>
            ล้างทั้งหมด
          </button>
        )}
      </div>

      <div className="mt-3 pt-3 border-t border-white/[0.05] flex items-center gap-3 flex-wrap">
        <span className="text-[10px] text-[#2a3a50] uppercase tracking-[0.08em]">เกณฑ์ตัดสิน</span>
        {([["ดี", "#31c48d", "≥67%"], ["ปานกลาง", "#f5b14c", "34-66%"], ["ไม่ดี", "#ff6b6b", "<34%"]] as [string, string, string][]).map(([label, color, range]) => (
          <span key={label} className="flex items-center gap-1.5 text-[11px]">
            <span className="w-2 h-2 rounded-full" style={{ background: color }} />
            <span style={{ color }}>{label}</span>
            <span className="text-[#3d4f6a]">{range} คะแนน</span>
          </span>
        ))}
      </div>
    </motion.div>
  );
}

/* ── Delta badge ── */
function DeltaBadge({ main, cmp }: { main: number; cmp: number }) {
  if (!cmp) return null;
  const pct = ((main - cmp) / Math.abs(cmp)) * 100;
  if (!isFinite(pct)) return null;
  const pos = pct >= 0;
  return (
    <motion.span initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 25 }}
      className="inline-flex items-center text-[10px] font-bold ml-1.5 px-1 py-0.5 rounded"
      style={{ color: pos ? "#31c48d" : "#ff6b6b", background: pos ? "rgba(49,196,141,0.1)" : "rgba(255,107,107,0.1)" }}>
      {pos ? "▲" : "▼"}{Math.abs(pct).toFixed(1)}%
    </motion.span>
  );
}

/* ── Level table ── */
function LevelTable({ tab, rows, cols, totals, page, setPage, onToggle, compareRows, compareTotals, criteria }: {
  tab: TabKey; rows: Row[]; cols: Col[]; totals: Record<string, number>; page: number; setPage: (n: number) => void; onToggle: (id: string, next: boolean) => void;
  compareRows: Row[]; compareTotals: Record<string, number>; criteria: Criterion[];
}) {
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const p = Math.min(page, totalPages);
  const slice = rows.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE);
  const col1 = tab === "ad" ? "โฆษณา / คลิป" : tab === "adset" ? "ชื่อชุดโฆษณา" : "ชื่อแคมเปญ";
  const showScore = tab === "ad" && criteria.length > 0;

  const nameCell = (r: Row) => {
    if (tab === "campaign") return (
      <div>
        <div className="font-medium max-w-[320px] truncate text-[#c9d1e0]">{r.name}</div>
        <div className="text-[#3d4f6a] text-[11px] mt-0.5">{OBJ[r.objective] || r.objective || "-"}{r.dailyBudget ? ` · งบ ${baht(r.dailyBudget)}/วัน` : ""}</div>
      </div>
    );
    if (tab === "adset") return (
      <div>
        <div className="font-medium max-w-[320px] truncate text-[#c9d1e0]">{r.name}</div>
        <div className="text-[#3d4f6a] text-[11px] mt-0.5 max-w-[320px] truncate">{r.campaign}{r.dailyBudget ? ` · งบ ${baht(r.dailyBudget)}/วัน` : ""}</div>
      </div>
    );
    return (
      <div className="flex items-center gap-3">
        {r.thumb
          ? <img src={r.thumb} loading="lazy" referrerPolicy="no-referrer" alt="" width={46} height={46}
            className="w-[46px] h-[46px] rounded-xl object-cover border border-white/[0.06] flex-shrink-0"
            onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")} />
          : <div className="w-[46px] h-[46px] rounded-xl flex-shrink-0" style={{ background: "#070c17", border: "1px solid rgba(255,255,255,0.06)" }} />}
        <div>
          <div className="font-medium max-w-[300px] truncate text-[#c9d1e0] flex items-center gap-1.5">
            {r.name}
            {r.objectType === "VIDEO" && (
              <span className="text-[9px] font-bold border rounded px-1.5 py-0.5 flex-shrink-0" style={{ color: "#2d88ff", borderColor: "rgba(45,136,255,0.3)", background: "rgba(45,136,255,0.1)" }}>
                VIDEO
              </span>
            )}
          </div>
          <div className="text-[#3d4f6a] text-[11px] mt-0.5 max-w-[300px] truncate">{r.title || r.adset}</div>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={{ minWidth: 300 + cols.length * 110 + (showScore ? 90 : 0) }}>
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              <th className="text-left font-semibold px-4 py-3 text-[10px] uppercase tracking-[0.1em] text-[#2a3a50] whitespace-nowrap">เปิด/ปิด</th>
              <th className="text-left font-semibold px-4 py-3 text-[10px] uppercase tracking-[0.1em] text-[#2a3a50] whitespace-nowrap">{col1}</th>
              <th className="text-left font-semibold px-4 py-3 text-[10px] uppercase tracking-[0.1em] text-[#2a3a50] whitespace-nowrap">สถานะ</th>
              {showScore && <th className="text-left font-semibold px-4 py-3 text-[10px] uppercase tracking-[0.1em] text-[#2a3a50] whitespace-nowrap">วิเคราะห์</th>}
              {cols.map((c) => (
                <th key={c.k} className="text-right font-semibold px-4 py-3 text-[10px] uppercase tracking-[0.1em] text-[#2a3a50] whitespace-nowrap">{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.length ? slice.map((r) => {
              const on = r.status === "ACTIVE";
              const cr = compareRows.find((x) => x.id === r.id);
              return (
                <Fragment key={r.id}>
                  <tr className="group transition-colors duration-100" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>

                    {/* toggle */}
                    <td className="px-4 py-3">
                      <button onClick={() => onToggle(r.id, !on)} title={on ? "ปิดการใช้งาน" : "เปิดใช้งาน"}
                        className="relative w-9 h-5 rounded-full transition-all duration-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2d88ff] flex-shrink-0"
                        style={{ background: on ? "#31c48d" : "transparent", boxShadow: on ? "0 0 10px rgba(49,196,141,0.3)" : "none", border: on ? "none" : "1.5px solid rgba(255,255,255,0.18)" }}>
                        <motion.span initial={{ x: on ? 16 : 2 }} animate={{ x: on ? 16 : 2 }} transition={{ type: "spring", stiffness: 500, damping: 35 }}
                          className="absolute left-0 top-[3px] w-[14px] h-[14px] rounded-full bg-white shadow-sm" />
                      </button>
                    </td>

                    <td className="px-4 py-3 text-left">{nameCell(r)}</td>

                    {/* status */}
                    <td className="px-4 py-3">
                      <span className="text-[10px] px-2.5 py-1 rounded-full font-semibold"
                        style={{
                          color: on ? "#31c48d" : "#4a5a7a",
                          background: on ? "rgba(49,196,141,0.1)" : "rgba(255,255,255,0.04)",
                          border: `1px solid ${on ? "rgba(49,196,141,0.2)" : "rgba(255,255,255,0.06)"}`,
                        }}>
                        {on ? "ใช้งานอยู่" : "ปิดอยู่"}
                      </span>
                    </td>

                    {/* score badge */}
                    {showScore && (() => {
                      const score = scoreAd(r, criteria);
                      const cfg = score === "ดี"
                        ? { color: "#31c48d", bg: "rgba(49,196,141,0.12)", border: "rgba(49,196,141,0.25)" }
                        : score === "ปานกลาง"
                        ? { color: "#f5b14c", bg: "rgba(245,177,76,0.12)", border: "rgba(245,177,76,0.25)" }
                        : score === "ไม่ดี"
                        ? { color: "#ff6b6b", bg: "rgba(255,80,80,0.12)", border: "rgba(255,80,80,0.25)" }
                        : null;
                      return (
                        <td className="px-4 py-3">
                          {cfg && (
                            <span className="text-[10px] px-2.5 py-1 rounded-full font-bold whitespace-nowrap"
                              style={{ color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}` }}>
                              {score}
                            </span>
                          )}
                        </td>
                      );
                    })()}

                    {/* metric columns */}
                    {cols.map((c) => {
                      const v = Number(r[c.k]) || 0;
                      return (
                        <td key={c.k} className="px-4 py-3 text-right whitespace-nowrap metric-value text-[13px]"
                          style={{ color: v ? "#c9d1e0" : "#2a3a50" }}>
                          {fmtVal(c.fmt, v)}
                        </td>
                      );
                    })}
                  </tr>

                  {/* compare row */}
                  <AnimatePresence>
                    {compareRows.length > 0 && (
                      <motion.tr key={`${r.id}-cmp`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
                        style={{ borderBottom: "1px solid rgba(255,255,255,0.03)", background: "rgba(45,136,255,0.03)" }}>
                        <td className="px-4 py-2 border-l-2 border-[#2d88ff]/30" />
                        <td className="px-4 py-2 text-left text-[10px] text-[#2d4a6a] font-semibold italic">เปรียบเทียบ</td>
                        <td />
                        {showScore && <td />}
                        {cols.map((c) => {
                          const cv = Number(cr?.[c.k]) || 0;
                          const mv = Number(r[c.k]) || 0;
                          return (
                            <td key={c.k} className="px-4 py-2 text-right whitespace-nowrap text-[12px] metric-value" style={{ color: "#2d4a6a" }}>
                              {cv ? fmtVal(c.fmt, cv) : "—"}
                              {c.agg === "sum" && <DeltaBadge main={mv} cmp={cv} />}
                            </td>
                          );
                        })}
                      </motion.tr>
                    )}
                  </AnimatePresence>
                </Fragment>
              );
            }) : (
              <tr>
                <td colSpan={cols.length + 3 + (showScore ? 1 : 0)} className="py-16">
                  <div className="flex flex-col items-center gap-3 text-[#2a3a50]">
                    <IcoEmpty />
                    <span className="text-[13px]">ไม่มีข้อมูล</span>
                  </div>
                </td>
              </tr>
            )}
          </tbody>

          {/* footer totals */}
          <tfoot>
            <tr style={{ borderTop: "2px solid rgba(255,255,255,0.06)", background: "#0a0f1a" }}>
              <td className="px-4 py-3" />
              <td className="px-4 py-3 text-left text-[12px] font-semibold text-[#4a5a7a]">รวมทั้งหมด</td>
              <td className="px-4 py-3" />
              {showScore && <td className="px-4 py-3" />}
              {cols.map((c) => (
                <td key={c.k} className="px-4 py-3 text-right metric-value text-[13px] font-semibold text-[#c9d1e0]">{footVal(c, totals)}</td>
              ))}
            </tr>
            {Object.keys(compareTotals).length > 0 && (
              <tr style={{ background: "rgba(45,136,255,0.04)" }}>
                <td className="px-4 py-2.5 border-l-2 border-[#2d88ff]/30" />
                <td className="px-4 py-2.5 text-left text-[11px] font-semibold italic text-[#2d4a6a]">เปรียบเทียบ</td>
                <td />
                {showScore && <td />}
                {cols.map((c) => (
                  <td key={c.k} className="px-4 py-2.5 text-right text-[12px] metric-value text-[#2d4a6a]">
                    {footVal(c, compareTotals)}
                    {c.agg === "sum" && <DeltaBadge main={totals[c.k] || 0} cmp={compareTotals[c.k] || 0} />}
                  </td>
                ))}
              </tr>
            )}
          </tfoot>
        </table>
      </div>
      <Pager page={p} totalPages={totalPages} setPage={setPage} />
    </>
  );
}

/* ── Pagination ── */
function Pager({ page, totalPages, setPage }: { page: number; totalPages: number; setPage: (n: number) => void }) {
  return (
    <div className="flex items-center justify-end gap-2.5 px-5 py-3.5 border-t border-white/[0.05]">
      <span className="text-[#2a3a50] text-[12px]">หน้า <span className="text-[#7d8c9c] font-medium">{page}</span> / {totalPages}</span>
      <button disabled={page <= 1} onClick={() => setPage(page - 1)}
        className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-medium transition-all duration-150 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed min-h-[36px]"
        style={{ background: "#070c17", border: "1px solid rgba(255,255,255,0.06)", color: "#7d8c9c" }}
        onMouseEnter={e => { if (!e.currentTarget.disabled) { e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"; e.currentTarget.style.color = "#c9d1e0"; } }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = "#7d8c9c"; }}>
        <IcoChevronLeft /> ก่อนหน้า
      </button>
      <button disabled={page >= totalPages} onClick={() => setPage(page + 1)}
        className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-medium transition-all duration-150 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed min-h-[36px]"
        style={{ background: "#070c17", border: "1px solid rgba(255,255,255,0.06)", color: "#7d8c9c" }}
        onMouseEnter={e => { if (!e.currentTarget.disabled) { e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"; e.currentTarget.style.color = "#c9d1e0"; } }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = "#7d8c9c"; }}>
        ถัดไป <IcoChevronRight />
      </button>
    </div>
  );
}

/* ── Breakdown view ── */
function BreakdownView({ rows, dim, setDim, metric, setMetric }: {
  rows: Row[]; dim: string; setDim: (d: string) => void; metric: string; setMetric: (m: string) => void;
}) {
  const mInfo = BD_METRICS.find((m) => m[0] === metric)!;
  const fmtM = (v: number) => (v ? (mInfo[2] === "baht" ? baht(v) : num(v)) : "—");
  const max = Math.max(1, ...rows.map((r) => Number(r[metric]) || 0));
  const dimLabel = BD_DIMS.find((d) => d[0] === dim)![1];
  const label = (r: Row) => dim === "gender" ? (GENDER[r.key] || r.key) : dim === "day" ? String(r.key).slice(8) + "/" + String(r.key).slice(5, 7) : r.key || "ไม่ระบุ";

  const pillBtn = (active: boolean) => ({
    background: active ? "#2d88ff" : "#070c17",
    border: `1px solid ${active ? "rgba(45,136,255,0.8)" : "rgba(255,255,255,0.06)"}`,
    color: active ? "#fff" : "#4a5a7a",
    boxShadow: active ? "0 0 12px rgba(45,136,255,0.25)" : "none",
  } as React.CSSProperties);

  const table = (
    <div className="max-h-[560px] overflow-y-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
            <th className="text-left font-semibold px-4 py-3 text-[10px] uppercase tracking-[0.1em] text-[#2a3a50]">{dimLabel}</th>
            <th className="text-left font-semibold px-4 py-3 text-[10px] uppercase tracking-[0.1em] text-[#2a3a50] min-w-[160px]">{mInfo[1]}</th>
            <th className="text-right font-semibold px-4 py-3 text-[10px] uppercase tracking-[0.1em] text-[#2a3a50]">ใช้จ่าย</th>
            <th className="text-right font-semibold px-4 py-3 text-[10px] uppercase tracking-[0.1em] text-[#2a3a50]">Impr.</th>
            <th className="text-right font-semibold px-4 py-3 text-[10px] uppercase tracking-[0.1em] text-[#2a3a50]">Clicks</th>
          </tr>
        </thead>
        <tbody>
          {rows.length ? rows.map((r, i) => {
            const v = Number(r[metric]) || 0;
            const pct = (v / max) * 100;
            return (
              <tr key={i} className="transition-colors duration-100" style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                <td className="px-4 py-3 text-left text-[13px] text-[#c9d1e0]">{label(r)}</td>
                <td className="px-4 py-3 text-left relative">
                  <div className="absolute left-4 inset-y-2 rounded-md" style={{ width: `${pct}%`, background: "rgba(45,136,255,0.18)", transition: "width 0.4s ease" }} />
                  <span className="relative metric-value text-[13px] text-[#c9d1e0] pl-1">{fmtM(v)}</span>
                </td>
                <td className="px-4 py-3 text-right metric-value text-[13px] text-[#7d8c9c]">{fmtVal("baht", Number(r.spend) || 0)}</td>
                <td className="px-4 py-3 text-right metric-value text-[13px] text-[#7d8c9c]">{fmtVal("num", Number(r.impressions) || 0)}</td>
                <td className="px-4 py-3 text-right metric-value text-[13px] text-[#7d8c9c]">{fmtVal("num", Number(r.clicks) || 0)}</td>
              </tr>
            );
          }) : (
            <tr>
              <td colSpan={5} className="py-16">
                <div className="flex flex-col items-center gap-3 text-[#2a3a50]">
                  <IcoEmpty />
                  <span className="text-[13px]">ไม่มีข้อมูล</span>
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );

  return (
    <div>
      {/* filters */}
      <div className="flex gap-5 flex-wrap items-start px-5 py-4 border-b border-white/[0.05]">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[#2a3a50] text-[11px] uppercase tracking-[0.1em] font-semibold whitespace-nowrap">แยกตาม</span>
          <div className="flex gap-1.5 flex-wrap">
            {BD_DIMS.map(([k, l]) => (
              <button key={k} onClick={() => setDim(k)}
                className="px-3 py-1.5 rounded-full text-[12px] font-medium transition-all duration-150 cursor-pointer"
                style={pillBtn(dim === k)}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[#2a3a50] text-[11px] uppercase tracking-[0.1em] font-semibold whitespace-nowrap">วัดด้วย</span>
          <div className="flex gap-1.5 flex-wrap">
            {BD_METRICS.map(([k, l]) => (
              <button key={k} onClick={() => setMetric(k)}
                className="px-3 py-1.5 rounded-full text-[12px] font-medium transition-all duration-150 cursor-pointer"
                style={pillBtn(metric === k)}>
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* content */}
      {dim === "region" ? (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(380px,1fr)_1fr] gap-5 p-5">
          <div className="rounded-xl p-4 text-center" style={{ background: "#070c17", border: "1px solid rgba(255,255,255,0.05)" }}>
            <ThailandMap rows={rows} metricKey={metric} fmt={fmtM} />
            <div className="flex items-center gap-2.5 justify-center mt-3 text-[#3d4f6a] text-[11px]">
              <span>น้อย</span>
              <div className="w-36 h-2 rounded-full" style={{ background: "linear-gradient(90deg, #1a2640, #ff3b3b)" }} />
              <span>มาก</span>
              <span className="ml-1 text-[#2a3a50]">({mInfo[1]})</span>
            </div>
          </div>
          {table}
        </div>
      ) : (
        <div className="p-5">{table}</div>
      )}
    </div>
  );
}
