"use client";
import React, { useState, useRef, useMemo, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ─── Types ────────────────────────────────────────────────────
type Acct = { id: string; name: string; active: boolean };
type DailyRow = {
  date: string; dateStr: string;
  spend: number; revenue: number;
  messages: number; orders: number; newAccounts: number; roas: number;
  conversions: number; costPerConv: number;
  aov: number; closeRate: number;
};
type SeriesDef = {
  key: keyof DailyRow; label: string; color: string; fmt: (n: number) => string;
};
type CardDef = {
  key: string; label: string; color: string;
  Icon: () => React.ReactElement;
  chartKey: keyof DailyRow;
  chartFmt: (n: number) => string;
  getValue: (s: Stats) => { value: string; sub1: string; sub2: string };
};
type Stats = {
  roas: number; avgRoas: number;
  totalSpend: number; avgSpend: number;
  totalRevenue: number; avgRevenue: number;
  totalMessages: number; avgMessages: number;
  totalOrders: number; avgOrders: number; costPerOrder: number;
  totalNewAccounts: number; avgNewAccounts: number;
  totalConversions: number; costPerConv: number; convRate: number;
  aov: number; closeRate: number;
};
type ReportData = { daily: DailyRow[]; stats: Stats };

// ─── Format helpers ───────────────────────────────────────────
const baht = (n: number) =>
  n >= 1e6 ? `฿${(n / 1e6).toFixed(1)}M`
  : n >= 1e3 ? `฿${(n / 1e3).toFixed(1)}k`
  : `฿${n.toLocaleString()}`;
const cnt = (n: number) =>
  n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : n.toLocaleString();

// ─── SVG Icons ────────────────────────────────────────────────
function IcoRoas() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1,13 5.5,8 9.5,10 15,3.5" />
      <path d="M12 3.5h3v3" />
    </svg>
  );
}
function IcoSpend() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1.5" y="4.5" width="13" height="9" rx="1.5" />
      <path d="M1.5 7.5h13M5.5 4.5V3a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1.5" />
      <circle cx="8" cy="10" r="1.5" />
    </svg>
  );
}
function IcoMsg() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 9a2 2 0 0 1-2 2H5l-3 3V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v5z" />
    </svg>
  );
}
function IcoCost() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 1.5L1.5 14.5h13L8 1.5z" />
      <path d="M8 7v3.5M8 12.5h.01" />
    </svg>
  );
}
function IcoConv() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="6.5" />
      <path d="M5.5 8.5l2 2L11 6" />
    </svg>
  );
}
function IcoOrder() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 2h1.5l2 8h7l1.5-5H5" />
      <circle cx="7" cy="13" r="1" />
      <circle cx="12" cy="13" r="1" />
    </svg>
  );
}
function IcoNewAcct() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7" cy="5.5" r="3" />
      <path d="M1 14c0-3 2.5-5 6-5" />
      <path d="M12 10v4M10 12h4" />
    </svg>
  );
}
function IcoAov() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7.5 1.5H2.5v5l7 7 5-5-7-7z" />
      <circle cx="5" cy="4" r="1" />
    </svg>
  );
}
function IcoClose() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="6.5" />
      <circle cx="8" cy="8" r="3" />
      <circle cx="8" cy="8" r="0.4" fill="currentColor" stroke="none" />
    </svg>
  );
}
function IcoRevenue() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1,12 5.5,7 9.5,9.5 15,3" />
      <path d="M11 3h4v4" />
    </svg>
  );
}
function IcoChevron() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M3 4.5L6 7.5L9 4.5" />
    </svg>
  );
}
function IcoCal() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3.5" width="12" height="11" rx="2" />
      <path d="M5 1.5v4M11 1.5v4M2 7.5h12" />
    </svg>
  );
}

// ─── Date helpers ─────────────────────────────────────────────
const MONTH_TH = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
const MONTH_SHORT = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
const DOW_TH = ["อา","จ","อ","พ","พฤ","ศ","ส"];

function fmtDateTH(s: string) {
  const [, m, d] = s.split("-");
  return `${parseInt(d)} ${MONTH_SHORT[parseInt(m) - 1]}`;
}

