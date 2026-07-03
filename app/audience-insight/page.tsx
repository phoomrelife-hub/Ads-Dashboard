"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValue, animate } from "framer-motion";
import { ThailandMap } from "@/components/thailand-map";
import { useAccountRanking } from "@/components/account-ranking";

type Row = Record<string, string | number>;
type BResult = { rows: Row[]; totals: Record<string, number> };
type Account = { id: string; name: string; active?: boolean };

// ─── Metric catalog ───────────────────────────────────────────────────────────
type Format = "baht" | "int" | "pct" | "x";
type Polarity = "cost" | "good" | "neutral";
type MetricDef = { key: string; label: string; fmt: Format; additive: boolean; polarity: Polarity };

const METRICS: MetricDef[] = [
  { key: "spend",           label: "ค่าโฆษณา",   fmt: "baht", additive: true,  polarity: "neutral" },
  { key: "leads",           label: "Leads",       fmt: "int",  additive: true,  polarity: "good"    },
  { key: "purchases",       label: "Purchases",   fmt: "int",  additive: true,  polarity: "good"    },
  { key: "messaging",       label: "ข้อความ",     fmt: "int",  additive: true,  polarity: "good"    },
  { key: "impressions",     label: "Impressions", fmt: "int",  additive: true,  polarity: "neutral" },
  { key: "cpl",             label: "CPL",         fmt: "baht", additive: false, polarity: "cost"    },
  { key: "costPerPurchase", label: "CPA",         fmt: "baht", additive: false, polarity: "cost"    },
  { key: "roas",            label: "ROAS",        fmt: "x",    additive: false, polarity: "good"    },
  { key: "ctr",             label: "CTR",         fmt: "pct",  additive: false, polarity: "good"    },
  { key: "cpc",             label: "CPC",         fmt: "baht", additive: false, polarity: "cost"    },
  { key: "cpm",             label: "CPM",         fmt: "baht", additive: false, polarity: "cost"    },
];
const ALL_METRICS = METRICS;
const ADDITIVE_METRICS = METRICS.filter(m => m.additive);
const metricOf = (key: string) => METRICS.find(m => m.key === key) ?? METRICS[0];

// ─── Presets ──────────────────────────────────────────────────────────────────
const PRESETS: [string, string][] = [
  ["last_7d", "7 วันล่าสุด"],
  ["last_14d", "14 วันล่าสุด"],
  ["last_30d", "30 วันล่าสุด"],
  ["last_90d", "90 วันล่าสุด"],
];

// ─── Visual constants ─────────────────────────────────────────────────────────
const GENDER_COLORS: Record<string, string> = { male: "#5b6cff", female: "#f472b6", unknown: "#3d4f6a" };
const GENDER_LABEL: Record<string, string>  = { male: "ชาย", female: "หญิง", unknown: "ไม่ระบุ" };
const AGE_ORDER = ["13-17", "18-24", "25-34", "35-44", "45-54", "55-64", "65+"];
const AGE_COLORS: Record<string, string> = {
  "13-17": "#a78bfa", "18-24": "#5b6cff", "25-34": "#22d3ee",
  "35-44": "#31c48d", "45-54": "#f5b14c", "55-64": "#ff8c42", "65+": "#ff6b6b",
};

const SPRING = { type: "spring" as const, stiffness: 120, damping: 20 };
const FADE   = { duration: 0.22 };

// ─── Polarity helpers ─────────────────────────────────────────────────────────
function mapColors(polarity: Polarity): [string, string] {
  if (polarity === "cost")    return ["#26303d", "#ff3b3b"];
  if (polarity === "good")    return ["#26303d", "#31c48d"];
  return ["#26303d", "#5b6cff"];
}

function lerpHex(a: string, b: string, t: number): string {
  const h = (x: string) => parseInt(x, 16);
  const c = (i: number) => Math.round(h(a.slice(i, i + 2)) + (h(b.slice(i, i + 2)) - h(a.slice(i, i + 2))) * t);
  return `rgb(${c(1)},${c(3)},${c(5)})`;
}