// ─── Calendar Date-Range Picker ───────────────────────────────
function CalendarPicker({ onSelect, onClose }: {
  onSelect: (since: string, until: string) => void;
  onClose: () => void;
}) {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
  const [viewY, setViewY] = useState(today.getFullYear());
  const [viewM, setViewM] = useState(today.getMonth());
  const [start, setStart] = useState<string|null>(null);
  const [hover, setHover] = useState<string|null>(null);

  function ds(d: number) {
    return `${viewY}-${String(viewM+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
  }

  const firstDOW = new Date(viewY, viewM, 1).getDay();
  const daysInMonth = new Date(viewY, viewM+1, 0).getDate();
  const cells: (number|null)[] = [
    ...Array(firstDOW).fill(null),
    ...Array.from({length: daysInMonth}, (_, i) => i+1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const endHover = start && hover ? hover : null;
  const loStr = start && endHover ? (start <= endHover ? start : endHover) : start;
  const hiStr = start && endHover ? (start <= endHover ? endHover : start) : null;

  function handleDay(d: number) {
    const s = ds(d);
    if (s > todayStr) return;
    if (!start) { setStart(s); return; }
    const since = start <= s ? start : s;
    const until = start <= s ? s : start;
    onSelect(since, until);
  }

  const atMax = viewY > today.getFullYear() || (viewY === today.getFullYear() && viewM >= today.getMonth());
  function prevM() { if (viewM===0){setViewY(y=>y-1);setViewM(11);}else setViewM(m=>m-1); }
  function nextM() { if (!atMax){ if (viewM===11){setViewY(y=>y+1);setViewM(0);}else setViewM(m=>m+1); }}

  return (
    <motion.div
      initial={{ opacity: 0, y: -8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.97 }}
      transition={{ duration: 0.15 }}
      onClick={e => e.stopPropagation()}
      className="absolute right-0 top-full mt-2 z-50 select-none"
      style={{
        background: "#0c1220", border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 16, padding: "14px 16px",
        boxShadow: "0 24px 64px rgba(0,0,0,0.8)", width: 286,
      }}
    >
      {/* Month nav */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={prevM}
          className="w-7 h-7 flex items-center justify-center rounded-lg cursor-pointer transition-colors"
          style={{ color: "#4a5a7a", background: "rgba(255,255,255,0.05)", fontSize: 18, lineHeight: 1 }}>
          ‹
        </button>
        <span className="text-[13px] font-semibold text-[#c9d1e0]">{MONTH_TH[viewM]} {viewY}</span>
        <button onClick={nextM}
          className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
          style={{
            color: atMax ? "#1e2e48" : "#4a5a7a",
            background: "rgba(255,255,255,0.05)", fontSize: 18, lineHeight: 1,
            cursor: atMax ? "default" : "pointer",
          }}>
          ›
        </button>
      </div>

      {/* DOW headers */}
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {DOW_TH.map(d => (
          <div key={d} className="text-center text-[10px] py-1" style={{ color: "#2a3a5a" }}>{d}</div>
        ))}
      </div>

      {/* Days */}
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const s = ds(day);
          const isFuture = s > todayStr;
          const isLo = s === loStr;
          const isHi = hiStr && s === hiStr;
          const inR = loStr && hiStr && s > loStr && s < hiStr;
          const isToday = s === todayStr;
          const selected = isLo || isHi;
          return (
            <button
              key={i}
              disabled={isFuture}
              onMouseEnter={() => start && setHover(s)}
              onMouseLeave={() => setHover(null)}
              onClick={() => handleDay(day)}
              className="metric-value text-[11.5px] h-8 flex items-center justify-center transition-all"
              style={{
                borderRadius: inR ? 3 : 8,
                background: selected ? "#2d88ff" : inR ? "rgba(45,136,255,0.13)" : "transparent",
                color: selected ? "#fff" : isFuture ? "#1a2540" : isToday ? "#2d88ff" : "#8a9aba",
                fontWeight: selected || isToday ? 700 : 400,
                border: isToday && !selected ? "1px solid rgba(45,136,255,0.32)" : "1px solid transparent",
                cursor: isFuture ? "not-allowed" : "pointer",
              }}
            >
              {day}
            </button>
          );
        })}
      </div>

      <div className="mt-3 text-center text-[11px]" style={{ color: "#2a3a5a" }}>
        {!start ? "เลือกวันเริ่มต้น" : "เลือกวันสิ้นสุด"}
      </div>
    </motion.div>
  );
}

// ─── Stat card definitions ─────────────────────────────────────
const STAT_CARDS: CardDef[] = [
  {
    key: "spend", label: "ค่าโฆษณา", color: "#2d88ff", Icon: IcoSpend,
    chartKey: "spend", chartFmt: baht,
    getValue: (s) => ({ value: baht(s.totalSpend), sub1: "เฉลี่ย", sub2: `${baht(s.avgSpend)} / วัน` }),
  },
  {
    key: "roas", label: "ROAS", color: "#31c48d", Icon: IcoRoas,
    chartKey: "roas", chartFmt: (n) => `${n.toFixed(2)}x`,
    getValue: (s) => ({ value: `${s.roas.toFixed(2)}x`, sub1: "เฉลี่ย", sub2: `${s.avgRoas.toFixed(1)}x / วัน` }),
  },
  {
    key: "orders", label: "ออเดอร์", color: "#ff6b6b", Icon: IcoOrder,
    chartKey: "orders", chartFmt: cnt,
    getValue: (s) => ({ value: cnt(s.totalOrders), sub1: "ต้นทุน / ออเดอร์", sub2: baht(s.costPerOrder) }),
  },
  {
    key: "revenue", label: "ยอดขาย", color: "#f59e0b", Icon: IcoRevenue,
    chartKey: "revenue", chartFmt: baht,
    getValue: (s) => ({ value: baht(s.totalRevenue), sub1: "เฉลี่ย", sub2: `${baht(s.avgRevenue)} / วัน` }),
  },
  {
    key: "messages", label: "ลูกค้าทัก", color: "#f5b14c", Icon: IcoMsg,
    chartKey: "messages", chartFmt: cnt,
    getValue: (s) => ({ value: cnt(s.totalMessages), sub1: "เฉลี่ย", sub2: `${Math.round(s.avgMessages)} ราย / วัน` }),
  },
  {
    key: "closeRate", label: "% ปิด", color: "#ec4899", Icon: IcoClose,
    chartKey: "closeRate", chartFmt: (n) => `${(n * 100).toFixed(1)}%`,
    getValue: (s) => ({ value: `${(s.closeRate * 100).toFixed(1)}%`, sub1: "ปิดการขาย", sub2: `${cnt(s.totalOrders)} / ${cnt(s.totalMessages)}` }),
  },
  {
    key: "aov", label: "AOV", color: "#a78bfa", Icon: IcoAov,
    chartKey: "aov", chartFmt: baht,
    getValue: (s) => ({ value: baht(s.aov), sub1: "ต่อออเดอร์", sub2: `${cnt(s.totalOrders)} ออเดอร์` }),
  },
  {
    key: "newCustomers", label: "ลูกค้าใหม่", color: "#14b8a6", Icon: IcoNewAcct,
    chartKey: "newAccounts", chartFmt: cnt,
    getValue: (s) => ({ value: cnt(s.totalNewAccounts), sub1: "เฉลี่ย", sub2: `${Math.round(s.avgNewAccounts)} ราย / วัน` }),
  },
  {
    key: "costPerConv", label: "ต้นทุน / หัก", color: "#f97316", Icon: IcoCost,
    chartKey: "costPerConv", chartFmt: baht,
    getValue: (s) => ({ value: baht(s.costPerConv), sub1: "Conversion รวม", sub2: `${s.totalConversions.toLocaleString()} ครั้ง` }),
  },
  {
    key: "conversion", label: "Conversion", color: "#06b6d4", Icon: IcoConv,
    chartKey: "conversions", chartFmt: cnt,
    getValue: (s) => ({ value: cnt(s.totalConversions), sub1: "อัตรา Conv.", sub2: `${(s.convRate * 100).toFixed(1)}%` }),
  },
];

function smoothPath(pts: { x: number; y: number }[]) {
  if (pts.length < 2) return "";
  let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1], c = pts[i];
    const cpx = ((p.x + c.x) / 2).toFixed(2);
    d += ` C ${cpx} ${p.y.toFixed(2)}, ${cpx} ${c.y.toFixed(2)}, ${c.x.toFixed(2)} ${c.y.toFixed(2)}`;
  }
  return d;
}

// ─── Trend Chart ─────────────────────────────────────────────
function TrendChart({ data, series }: { data: DailyRow[]; series: SeriesDef[] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const VW = 1000, VH = 260;
  const PAD = { t: 18, r: 20, b: 38, l: 20 };
  const CW = VW - PAD.l - PAD.r;
  const CH = VH - PAD.t - PAD.b;
  const n = data.length;

  const normalized = useMemo(() =>
    series.map(s => {
      const vals = data.map(d => d[s.key] as number);
      const mn = Math.min(...vals), mx = Math.max(...vals);
      const range = mx - mn || 1;
      return vals.map(v => (v - mn) / range);
    }),
  [data]);

  const paths = useMemo(() =>
    normalized.map(vals =>
      vals.map((v, i) => ({
        x: PAD.l + (n > 1 ? i / (n - 1) : 0.5) * CW,
        y: PAD.t + (1 - v) * CH,
      }))
    ),
  [normalized, n]);

  function areaPath(pts: { x: number; y: number }[]) {
    const bot = PAD.t + CH;
    return `${smoothPath(pts)} L ${pts[n - 1].x.toFixed(2)} ${bot} L ${pts[0].x.toFixed(2)} ${bot} Z`;
  }

  const gridYs = [0, 0.25, 0.5, 0.75, 1].map(t => PAD.t + (1 - t) * CH);
  const tickStep = Math.max(1, Math.ceil(n / 8));
  const xTicks = data.map((d, i) => ({ i, d })).filter(({ i }) => i % tickStep === 0 || i === n - 1);

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * VW;
    const raw = Math.round(((svgX - PAD.l) / CW) * (n - 1));
    setHoverIdx(Math.max(0, Math.min(n - 1, raw)));
  }

  const hoverX = hoverIdx !== null
    ? PAD.l + (n > 1 ? hoverIdx / (n - 1) : 0.5) * CW
    : null;
  const tooltipPct = hoverX != null
    ? Math.min(Math.max(8, (hoverX / VW) * 100), 74)
    : 50;

  if (n === 0) {
    return (
      <div className="flex items-center justify-center h-[260px] text-[13px] text-[#3a4a6a]">
        ไม่มีข้อมูลในช่วงเวลานี้
      </div>
    );
  }

  return (
    <div className="relative">
      {hoverIdx !== null && (
        <div className="absolute pointer-events-none z-20"
          style={{ top: 10, left: `${tooltipPct}%`, transform: "translateX(-50%)" }}>
          <div style={{
            background: "#070c17", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 8, padding: "8px 12px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.6)", minWidth: 150,
          }}>
            <div className="metric-value text-[10px] text-[#3a4a6a] mb-2">{data[hoverIdx].dateStr}</div>
            {series.map(s => (
              <div key={s.key} className="flex items-center justify-between gap-5 mb-1 last:mb-0">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
                  <span className="text-[11px] text-[#5a6a8a]">{s.label}</span>
                </div>
                <span className="metric-value text-[12px] font-semibold" style={{ color: s.color }}>
                  {s.fmt(data[hoverIdx][s.key] as number)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <svg ref={svgRef} viewBox={`0 0 ${VW} ${VH}`} className="w-full"
        style={{ display: "block" }} onMouseMove={onMove} onMouseLeave={() => setHoverIdx(null)}>
        <defs>
          {series.map(s => (
            <linearGradient key={s.key} id={`ga-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.16" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0.01" />
            </linearGradient>
          ))}
          <clipPath id="cc-trend">
            <rect x={PAD.l} y={PAD.t} width={CW} height={CH} />
          </clipPath>
        </defs>

        {gridYs.map((y, i) => (
          <line key={i} x1={PAD.l} y1={y} x2={PAD.l + CW} y2={y}
            stroke="rgba(255,255,255,0.045)" strokeWidth="1" />
        ))}

        {xTicks.map(({ i, d }) => {
          const x = PAD.l + (n > 1 ? i / (n - 1) : 0.5) * CW;
          return (
            <text key={i} x={x} y={VH - 7} textAnchor="middle" fill="#283650"
              fontSize="9.5" fontFamily="'Fira Code', monospace">
              {d.dateStr}
            </text>
          );
        })}

        <g clipPath="url(#cc-trend)">
          {paths.map((pts, si) => (
            <g key={series[si].key}>
              <path d={areaPath(pts)} fill={`url(#ga-${series[si].key})`} />
              <motion.path
                key={`${series[si].key}-${n}`}
                d={smoothPath(pts)}
                fill="none" stroke={series[si].color} strokeWidth="2" strokeLinecap="round"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 1.15, delay: si * 0.13, ease: [0.16, 1, 0.3, 1] }}
              />
            </g>
          ))}
        </g>

        {hoverIdx !== null && hoverX !== null && (
          <g>
            <line x1={hoverX} y1={PAD.t} x2={hoverX} y2={PAD.t + CH}
              stroke="rgba(255,255,255,0.1)" strokeWidth="1" strokeDasharray="3 4" />
            {paths.map((pts, si) => (
              <g key={si}>
                <circle cx={pts[hoverIdx].x} cy={pts[hoverIdx].y} r="6"
                  fill={series[si].color} fillOpacity="0.15" />
                <circle cx={pts[hoverIdx].x} cy={pts[hoverIdx].y} r="3.5"
                  fill={series[si].color} stroke="#0c1220" strokeWidth="1.5" />
              </g>
            ))}
          </g>
        )}
      </svg>
    </div>
  );
}

// ─── Account Breakdown (แยกตามบัญชีโฆษณา) ─────────────────────
type AcctBreakRow = {
  id: string; name: string; active: boolean;
  spend: number; share: number; messaging: number; orders: number;
  roas: number; cpi: number; costPerOrder: number;
};

function AccountBreakdown({ period, dateRange, page }: {
  period: PK; dateRange: { since: string; until: string } | null; page: string;
}) {
  const [rows, setRows] = useState<AcctBreakRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr(null);
    const pageQ = page ? `&page=${page}` : "";
    const url = dateRange
      ? `/api/account-breakdown?preset=custom&since=${dateRange.since}&until=${dateRange.until}${pageQ}`
      : `/api/account-breakdown?preset=${period}${pageQ}`;
    fetch(url)
      .then(r => r.json())
      .then(j => {
        if (!alive) return;
        if (j.error) throw new Error(j.error);
        setRows((j.rows as AcctBreakRow[]).filter(r => r.spend > 0));
      })
      .catch(e => { if (alive) setErr(e.message || "โหลดข้อมูลไม่สำเร็จ"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [period, dateRange, page]);

  const COLS = [
    { label: "ค่าโฆษณา", align: "right" as const },
    { label: "%", align: "right" as const },
    { label: "ทัก", align: "right" as const },
    { label: "CPI", align: "right" as const },
    { label: "ออเดอร์", align: "right" as const },
    { label: "ROAS", align: "right" as const },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4, duration: 0.48, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-xl overflow-hidden mt-3"
      style={{ background: "#0c1220", border: "1px solid rgba(255,255,255,0.06)" }}>
      <div className="flex items-center justify-between px-5 pt-4 pb-3"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
        <div>
          <div className="text-[13px] font-semibold text-[#c9d1e0] tracking-tight">แยกตามบัญชีโฆษณา</div>
          <div className="text-[11px] text-[#3a4a6a] mt-0.5">ทุกบัญชี · เรียงตามค่าโฆษณา</div>
        </div>
      </div>

      {/* Header row */}
      <div className="grid items-center px-5 py-2.5 text-[10px] uppercase tracking-wide text-[#2a3a5a]"
        style={{ gridTemplateColumns: "minmax(0,1fr) repeat(6, 88px)", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
        <span>ชื่อ</span>
        {COLS.map(c => <span key={c.label} className="text-right">{c.label}</span>)}
      </div>

      {err && (
        <div className="px-5 py-4 text-[12px] text-[#ff6b6b]">{err}</div>
      )}

      {loading && (
        <div className="px-5 py-3 flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-9 rounded-lg skeleton" />
          ))}
        </div>
      )}

      {!loading && !err && rows && rows.length === 0 && (
        <div className="px-5 py-6 text-center text-[12px] text-[#3a4a6a]">ไม่มีข้อมูลในช่วงเวลานี้</div>
      )}

      {!loading && !err && rows && rows.map((r, i) => (
        <motion.div
          key={r.id}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: Math.min(i * 0.035, 0.4), duration: 0.3 }}
          className="relative grid items-center px-5 py-2.5 text-[12px]"
          style={{
            gridTemplateColumns: "minmax(0,1fr) repeat(6, 88px)",
            borderBottom: "1px solid rgba(255,255,255,0.03)",
          }}>
          {/* Spend-share bar */}
          <div className="absolute inset-y-0 left-0 pointer-events-none"
            style={{ width: `${Math.max(2, r.share * 100)}%`, background: "linear-gradient(90deg, rgba(45,136,255,0.10), rgba(45,136,255,0.01))" }} />
          {/* Name */}
          <div className="relative flex items-center gap-2 min-w-0 pr-3">
            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ background: r.active ? "#31c48d" : "#3a4a6a" }} />
            <span className="truncate text-[#c9d1e0]">{r.name}</span>
          </div>
          {/* Spend */}
          <span className="relative metric-value text-right font-semibold text-[#e8eaf5]">{baht(r.spend)}</span>
          {/* % */}
          <span className="relative metric-value text-right text-[#5b6cff]">{(r.share * 100).toFixed(1)}%</span>
          {/* Chats */}
          <span className="relative metric-value text-right text-[#f5b14c]">{cnt(r.messaging)}</span>
          {/* CPI */}
          <span className="relative metric-value text-right text-[#8a9aba]">{r.cpi ? baht(r.cpi) : "—"}</span>
          {/* Orders */}
          <span className="relative metric-value text-right text-[#ff6b6b]">{r.orders ? cnt(r.orders) : "—"}</span>
          {/* ROAS */}
          <span className="relative metric-value text-right" style={{ color: r.roas ? "#31c48d" : "#3a4a6a" }}>
            {r.roas ? `${r.roas.toFixed(2)}x` : "—"}
          </span>
        </motion.div>
      ))}
    </motion.div>
  );
}