function barColor(t: number, polarity: Polarity): string {
  // cost: green→amber→red (t=0 best); good: same scale but t=0 worst, invert; neutral: mono blue
  const effective = polarity === "good" ? 1 - t : t;
  if (polarity === "neutral") return lerpHex("#1a2540", "#5b6cff", t);
  const [c1, c2] = effective < 0.5
    ? [[0x31, 0xc4, 0x8d], [0xf5, 0xb1, 0x4c]]
    : [[0xf5, 0xb1, 0x4c], [0xff, 0x6b, 0x6b]];
  const tt = effective < 0.5 ? effective * 2 : (effective - 0.5) * 2;
  return `rgb(${Math.round(c1[0] + (c2[0] - c1[0]) * tt)},${Math.round(c1[1] + (c2[1] - c1[1]) * tt)},${Math.round(c1[2] + (c2[2] - c1[2]) * tt)})`;
}

// ─── Formatting ───────────────────────────────────────────────────────────────
function fmtBaht(n: number): string {
  return n >= 1e6 ? `฿${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `฿${(n / 1e3).toFixed(1)}k` : `฿${Math.round(n).toLocaleString()}`;
}
function fmtMetric(n: number, fmt: Format): string {
  if (fmt === "baht") return fmtBaht(n);
  if (fmt === "pct")  return `${n.toFixed(2)}%`;
  if (fmt === "x")    return `${n.toFixed(2)}×`;
  return n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : Math.round(n).toLocaleString();
}

// ─── Auto CPA key ─────────────────────────────────────────────────────────────
function autoCpaKey(rows: Row[]): string {
  if (rows.some(r => Number(r.leads) > 0))     return "cpl";
  if (rows.some(r => Number(r.messaging) > 0)) return "messaging";
  return "costPerPurchase";
}

// ─── localStorage helper ──────────────────────────────────────────────────────
function lsGet(key: string, fallback: string): string {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function lsSet(key: string, val: string) {
  try { localStorage.setItem(key, val); } catch {}
}

// ─── SEL style ────────────────────────────────────────────────────────────────
const SEL: React.CSSProperties = {
  background: "#0a0e1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8,
  padding: "6px 10px", color: "#c8d0e0", fontSize: 12.5, outline: "none", cursor: "pointer",
};

// ─── MetricSelect ─────────────────────────────────────────────────────────────
function MetricSelect({
  options, value, onChange,
}: { options: MetricDef[]; value: string; onChange: (k: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = metricOf(value);

  useEffect(() => {
    function close(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: "#0a0e1a", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 7,
          padding: "4px 8px", color: "#8a9aba", fontSize: 11.5, cursor: "pointer",
          display: "flex", alignItems: "center", gap: 4,
        }}
      >
        {current.label}
        <svg viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 9, height: 9, opacity: 0.6 }}>
          <path d="M1 1l4 4 4-4" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={FADE}
            style={{
              position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 50,
              background: "#0e1626", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10,
              padding: "5px", minWidth: 130, boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
            }}
          >
            {options.map((m, i) => (
              <motion.button
                key={m.key}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ ...FADE, delay: i * 0.03 }}
                onClick={() => { onChange(m.key); setOpen(false); }}
                style={{
                  display: "block", width: "100%", textAlign: "left",
                  padding: "6px 10px", fontSize: 12, borderRadius: 6, border: "none", cursor: "pointer",
                  background: m.key === value ? "rgba(91,108,255,0.15)" : "transparent",
                  color: m.key === value ? "#a0aaff" : "#8a9aba",
                }}
              >
                {m.label}
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── AnimatedNumber ───────────────────────────────────────────────────────────
function AnimatedNumber({ value, fmt }: { value: number; fmt: Format }) {
  const mv = useMotionValue(value);
  const [display, setDisplay] = useState(() => fmtMetric(value, fmt));
  const fmtRef = useRef(fmt);
  fmtRef.current = fmt;

  useEffect(() => {
    const ctrl = animate(mv, value, {
      ...SPRING,
      onUpdate: v => setDisplay(fmtMetric(v, fmtRef.current)),
    });
    return () => ctrl.stop();
  }, [value, mv]);

  return <span>{display}</span>;
}

// ─── CardHeader ───────────────────────────────────────────────────────────────
function CardHeader({
  title, options, metric, onMetric,
}: { title: string; options: MetricDef[]; metric: string; onMetric: (k: string) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
      <div style={{ fontSize: 11, color: "#3d4f6a", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>{title}</div>
      <MetricSelect options={options} value={metric} onChange={onMetric} />
    </div>
  );
}

// ─── PieChart ─────────────────────────────────────────────────────────────────
function arcPath(cx: number, cy: number, r: number, sa: number, ea: number): string {
  const sx = cx + r * Math.cos(sa), sy = cy + r * Math.sin(sa);
  const ex = cx + r * Math.cos(ea), ey = cy + r * Math.sin(ea);
  const large = ea - sa > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${sx} ${sy} A ${r} ${r} 0 ${large} 1 ${ex} ${ey} Z`;
}

function PieChart({ slices, metric }: {
  slices: { label: string; value: number; color: string }[];
  metric: string;
}) {
  const def = metricOf(metric);
  const cx = 90, cy = 90, r = 70;
  const total = slices.reduce((s, d) => s + d.value, 0);
  if (total === 0) return (
    <div style={{ height: 160, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ color: "#3d4f6a", fontSize: 12 }}>ไม่มีข้อมูล</span>
    </div>
  );
  let angle = -Math.PI / 2;
  const paths = slices.map(d => {
    const frac = d.value / total;
    const sa = angle;
    angle += frac * Math.PI * 2;
    return { ...d, frac, path: arcPath(cx, cy, r, sa, angle) };
  });

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={metric}
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.94 }}
        transition={FADE}
      >
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <svg viewBox="0 0 180 180" style={{ width: 140, height: 140, flexShrink: 0 }}>
            {paths.map(p => (
              <path key={p.label} d={p.path} fill={p.color} stroke="#0c1220" strokeWidth="2" />
            ))}
            <circle cx={cx} cy={cy} r={34} fill="#0c1220" />
          </svg>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {paths.map(p => (
              <div key={p.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: p.color, flexShrink: 0 }} />
                <span style={{ fontSize: 11.5, color: "#8a9aba" }}>{p.label}</span>
                <span className="font-mono" style={{ fontSize: 11.5, color: "#c9d1e0", marginLeft: 4 }}>
                  {(p.frac * 100).toFixed(1)}%
                </span>
                <span style={{ fontSize: 10.5, color: "#3d4f6a" }}>
                  (<AnimatedNumber value={p.value} fmt={def.fmt} />)
                </span>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── MetricBarChart ───────────────────────────────────────────────────────────
function MetricBarChart({ rows, metric }: { rows: Row[]; metric: string }) {
  const def = metricOf(metric);
  const sorted = [...rows]
    .filter(r => Number(r.spend) > 0)
    .sort((a, b) => {
      const va = Number(a[metric]) || 0, vb = Number(b[metric]) || 0;
      return def.polarity === "cost" ? va - vb : vb - va;
    });
  if (!sorted.length) return <div style={{ color: "#3d4f6a", fontSize: 12 }}>ไม่มีข้อมูล</div>;
  const hasAnyValue = sorted.some(r => Number(r[metric]) > 0);
  if (!hasAnyValue) return (
    <div style={{ padding: "24px 0", textAlign: "center" }}>
      <div style={{ fontSize: 12, color: "#4a5a7a", fontWeight: 600, marginBottom: 4 }}>ไม่มีข้อมูล {def.label}</div>
      <div style={{ fontSize: 11, color: "#2a3a50" }}>บัญชีนี้ไม่ได้ติดตาม conversion ประเภทนี้</div>
    </div>
  );

  const values = sorted.map(r => Number(r[metric]) || 0);
  const max = Math.max(...values, 1);

  return (
    <AnimatePresence mode="wait">
      <motion.div key={metric} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={FADE}>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {sorted.map((row, i) => {
            const val = values[i];
            const t = val / max;
            const color = barColor(t, def.polarity);
            return (
              <motion.div
                key={String(row.key)}
                layout
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ ...SPRING, delay: i * 0.03 }}
                style={{ display: "flex", alignItems: "center", gap: 8 }}
              >
                <div style={{ width: 54, fontSize: 11, color: "#8a9aba", flexShrink: 0, textAlign: "right" }}>
                  {String(row.key)}
                </div>
                <div style={{ flex: 1, height: 7, background: "rgba(255,255,255,0.05)", borderRadius: 4, overflow: "hidden" }}>
                  <motion.div
                    animate={{ width: `${t * 100}%` }}
                    transition={SPRING}
                    style={{ height: "100%", background: color, borderRadius: 4 }}
                  />
                </div>
                <div className="font-mono" style={{ width: 68, fontSize: 11, color: "#c9d1e0", flexShrink: 0 }}>
                  {val > 0 ? <AnimatedNumber value={val} fmt={def.fmt} /> : "—"}
                </div>
              </motion.div>
            );
          })}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── MetricGenderCards ────────────────────────────────────────────────────────
function MetricGenderCards({ rows, metric }: { rows: Row[]; metric: string }) {
  const def = metricOf(metric);
  const byGender = Object.fromEntries(rows.map(r => [String(r.key).toLowerCase(), r]));
  const totalSpend = rows.reduce((s, r) => s + Number(r.spend), 0);
  // `def` is used below in the no-data empty state

  function Card({ row, label, color }: { row?: Row; label: string; color: string }) {
    const val    = row ? (Number(row[metric]) || 0) : 0;
    const spend  = row ? Number(row.spend) : 0;
    const pct    = totalSpend ? (spend / totalSpend) * 100 : 0;
    return (
      <div style={{
        flex: 1, background: "#070c17", border: `1px solid ${color}22`,
        borderRadius: 12, padding: "14px 16px", borderTop: `2px solid ${color}`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
          <span style={{ fontSize: 12, color: "#8a9aba", fontWeight: 600 }}>{label}</span>
        </div>
        <div className="font-mono" style={{ fontSize: 22, fontWeight: 600, color, marginBottom: 6 }}>
          {val > 0 ? <AnimatedNumber value={val} fmt={def.fmt} /> : "—"}
        </div>
        <div style={{ fontSize: 11, color: "#3d4f6a", marginBottom: 6 }}>
          ค่าโฆษณา: <span style={{ color: "#8a9aba" }}>{fmtBaht(spend)}</span>
          <span style={{ marginLeft: 6, color: color + "aa" }}>{pct.toFixed(0)}%</span>
        </div>
        <div style={{ height: 4, background: "rgba(255,255,255,0.05)", borderRadius: 2, overflow: "hidden" }}>
          <motion.div
            animate={{ width: `${pct}%` }}
            transition={SPRING}
            style={{ height: "100%", background: color + "88", borderRadius: 2 }}
          />
        </div>
      </div>
    );
  }

  const hasAnyValue = rows.some(r => Number(r[metric]) > 0);

  return (
    <AnimatePresence mode="wait">
      <motion.div key={metric} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={FADE}>
        {hasAnyValue ? (
          <div style={{ display: "flex", gap: 10 }}>
            <Card row={byGender["male"]}   label="ชาย"  color={GENDER_COLORS.male}   />
            <Card row={byGender["female"]} label="หญิง" color={GENDER_COLORS.female} />
          </div>
        ) : (
          <div style={{ padding: "24px 0", textAlign: "center" }}>
            <div style={{ fontSize: 12, color: "#4a5a7a", fontWeight: 600, marginBottom: 4 }}>ไม่มีข้อมูล {def.label}</div>
            <div style={{ fontSize: 11, color: "#2a3a50" }}>Facebook ไม่รายงาน metric นี้แบบแยกกลุ่ม</div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Card wrapper ─────────────────────────────────────────────────────────────
function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: "#0c1220", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: "20px 22px", ...style }}>
      {children}
    </div>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────
function Sk({ h = "1rem" }: { h?: string }) {
  return <div className="skeleton" style={{ height: h, width: "100%", borderRadius: 8 }} />;
}
function LoadingSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Card><Sk h="180px" /></Card><Card><Sk h="180px" /></Card>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Card><Sk h="160px" /></Card><Card><Sk h="160px" /></Card>
      </div>
      <Card><Sk h="520px" /></Card>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function AudienceInsightPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [hiddenAccts, setHiddenAccts] = useState<string[]>([]);
  const [account, setAccount] = useState("");
  const [preset, setPreset] = useState("last_30d");
  const [gender, setGender] = useState<BResult | null>(null);
  const [age, setAge]       = useState<BResult | null>(null);
  const [region, setRegion] = useState<BResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  // per-box metric state (lazy-init from localStorage)
  const [genderPieMetric, setGenderPieMetric] = useState(() => lsGet("ai.metric.genderPie", "spend"));
  const [agePieMetric,    setAgePieMetric]    = useState(() => lsGet("ai.metric.agePie",    "spend"));
  const [ageBarMetric,    setAgeBarMetric]    = useState(() => lsGet("ai.metric.ageBar",    "cpl"));
  const [genderCardMetric,setGenderCardMetric]= useState(() => lsGet("ai.metric.genderCard","cpl"));
  const [mapMetric,       setMapMetric]       = useState(() => lsGet("ai.metric.map",       "cpl"));
  const [mapMetric2,      setMapMetric2]      = useState(() => lsGet("ai.metric.map2",      "roas"));
  const [mapCompare,      setMapCompare]      = useState(false);

  const setAndSave = (setter: (v: string) => void, lsKey: string) => (v: string) => {
    setter(v); lsSet(lsKey, v);
  };

  useEffect(() => {
    let hidden: string[] = [];
    try { const h = JSON.parse(localStorage.getItem("adsHiddenAccounts") || "[]"); if (Array.isArray(h)) hidden = h; } catch {}
    setHiddenAccts(hidden);
    fetch("/api/accounts").then(r => r.json()).then((list: Account[]) => {
      if (!Array.isArray(list)) return;
      setAccounts(list);
      const pool    = list.filter(a => !hidden.includes(a.id));
      const visible = pool.length ? pool : list;
      const first   = visible.find(a => a.active) || visible[0];
      if (first) setAccount(first.id);
    }).catch(() => {});
  }, []);

  // when data loads, seed the comparison boxes to the auto-detected CPA key
  useEffect(() => {
    if (!gender) return;
    const auto = autoCpaKey(gender.rows);
    if (!localStorage.getItem("ai.metric.ageBar"))    { setAgeBarMetric(auto); }
    if (!localStorage.getItem("ai.metric.genderCard")) { setGenderCardMetric(auto); }
    if (!localStorage.getItem("ai.metric.map"))        { setMapMetric(auto); }
  }, [gender]);

  const load = useCallback(async () => {
    if (!account) return;
    setLoading(true); setError(null);
    try {
      const [g, a, r] = await Promise.all([
        fetch(`/api/breakdown?act=${encodeURIComponent(account)}&dim=gender&preset=${preset}`).then(x => x.json()),
        fetch(`/api/breakdown?act=${encodeURIComponent(account)}&dim=age&preset=${preset}`).then(x => x.json()),
        fetch(`/api/breakdown?act=${encodeURIComponent(account)}&dim=region&preset=${preset}`).then(x => x.json()),
      ]);
      if (g.error || a.error || r.error) throw new Error(g.error || a.error || r.error);
      setGender(g); setAge(a); setRegion(r);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "โหลดไม่สำเร็จ");
    } finally { setLoading(false); }
  }, [account, preset]);

  useEffect(() => { load(); }, [load]);

  // ── derived data ──────────────────────────────────────────────────────────
  const genderSlicesFor = (metric: string) => {
    const def = metricOf(metric);
    return gender
      ? gender.rows.filter(r => Number(r.spend) > 0).map(r => ({
          label: GENDER_LABEL[String(r.key).toLowerCase()] ?? String(r.key),
          value: Number(r[metric]) || 0,
          color: GENDER_COLORS[String(r.key).toLowerCase()] ?? "#3d4f6a",
          fmt:   def.fmt,
        }))
      : [];
  };

  const ageRows = age
    ? AGE_ORDER.map(k => age.rows.find(r => String(r.key) === k)).filter((r): r is Row => !!r && Number(r.spend) > 0)
    : [];
  const ageSlicesFor = (metric: string) =>
    ageRows.map(r => ({
      label: String(r.key),
      value: Number(r[metric]) || 0,
      color: AGE_COLORS[String(r.key)] ?? "#3d4f6a",
    }));

  const regionRows  = region ? [...region.rows].filter(r => Number(r.spend) > 0).sort((a, b) => Number(b.spend) - Number(a.spend)) : [];

  const mapDef      = metricOf(mapMetric);
  const mapVals     = regionRows.map(r => Number(r[mapMetric])).filter(v => v > 0);
  const minMapVal   = Math.min(...mapVals, 0);
  const maxMapVal   = Math.max(...mapVals, 1);
  const [mapLow, mapHigh] = mapColors(mapDef.polarity);

  const mapDef2     = metricOf(mapMetric2);
  const mapVals2    = regionRows.map(r => Number(r[mapMetric2])).filter(v => v > 0);
  const minMapVal2  = Math.min(...mapVals2, 0);
  const maxMapVal2  = Math.max(...mapVals2, 1);
  const [mapLow2, mapHigh2] = mapColors(mapDef2.polarity);

  const visibleAccounts =
    hiddenAccts.length && hiddenAccts.length < accounts.length
      ? accounts.filter(a => !hiddenAccts.includes(a.id))
      : accounts;
  const { sorted: rankedAccounts, tagOf, controls: rankControls } = useAccountRanking(visibleAccounts, hiddenAccts);

  return (
    <div style={{ padding: "28px 28px", background: "#060a12", minHeight: "100vh" }}>
      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: "#e8eaf5", margin: 0 }}>วิเคราะห์กลุ่มเป้าหมาย</h1>
          <p style={{ fontSize: 12, color: "#3d4f6a", margin: "2px 0 0 0" }}>แบ่งตามเพศ อายุ และพื้นที่</p>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {rankControls}
          <select style={SEL} value={account} onChange={e => setAccount(e.target.value)}>
            {rankedAccounts.map(a => <option key={a.id} value={a.id}>{a.name}{tagOf(a.id)}</option>)}
          </select>
          <select style={SEL} value={preset} onChange={e => setPreset(e.target.value)}>
            {PRESETS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <button onClick={load} disabled={loading}
            style={{ background: "rgba(91,108,255,0.12)", border: "1px solid rgba(91,108,255,0.3)", borderRadius: 8, padding: "6px 12px", color: "#8a9aba", fontSize: 12, cursor: loading ? "default" : "pointer", display: "flex", alignItems: "center", gap: 6, opacity: loading ? 0.6 : 1 }}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
              style={{ width: 13, height: 13, animation: loading ? "spin 0.8s linear infinite" : "none" }}>
              <path d="M14 8A6 6 0 1 1 8 2" /><path d="M14 2v4h-4" />
            </svg>
            รีเฟรช
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: "rgba(255,107,107,0.08)", border: "1px solid rgba(255,107,107,0.2)", borderRadius: 10, padding: "10px 16px", marginBottom: 20, color: "#ff9a9a", fontSize: 13 }}>
          {error}
        </div>
      )}

      {loading ? <LoadingSkeleton /> : (
        <>
          {/* ── Row 1: pies ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <Card>
              <CardHeader title="แบ่งตามเพศ" options={ADDITIVE_METRICS} metric={genderPieMetric} onMetric={setAndSave(setGenderPieMetric, "ai.metric.genderPie")} />
              <PieChart slices={genderSlicesFor(genderPieMetric)} metric={genderPieMetric} />
            </Card>
            <Card>
              <CardHeader title="แบ่งตามอายุ" options={ADDITIVE_METRICS} metric={agePieMetric} onMetric={setAndSave(setAgePieMetric, "ai.metric.agePie")} />
              <PieChart slices={ageSlicesFor(agePieMetric)} metric={agePieMetric} />
            </Card>
          </div>

          {/* ── Row 2: bar + gender cards ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <Card>
              <CardHeader title="เปรียบเทียบตามอายุ" options={ALL_METRICS} metric={ageBarMetric} onMetric={setAndSave(setAgeBarMetric, "ai.metric.ageBar")} />
              <MetricBarChart rows={ageRows} metric={ageBarMetric} />
            </Card>
            <Card>
              <CardHeader title="เปรียบเทียบตามเพศ" options={ALL_METRICS} metric={genderCardMetric} onMetric={setAndSave(setGenderCardMetric, "ai.metric.genderCard")} />
              {gender && <MetricGenderCards rows={gender.rows} metric={genderCardMetric} />}
            </Card>
          </div>

          {/* ── Row 3: Thailand heatmap ── */}
          <Card>
            {/* Header: title + metric selector (single mode only) + compare toggle */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: "#3d4f6a", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                แผนที่ความร้อน — รายจังหวัด
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {!mapCompare && (
                  <MetricSelect options={ALL_METRICS} value={mapMetric} onChange={setAndSave(setMapMetric, "ai.metric.map")} />
                )}
                <button
                  onClick={() => setMapCompare(v => !v)}
                  style={{
                    background: mapCompare ? "rgba(91,108,255,0.15)" : "rgba(255,255,255,0.04)",
                    border: `1px solid ${mapCompare ? "rgba(91,108,255,0.35)" : "rgba(255,255,255,0.08)"}`,
                    borderRadius: 7, padding: "4px 10px", cursor: "pointer",
                    color: mapCompare ? "#a0aaff" : "#8a9aba", fontSize: 11.5,
                    display: "flex", alignItems: "center", gap: 5, transition: "all 0.18s",
                  }}
                >
                  {mapCompare ? (
                    <>
                      <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" style={{ width: 11, height: 11 }}>
                        <path d="M2 2l10 10M12 2L2 12" />
                      </svg>
                      ปิดเปรียบเทียบ
                    </>
                  ) : (
                    <>
                      <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" style={{ width: 11, height: 11 }}>
                        <path d="M7 1v12M1 7h12" />
                      </svg>
                      เปรียบเทียบ
                    </>
                  )}
                </button>
              </div>
            </div>

            {region && region.rows.length > 0 ? (
              <AnimatePresence mode="wait">
                {mapCompare ? (
                  /* ── Compare mode: 2 maps side-by-side + province table ── */
                  <motion.div
                    key="compare"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={FADE}
                    style={{ display: "grid", gridTemplateColumns: "1fr 1fr minmax(200px,260px)", gap: 16, alignItems: "start" }}
                  >
                    {/* Map A */}
                    <motion.div initial={{ x: -24, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ ...SPRING, delay: 0.05 }}>
                      <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
                        <MetricSelect options={ALL_METRICS} value={mapMetric} onChange={setAndSave(setMapMetric, "ai.metric.map")} />
                      </div>
                      <div style={{ background: "#070c17", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 12, padding: "12px", textAlign: "center" }}>
                        <ThailandMap rows={region.rows} metricKey={mapMetric} fmt={v => fmtMetric(v, mapDef.fmt)} colors={[mapLow, mapHigh]} noDataLabel={`ไม่มีข้อมูล ${mapDef.label} รายจังหวัด`} />
                        <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center", marginTop: 8, color: "#3d4f6a", fontSize: 10.5 }}>
                          <span>{mapDef.polarity === "cost" ? "ต่ำ" : "น้อย"}</span>
                          <div style={{ width: 80, height: 5, borderRadius: 3, background: `linear-gradient(90deg, ${mapLow}, ${mapHigh})` }} />
                          <span>{mapDef.polarity === "cost" ? "สูง" : "มาก"}</span>
                        </div>
                      </div>
                    </motion.div>

                    {/* Map B */}
                    <motion.div initial={{ x: 24, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ ...SPRING, delay: 0.05 }}>
                      <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
                        <MetricSelect options={ALL_METRICS} value={mapMetric2} onChange={setAndSave(setMapMetric2, "ai.metric.map2")} />
                      </div>
                      <div style={{ background: "#070c17", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 12, padding: "12px", textAlign: "center" }}>
                        <ThailandMap rows={region.rows} metricKey={mapMetric2} fmt={v => fmtMetric(v, mapDef2.fmt)} colors={[mapLow2, mapHigh2]} noDataLabel={`ไม่มีข้อมูล ${mapDef2.label} รายจังหวัด`} />
                        <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center", marginTop: 8, color: "#3d4f6a", fontSize: 10.5 }}>
                          <span>{mapDef2.polarity === "cost" ? "ต่ำ" : "น้อย"}</span>
                          <div style={{ width: 80, height: 5, borderRadius: 3, background: `linear-gradient(90deg, ${mapLow2}, ${mapHigh2})` }} />
                          <span>{mapDef2.polarity === "cost" ? "สูง" : "มาก"}</span>
                        </div>
                      </div>
                    </motion.div>

                    {/* Province table — both metrics */}
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ ...FADE, delay: 0.15 }}>
                      <div style={{ fontSize: 11, color: "#3d4f6a", marginBottom: 8 }}>จังหวัดที่ใช้งบสูงสุด</div>
                      <div style={{ display: "flex", gap: 4, marginBottom: 6, padding: "0 4px" }}>
                        <div style={{ flex: 1, fontSize: 10, color: "#2a3a50" }}>จังหวัด</div>
                        <div style={{ width: 56, fontSize: 10, color: "#2a3a50", textAlign: "right" }}>{mapDef.label}</div>
                        <div style={{ width: 56, fontSize: 10, color: "#2a3a50", textAlign: "right" }}>{mapDef2.label}</div>
                      </div>
                      <AnimatePresence mode="wait">
                        <motion.div key={`${mapMetric}-${mapMetric2}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={FADE}>
                          {regionRows.slice(0, 18).map(r => {
                            const v1  = Number(r[mapMetric]);
                            const v2  = Number(r[mapMetric2]);
                            const t1  = maxMapVal > minMapVal ? (v1 - minMapVal) / (maxMapVal - minMapVal) : 0;
                            const t2  = maxMapVal2 > minMapVal2 ? (v2 - minMapVal2) / (maxMapVal2 - minMapVal2) : 0;
                            return (
                              <div key={String(r.key)} style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 4px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                                <div style={{ flex: 1, fontSize: 11, color: "#8a9aba", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{String(r.key)}</div>
                                <div className="font-mono" style={{ width: 56, fontSize: 10.5, color: v1 > 0 ? lerpHex(mapLow, mapHigh, t1) : "#3d4f6a", textAlign: "right" }}>
                                  {v1 > 0 ? <AnimatedNumber value={v1} fmt={mapDef.fmt} /> : "—"}
                                </div>
                                <div className="font-mono" style={{ width: 56, fontSize: 10.5, color: v2 > 0 ? lerpHex(mapLow2, mapHigh2, t2) : "#3d4f6a", textAlign: "right" }}>
                                  {v2 > 0 ? <AnimatedNumber value={v2} fmt={mapDef2.fmt} /> : "—"}
                                </div>
                              </div>
                            );
                          })}
                        </motion.div>
                      </AnimatePresence>
                    </motion.div>
                  </motion.div>
                ) : (
                  /* ── Single mode: original layout ── */
                  <motion.div
                    key="single"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={FADE}
                    style={{ display: "grid", gridTemplateColumns: "minmax(320px,1fr) 1fr", gap: 20 }}
                  >
                    <div>
                      <div style={{ background: "#070c17", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 12, padding: "12px", textAlign: "center" }}>
                        <ThailandMap rows={region.rows} metricKey={mapMetric} fmt={v => fmtMetric(v, mapDef.fmt)} colors={[mapLow, mapHigh]} noDataLabel={`ไม่มีข้อมูล ${mapDef.label} รายจังหวัด`} />
                        <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center", marginTop: 10, color: "#3d4f6a", fontSize: 11 }}>
                          <span>{mapDef.label} {mapDef.polarity === "cost" ? "ต่ำ" : "น้อย"}</span>
                          <div style={{ width: 128, height: 6, borderRadius: 3, background: `linear-gradient(90deg, ${mapLow}, ${mapHigh})` }} />
                          <span>{mapDef.label} {mapDef.polarity === "cost" ? "สูง" : "มาก"}</span>
                        </div>
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: "#3d4f6a", marginBottom: 8 }}>จังหวัดที่ใช้งบสูงสุด</div>
                      <div style={{ display: "flex", gap: 6, marginBottom: 6, padding: "0 4px" }}>
                        <div style={{ flex: 1, fontSize: 10, color: "#2a3a50" }}>จังหวัด</div>
                        <div style={{ width: 60, fontSize: 10, color: "#2a3a50", textAlign: "right" }}>ค่าโฆษณา</div>
                        <div style={{ width: 70, fontSize: 10, color: "#2a3a50", textAlign: "right" }}>{mapDef.label}</div>
                      </div>
                      <AnimatePresence mode="wait">
                        <motion.div key={mapMetric} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={FADE}>
                          {regionRows.slice(0, 18).map(r => {
                            const val = Number(r[mapMetric]);
                            const t   = maxMapVal > minMapVal ? (val - minMapVal) / (maxMapVal - minMapVal) : 0;
                            const color = val > 0 ? lerpHex(mapLow, mapHigh, t) : "#3d4f6a";
                            return (
                              <motion.div key={String(r.key)} layout style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 4px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                                <div style={{ flex: 1, fontSize: 11.5, color: "#8a9aba", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{String(r.key)}</div>
                                <div className="font-mono" style={{ width: 60, fontSize: 11, color: "#c9d1e0", textAlign: "right" }}>{fmtBaht(Number(r.spend))}</div>
                                <div className="font-mono" style={{ width: 70, fontSize: 11, color, textAlign: "right" }}>
                                  {val > 0 ? <AnimatedNumber value={val} fmt={mapDef.fmt} /> : "—"}
                                </div>
                              </motion.div>
                            );
                          })}
                        </motion.div>
                      </AnimatePresence>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            ) : (
              <div style={{ color: "#3d4f6a", fontSize: 13, padding: "40px 0", textAlign: "center" }}>
                ไม่มีข้อมูลพื้นที่สำหรับบัญชีหรือช่วงเวลานี้
              </div>
            )}
          </Card>
        </>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