// ─── Skeleton cards ───────────────────────────────────────────
function StatSkeleton({ big }: { big?: boolean }) {
  return (
    <div className={`relative overflow-hidden rounded-xl flex flex-col gap-3 ${big ? "p-5" : "p-3.5"}`}
      style={{ background: "#0c1220", border: "1px solid rgba(255,255,255,0.06)" }}>
      <div className="absolute inset-x-0 top-0 h-[2px] rounded-t-xl skeleton" />
      <div className="flex items-center gap-2">
        <div className={`rounded-lg skeleton flex-shrink-0 ${big ? "w-8 h-8" : "w-6 h-6"}`} />
        <div className="w-20 h-3 rounded skeleton" />
      </div>
      <div className={`rounded skeleton ${big ? "w-36 h-9" : "w-24 h-6"}`} />
      <div className="w-32 h-2.5 rounded skeleton mt-auto" />
    </div>
  );
}

// ─── Periods ─────────────────────────────────────────────────
const PERIODS = [
  { k: "last_7d",   label: "7 วัน"    },
  { k: "last_30d",  label: "30 วัน"   },
  { k: "this_month", label: "เดือนนี้" },
] as const;
type PK = (typeof PERIODS)[number]["k"];

// ─── Page ─────────────────────────────────────────────────────
export default function ReportAdsPage() {
  const [accounts, setAccounts] = useState<Acct[]>([]);
  const [hiddenAccts, setHiddenAccts] = useState<string[]>([]);
  const [act, setAct] = useState("");
  const [period, setPeriod] = useState<PK>("last_30d");
  const [dateRange, setDateRange] = useState<{ since: string; until: string } | null>(null);
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acctOpen, setAcctOpen] = useState(false);
  const [calOpen, setCalOpen] = useState(false);
  const [pages, setPages] = useState<{ id: string; name: string }[]>([]);
  const [pagesLoading, setPagesLoading] = useState(false);
  const [pageFilter, setPageFilter] = useState(""); // "" = all pages
  const [hiddenPages, setHiddenPages] = useState<string[]>([]);
  const [selectedCards, setSelectedCards] = useState<Set<string>>(
    new Set(["spend", "roas", "orders", "revenue"])
  );

  function toggleCard(key: string) {
    setSelectedCards(prev => {
      const next = new Set(prev);
      if (next.has(key)) { if (next.size > 1) next.delete(key); }
      else next.add(key);
      return next;
    });
  }

  const chartSeries: SeriesDef[] = STAT_CARDS
    .filter(c => selectedCards.has(c.key))
    .map(c => ({ key: c.chartKey, label: c.label, color: c.color, fmt: c.chartFmt }));

  // Load accounts once (respecting hidden-accounts setting for the default selection)
  useEffect(() => {
    let hidden: string[] = [];
    try { const h = JSON.parse(localStorage.getItem("adsHiddenAccounts") || "[]"); if (Array.isArray(h)) { hidden = h; setHiddenAccts(h); } } catch {}
    fetch("/api/accounts")
      .then(r => r.json())
      .then((list: Acct[]) => {
        setAccounts(list);
        const pool = list.filter(a => !hidden.includes(a.id));
        const visible = pool.length ? pool : list;
        if (visible.length > 0) setAct(visible[0].id);
      })
      .catch(() => {});
  }, []);

  // hidden pages from Workspace Settings
  useEffect(() => {
    try { const p = JSON.parse(localStorage.getItem("adsHiddenPages") || "[]"); if (Array.isArray(p)) setHiddenPages(p); } catch {}
  }, []);
  useEffect(() => { if (pageFilter && hiddenPages.includes(pageFilter)) setPageFilter(""); }, [hiddenPages, pageFilter]);

  // Load pages for the selected account (for the เพจ filter); reset filter when account changes
  useEffect(() => {
    if (!act) return;
    let alive = true;
    setPageFilter("");
    setPages([]);
    setPagesLoading(true);
    fetch(`/api/pages?act=${act}`)
      .then(r => r.json())
      .then((list) => { if (alive && Array.isArray(list)) setPages(list); })
      .catch(() => {})
      .finally(() => { if (alive) setPagesLoading(false); });
    return () => { alive = false; };
  }, [act]);

  // Fetch report data when act or period changes
  const fetchData = useCallback(async () => {
    if (!act) return;
    setLoading(true);
    setError(null);
    try {
      const pageQ = pageFilter ? `&page=${pageFilter}` : "";
      const url = dateRange
        ? `/api/report-ads?act=${act}&preset=custom&since=${dateRange.since}&until=${dateRange.until}${pageQ}`
        : `/api/report-ads?act=${act}&preset=${period}${pageQ}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
    } catch (e: any) {
      setError(e.message || "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [act, period, dateRange, pageFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const acctName = act === "all" ? "ทุกบัญชี" : (accounts.find(a => a.id === act)?.name || act);
  const visibleAccts = hiddenAccts.length === accounts.length ? accounts : accounts.filter(a => !hiddenAccts.includes(a.id));

  return (
    <div className="min-h-screen p-6" style={{ background: "#060a12" }}
      onClick={() => { if (acctOpen) setAcctOpen(false); if (calOpen) setCalOpen(false); }}>

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <div className="mr-auto">
          <h1 className="text-[17px] font-bold text-[#e8eaf5] tracking-tight">Report Ads</h1>
          <p className="text-[12px] text-[#3a4a6a] mt-0.5">รายงานประสิทธิภาพโฆษณา</p>
        </div>

        {/* Account selector */}
        {accounts.length > 0 && (
          <div className="relative">
            <button
              onClick={e => { e.stopPropagation(); setAcctOpen(o => !o); }}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] font-medium transition-colors cursor-pointer"
              style={{
                background: "#0c1220", border: "1px solid rgba(255,255,255,0.08)",
                color: "#c9d1e0", maxWidth: 220,
              }}
            >
              <span className="truncate">{acctName}</span>
              <motion.div animate={{ rotate: acctOpen ? 180 : 0 }} transition={{ duration: 0.18 }}>
                <IcoChevron />
              </motion.div>
            </button>

            <AnimatePresence>
              {acctOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.97 }}
                  transition={{ duration: 0.14 }}
                  className="absolute right-0 top-full mt-1.5 z-50 rounded-xl overflow-hidden"
                  style={{
                    background: "#0c1220", border: "1px solid rgba(255,255,255,0.1)",
                    boxShadow: "0 16px 48px rgba(0,0,0,0.7)", minWidth: 200, maxWidth: 300,
                  }}
                  onClick={e => e.stopPropagation()}
                >
                  {/* All accounts (merged) */}
                  <button
                    onClick={() => { setAct("all"); setAcctOpen(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-[12px] font-medium transition-colors cursor-pointer"
                    style={{
                      background: act === "all" ? "rgba(45,136,255,0.08)" : "transparent",
                      color: act === "all" ? "#2d88ff" : "#c9d1e0",
                      borderBottom: "1px solid rgba(255,255,255,0.08)",
                    }}
                    onMouseEnter={e => { if (act !== "all") (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = act === "all" ? "rgba(45,136,255,0.08)" : "transparent"; }}
                  >
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="1.5" y="1.5" width="6" height="6" rx="1.5" />
                      <rect x="8.5" y="1.5" width="6" height="6" rx="1.5" />
                      <rect x="1.5" y="8.5" width="6" height="6" rx="1.5" />
                      <rect x="8.5" y="8.5" width="6" height="6" rx="1.5" />
                    </svg>
                    <span className="truncate">ทุกบัญชี</span>
                    <span className="ml-auto text-[10px]" style={{ color: act === "all" ? "#2d88ff" : "#3a4a6a" }}>{visibleAccts.length} บัญชี</span>
                  </button>
                  {visibleAccts.map(a => (
                    <button key={a.id}
                      onClick={() => { setAct(a.id); setAcctOpen(false); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-[12px] transition-colors cursor-pointer"
                      style={{
                        background: a.id === act ? "rgba(45,136,255,0.08)" : "transparent",
                        color: a.id === act ? "#2d88ff" : "#8a9aba",
                        borderBottom: "1px solid rgba(255,255,255,0.04)",
                      }}
                      onMouseEnter={e => { if (a.id !== act) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = a.id === act ? "rgba(45,136,255,0.08)" : "transparent"; }}
                    >
                      <div className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ background: a.active ? "#31c48d" : "#3a4a6a" }} />
                      <span className="truncate">{a.name}</span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Page filter */}
        <div className="relative">
          <select
            value={pageFilter}
            onChange={e => setPageFilter(e.target.value)}
            disabled={pagesLoading}
            className="appearance-none px-3 py-2 pr-8 rounded-lg text-[12px] font-medium cursor-pointer outline-none"
            style={{
              background: pageFilter ? "rgba(245,177,76,0.1)" : "#0c1220",
              border: pageFilter ? "1px solid rgba(245,177,76,0.32)" : "1px solid rgba(255,255,255,0.08)",
              color: pageFilter ? "#f5b14c" : "#c9d1e0", maxWidth: 200,
              opacity: pagesLoading ? 0.6 : 1, cursor: pagesLoading ? "wait" : "pointer",
            }}
            title="กรองตามเพจ"
          >
            <option value="">{pagesLoading ? "กำลังโหลดเพจ…" : "ทุกเพจ"}</option>
            {pages.filter(p => !hiddenPages.includes(p.id)).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2"
            style={{ color: pageFilter ? "#f5b14c" : "#3a4a6a" }}>
            <IcoChevron />
          </div>
        </div>

        {/* Period pills */}
        <div className="flex items-center gap-1 p-1 rounded-xl"
          style={{ background: "#0c1220", border: "1px solid rgba(255,255,255,0.06)" }}>
          {PERIODS.map(p => (
            <button key={p.k} onClick={() => { setPeriod(p.k); setDateRange(null); }}
              className="relative px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all cursor-pointer"
              style={{ color: !dateRange && period === p.k ? "#5b6cff" : "#3a4a6a", background: "transparent" }}>
              {!dateRange && period === p.k && (
                <motion.div layoutId="period-bg" className="absolute inset-0 rounded-lg"
                  style={{ background: "rgba(91,108,255,0.12)", border: "1px solid rgba(91,108,255,0.22)" }}
                  transition={{ type: "spring", stiffness: 500, damping: 36 }} />
              )}
              <span className="relative">{p.label}</span>
            </button>
          ))}
        </div>

        {/* Calendar / Custom date range */}
        <div className="relative">
          <button
            onClick={e => { e.stopPropagation(); setCalOpen(o => !o); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-medium transition-all cursor-pointer"
            style={{
              background: dateRange ? "rgba(45,136,255,0.1)" : "#0c1220",
              border: dateRange ? "1px solid rgba(45,136,255,0.28)" : "1px solid rgba(255,255,255,0.06)",
              color: dateRange ? "#2d88ff" : "#3a4a6a",
            }}
          >
            <IcoCal />
            {dateRange ? (
              <span className="metric-value text-[11px] tracking-tight">
                {fmtDateTH(dateRange.since)} — {fmtDateTH(dateRange.until)}
              </span>
            ) : (
              <span>กำหนดเอง</span>
            )}
            {dateRange && (
              <span
                onClick={e => { e.stopPropagation(); setDateRange(null); setCalOpen(false); }}
                className="ml-0.5 flex items-center justify-center w-4 h-4 rounded-full cursor-pointer transition-colors"
                style={{ background: "rgba(45,136,255,0.2)", color: "#2d88ff", fontSize: 13, lineHeight: 1 }}
              >×</span>
            )}
          </button>
          <AnimatePresence>
            {calOpen && (
              <CalendarPicker
                onSelect={(since, until) => { setDateRange({ since, until }); setCalOpen(false); }}
                onClose={() => setCalOpen(false)}
              />
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Error ────────────────────────────────────────────── */}
      {error && (
        <div className="mb-5 px-4 py-3 rounded-xl text-[12px] flex items-center gap-2"
          style={{ background: "rgba(255,107,107,0.08)", border: "1px solid rgba(255,107,107,0.2)", color: "#ff6b6b" }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <circle cx="7" cy="7" r="6" /><path d="M7 4.5v3M7 9.5h.01" />
          </svg>
          {error}
        </div>
      )}

      {/* ── Top 4 Hero Cards ───────────────────────────────── */}
      <div className="grid grid-cols-4 gap-3 mb-3">
        {loading || !data
          ? Array.from({ length: 4 }).map((_, i) => <StatSkeleton key={i} big />)
          : STAT_CARDS.slice(0, 4).map((card, ci) => {
              const { value, sub1, sub2 } = card.getValue(data.stats);
              const { Icon } = card;
              const active = selectedCards.has(card.key);
              return (
                <motion.div key={card.key}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: ci * 0.07, duration: 0.44, ease: [0.16, 1, 0.3, 1] }}
                  onClick={() => toggleCard(card.key)}
                  className="relative overflow-hidden rounded-xl p-5 flex flex-col gap-3 cursor-pointer select-none"
                  style={{
                    background: active ? "#0e1628" : "#0c1220",
                    border: active ? `1px solid ${card.color}30` : "1px solid rgba(255,255,255,0.07)",
                    transition: "border-color 0.2s, background 0.2s",
                  }}>
                  {/* Top accent */}
                  <div className="absolute inset-x-0 top-0 h-[2px] rounded-t-xl"
                    style={{ background: active ? `linear-gradient(90deg, ${card.color} 0%, ${card.color}20 100%)` : `linear-gradient(90deg, ${card.color}40 0%, transparent 100%)`, transition: "background 0.2s" }} />
                  {/* Corner glow */}
                  <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full pointer-events-none"
                    style={{ background: `radial-gradient(circle, ${card.color}${active ? "1a" : "0a"}, transparent 70%)`, transition: "background 0.2s" }} />
                  {/* Active chart indicator */}
                  {active && (
                    <div className="absolute inset-x-0 bottom-0 h-[1px]"
                      style={{ background: `linear-gradient(90deg, transparent, ${card.color}50, transparent)` }} />
                  )}
                  {/* Icon + label */}
                  <div className="flex items-center gap-2.5 relative">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: `${card.color}${active ? "28" : "16"}`, color: card.color, transition: "background 0.2s" }}>
                      <Icon />
                    </div>
                    <span className="text-[12px] font-semibold tracking-wide uppercase"
                      style={{ color: active ? "#7a8aaa" : "#3a4a6a", letterSpacing: "0.06em", transition: "color 0.2s" }}>{card.label}</span>
                    {active && (
                      <div className="ml-auto flex items-center gap-1 px-1.5 py-0.5 rounded-md"
                        style={{ background: `${card.color}18`, border: `1px solid ${card.color}30` }}>
                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: card.color }} />
                        <span className="text-[9px] font-medium" style={{ color: card.color }}>chart</span>
                      </div>
                    )}
                  </div>
                  {/* Big value */}
                  <div className="metric-value text-[34px] font-bold leading-none relative"
                    style={{ color: active ? "#e8eaf5" : "#8a9aba", textShadow: active ? `0 0 32px ${card.color}30` : "none", transition: "color 0.2s" }}>
                    {value}
                  </div>
                  {/* Sub */}
                  <div className="flex items-center gap-1.5 relative">
                    <span className="text-[11px] text-[#2a3a5a]">{sub1}</span>
                    <span className="metric-value text-[12px] font-semibold" style={{ color: `${card.color}${active ? "dd" : "77"}`, transition: "color 0.2s" }}>
                      {sub2}
                    </span>
                  </div>
                </motion.div>
              );
            })}
      </div>

      {/* ── Bottom 6 Compact Cards ─────────────────────────── */}
      <div className="grid grid-cols-6 gap-3 mb-5">
        {loading || !data
          ? Array.from({ length: 6 }).map((_, i) => <StatSkeleton key={i} />)
          : STAT_CARDS.slice(4).map((card, ci) => {
              const { value, sub1, sub2 } = card.getValue(data.stats);
              const { Icon } = card;
              const active = selectedCards.has(card.key);
              return (
                <motion.div key={card.key}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.18 + ci * 0.05, duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
                  onClick={() => toggleCard(card.key)}
                  className="relative overflow-hidden rounded-xl p-3.5 flex flex-col gap-2 cursor-pointer select-none"
                  style={{
                    background: active ? "#0d1422" : "#0a0f1c",
                    border: active ? `1px solid ${card.color}25` : "1px solid rgba(255,255,255,0.05)",
                    transition: "border-color 0.2s, background 0.2s",
                  }}>
                  <div className="absolute inset-x-0 top-0 h-[2px] rounded-t-xl"
                    style={{ background: active ? `linear-gradient(90deg, ${card.color}80 0%, ${card.color}15 100%)` : `linear-gradient(90deg, ${card.color}30 0%, transparent 100%)`, transition: "background 0.2s" }} />
                  {active && (
                    <div className="absolute inset-x-0 bottom-0 h-[1px]"
                      style={{ background: `linear-gradient(90deg, transparent, ${card.color}40, transparent)` }} />
                  )}
                  <div className="flex items-center gap-2 relative">
                    <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: `${card.color}${active ? "20" : "10"}`, color: card.color, transition: "background 0.2s" }}>
                      <Icon />
                    </div>
                    <span className="text-[11px] font-medium" style={{ color: active ? "#5a6a8a" : "#2a3a5a", transition: "color 0.2s" }}>{card.label}</span>
                    {active && (
                      <div className="ml-auto w-1.5 h-1.5 rounded-full" style={{ background: card.color, boxShadow: `0 0 4px ${card.color}` }} />
                    )}
                  </div>
                  <div className="metric-value text-[20px] font-bold leading-none relative"
                    style={{ color: active ? "#c9d1e0" : "#3a4a6a", transition: "color 0.2s" }}>
                    {value}
                  </div>
                  <div className="flex items-center gap-1.5 relative mt-auto">
                    <span className="text-[10px] text-[#1e2e48]">{sub1}</span>
                    <span className="metric-value text-[11px] font-medium" style={{ color: `${card.color}${active ? "bb" : "55"}`, transition: "color 0.2s" }}>
                      {sub2}
                    </span>
                  </div>
                </motion.div>
              );
            })}
      </div>

      {/* ── Daily Trend Chart ──────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.32, duration: 0.48, ease: [0.16, 1, 0.3, 1] }}
        className="rounded-xl overflow-hidden"
        style={{ background: "#0c1220", border: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex items-center justify-between px-5 pt-4 pb-3"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
          <div>
            <div className="text-[13px] font-semibold text-[#c9d1e0] tracking-tight">แนวโน้มรายวัน</div>
            <div className="text-[11px] text-[#3a4a6a] mt-0.5">คลิกการ์ดด้านบนเพื่อเปลี่ยนเส้นกราฟ</div>
          </div>
          <div className="flex items-center gap-4 flex-wrap justify-end">
            {chartSeries.map(s => (
              <div key={String(s.key)} className="flex items-center gap-1.5">
                <div className="w-5 h-[2px] rounded-full" style={{ background: s.color }} />
                <span className="text-[11px]" style={{ color: s.color + "cc" }}>{s.label}</span>
              </div>
            ))}
            {chartSeries.length === 0 && (
              <span className="text-[11px] text-[#2a3a5a]">เลือกการ์ดด้านบนเพื่อแสดงกราฟ</span>
            )}
          </div>
        </div>

        <div className="px-2 pt-2 pb-1">
          {loading || !data
            ? <div className="skeleton rounded-lg mx-2 my-2" style={{ height: 260 }} />
            : <TrendChart key={`${act}-${period}-${dateRange?.since}-${dateRange?.until}-${[...selectedCards].sort().join()}`} data={data.daily} series={chartSeries} />
          }
        </div>
      </motion.div>

      {/* ── Account Breakdown (แยกตามบัญชีโฆษณา) ────────────── */}
      <AccountBreakdown period={period} dateRange={dateRange} page={pageFilter} />
    </div>
  );
}
