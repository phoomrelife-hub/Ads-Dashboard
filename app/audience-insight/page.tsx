"use client";
import { useCallback, useEffect, useState } from "react";
import { ThailandMap } from "@/components/thailand-map";

// ─── Types ───────────────────────────────────────────────────────────────────
type Row = Record<string, string | number>;
type BResult = { rows: Row[]; totals: Record<string, number> };
type Account = { id: string; name: string; active?: boolean };

// ─── Constants ───────────────────────────────────────────────────────────────
const PRESETS: [string, string][] = [
  ["last_7d", "7 วันล่าสุด"],
  ["last_14d", "14 วันล่าสุด"],
  ["last_30d", "30 วันล่าสุด"],
  ["last_90d", "90 วันล่าสุด"],
];

const GENDER_COLORS: Record<string, string> = {
  male: "#5b6cff",
  female: "#f472b6",
  unknown: "#3d4f6a",
};
const GENDER_LABEL: Record<string, string> = { male: "ชาย", female: "หญิง", unknown: "ไม่ระบุ" };

const AGE_ORDER = ["13-17", "18-24", "25-34", "35-44", "45-54", "55-64", "65+"];
const AGE_COLORS: Record<string, string> = {
  "13-17": "#a78bfa", "18-24": "#5b6cff", "25-34": "#22d3ee",
  "35-44": "#31c48d", "45-54": "#f5b14c", "55-64": "#ff8c42", "65+": "#ff6b6b",
};

const SEL: React.CSSProperties = {
  background: "#0a0e1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8,
  padding: "6px 10px", color: "#c8d0e0", fontSize: 12.5, outline: "none", cursor: "pointer",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtBaht(n: number): string {
  return n >= 1e6 ? `฿${(n / 1e6).toFixed(1)}M`
    : n >= 1e3 ? `฿${(n / 1e3).toFixed(1)}k`
    : `฿${Math.round(n).toLocaleString()}`;
}

function cpaKey(rows: Row[]): string {
  if (rows.some(r => Number(r.leads) > 0)) return "cpl";
  if (rows.some(r => Number(r.messaging) > 0)) return "costPerMessaging";
  return "costPerPurchase";
}
function cpaLabel(key: string): string {
  if (key === "cpl") return "CPL";
  if (key === "costPerMessaging") return "Cost/Msg";
  return "CPA";
}

function lerpColor(t: number): string {
  const t2 = Math.max(0, Math.min(1, t));
  const [c1, c2] = t2 < 0.5
    ? [[0x31, 0xc4, 0x8d], [0xf5, 0xb1, 0x4c]]
    : [[0xf5, 0xb1, 0x4c], [0xff, 0x6b, 0x6b]];
  const tt = t2 < 0.5 ? t2 * 2 : (t2 - 0.5) * 2;
  return `rgb(${Math.round(c1[0] + (c2[0] - c1[0]) * tt)},${Math.round(c1[1] + (c2[1] - c1[1]) * tt)},${Math.round(c1[2] + (c2[2] - c1[2]) * tt)})`;
}

function arcPath(cx: number, cy: number, r: number, sa: number, ea: number): string {
  const sx = cx + r * Math.cos(sa), sy = cy + r * Math.sin(sa);
  const ex = cx + r * Math.cos(ea), ey = cy + r * Math.sin(ea);
  const large = ea - sa > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${sx} ${sy} A ${r} ${r} 0 ${large} 1 ${ex} ${ey} Z`;
}

// ─── Skeleton ────────────────────────────────────────────────────────────────
function Sk({ h = "1rem" }: { h?: string }) {
  return <div className="skeleton" style={{ height: h, width: "100%", borderRadius: 8 }} />;
}

// ─── Pie chart ───────────────────────────────────────────────────────────────
function PieChart({ slices, title }: {
  slices: { label: string; value: number; color: string }[];
  title: string;
}) {
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
    <div>
      <div style={{ fontSize: 11, color: "#3d4f6a", marginBottom: 8, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>{title}</div>
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
              <span style={{ fontSize: 10.5, color: "#3d4f6a" }}>({fmtBaht(p.value)})</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── CPA bar chart (horizontal) ───────────────────────────────────────────────
function CpaBarChart({ rows, cpak, title }: { rows: Row[]; cpak: string; title: string }) {
  const sorted = rows.filter(r => Number(r.spend) > 0);
  if (sorted.length === 0) return <div style={{ color: "#3d4f6a", fontSize: 12 }}>ไม่มีข้อมูล</div>;
  const values = sorted.map(r => Number(r[cpak]) || 0);
  const max = Math.max(...values, 1);
  return (
    <div>
      <div style={{ fontSize: 11, color: "#3d4f6a", marginBottom: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {sorted.map((row, i) => {
          const val = values[i];
          const t = val / max;
          return (
            <div key={String(row.key)} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 54, fontSize: 11, color: "#8a9aba", flexShrink: 0, textAlign: "right" }}>{String(row.key)}</div>
              <div style={{ flex: 1, height: 7, background: "rgba(255,255,255,0.05)", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ width: `${t * 100}%`, height: "100%", background: lerpColor(t), borderRadius: 4, transition: "width 0.6s ease" }} />
              </div>
              <div className="font-mono" style={{ width: 62, fontSize: 11, color: "#c9d1e0", flexShrink: 0 }}>
                {val > 0 ? fmtBaht(val) : "—"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── CPA gender cards ─────────────────────────────────────────────────────────
function CpaGenderCards({ rows, cpak }: { rows: Row[]; cpak: string }) {
  const byGender = Object.fromEntries(rows.map(r => [String(r.key).toLowerCase(), r]));
  const totalSpend = rows.reduce((s, r) => s + Number(r.spend), 0);
  function Card({ row, label, color }: { row?: Row; label: string; color: string }) {
    const cpa = row ? Number(row[cpak]) : 0;
    const spend = row ? Number(row.spend) : 0;
    const pct = totalSpend ? (spend / totalSpend) * 100 : 0;
    return (
      <div style={{ flex: 1, background: "#070c17", border: `1px solid ${color}22`, borderRadius: 12, padding: "14px 16px", borderTop: `2px solid ${color}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
          <span style={{ fontSize: 12, color: "#8a9aba", fontWeight: 600 }}>{label}</span>
        </div>
        <div className="font-mono" style={{ fontSize: 22, fontWeight: 600, color, marginBottom: 4 }}>
          {cpa > 0 ? fmtBaht(cpa) : "—"}
        </div>
        <div style={{ fontSize: 11, color: "#3d4f6a" }}>
          ค่าโฆษณา: <span style={{ color: "#8a9aba" }}>{fmtBaht(spend)}</span>
          <span style={{ marginLeft: 6, color: color + "aa" }}>{pct.toFixed(0)}%</span>
        </div>
      </div>
    );
  }
  return (
    <div>
      <div style={{ fontSize: 11, color: "#3d4f6a", marginBottom: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>CPA ตามเพศ</div>
      <div style={{ display: "flex", gap: 10 }}>
        <Card row={byGender["male"]} label="ชาย" color={GENDER_COLORS.male} />
        <Card row={byGender["female"]} label="หญิง" color={GENDER_COLORS.female} />
      </div>
    </div>
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
  const [age, setAge] = useState<BResult | null>(null);
  const [region, setRegion] = useState<BResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let hidden: string[] = [];
    try { const h = JSON.parse(localStorage.getItem("adsHiddenAccounts") || "[]"); if (Array.isArray(h)) hidden = h; } catch {}
    setHiddenAccts(hidden);
    fetch("/api/accounts").then(r => r.json()).then((list: Account[]) => {
      if (!Array.isArray(list)) return;
      setAccounts(list);
      const pool = list.filter(a => !hidden.includes(a.id));
      const visible = pool.length ? pool : list;
      const first = visible.find(a => a.active) || visible[0];
      if (first) setAccount(first.id);
    }).catch(() => {});
  }, []);

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

  const genderSlices = gender
    ? gender.rows.filter(r => Number(r.spend) > 0).map(r => ({
        label: GENDER_LABEL[String(r.key).toLowerCase()] ?? String(r.key),
        value: Number(r.spend),
        color: GENDER_COLORS[String(r.key).toLowerCase()] ?? "#3d4f6a",
      }))
    : [];

  const ageRows = age
    ? AGE_ORDER.map(k => age.rows.find(r => String(r.key) === k)).filter((r): r is Row => !!r && Number(r.spend) > 0)
    : [];

  const ageSlices = ageRows.map(r => ({
    label: String(r.key), value: Number(r.spend),
    color: AGE_COLORS[String(r.key)] ?? "#3d4f6a",
  }));

  const cpak = gender ? cpaKey(gender.rows) : "cpl";
  const cpaLbl = cpaLabel(cpak);

  const regionRows = region
    ? [...region.rows].filter(r => Number(r.spend) > 0).sort((a, b) => Number(b.spend) - Number(a.spend))
    : [];
  const cpaVals = regionRows.map(r => Number(r[cpak])).filter(v => v > 0);
  const minCpa = Math.min(...cpaVals, 0), maxCpa = Math.max(...cpaVals, 1);

  // Drop accounts hidden in Workspace Settings from the picker (unless every account is
  // hidden — then fall back to showing all, matching the dashboard's behavior).
  const visibleAccounts =
    hiddenAccts.length && hiddenAccts.length < accounts.length
      ? accounts.filter(a => !hiddenAccts.includes(a.id))
      : accounts;

  return (
    <div style={{ padding: "28px 28px", background: "#060a12", minHeight: "100vh" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: "#e8eaf5", margin: 0 }}>วิเคราะห์กลุ่มเป้าหมาย</h1>
          <p style={{ fontSize: 12, color: "#3d4f6a", margin: "2px 0 0 0" }}>แบ่งตามเพศ อายุ และพื้นที่</p>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <select style={SEL} value={account} onChange={e => setAccount(e.target.value)}>
            {visibleAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
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
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <Card><PieChart slices={genderSlices} title="ค่าโฆษณาตามเพศ" /></Card>
            <Card><PieChart slices={ageSlices} title="ค่าโฆษณาตามอายุ" /></Card>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <Card><CpaBarChart rows={ageRows} cpak={cpak} title={`${cpaLbl} ตามอายุ`} /></Card>
            <Card>{gender && <CpaGenderCards rows={gender.rows} cpak={cpak} />}</Card>
          </div>
          <Card>
            <div style={{ fontSize: 11, color: "#3d4f6a", marginBottom: 14, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              แผนที่ความร้อน — {cpaLbl} รายจังหวัด
            </div>
            {region && region.rows.length > 0 ? (
              <div style={{ display: "grid", gridTemplateColumns: "minmax(320px,1fr) 1fr", gap: 20 }}>
                <div>
                  <div style={{ background: "#070c17", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 12, padding: "12px", textAlign: "center" }}>
                    <ThailandMap rows={region.rows} metricKey={cpak} fmt={fmtBaht} />
                    <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center", marginTop: 10, color: "#3d4f6a", fontSize: 11 }}>
                      <span>{cpaLbl} ต่ำ</span>
                      <div style={{ width: 128, height: 6, borderRadius: 3, background: "linear-gradient(90deg, #26303d, #ff3b3b)" }} />
                      <span>{cpaLbl} สูง</span>
                    </div>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "#3d4f6a", marginBottom: 8 }}>จังหวัดที่ใช้งบสูงสุด</div>
                  <div style={{ display: "flex", gap: 6, marginBottom: 6, padding: "0 4px" }}>
                    <div style={{ flex: 1, fontSize: 10, color: "#2a3a50" }}>จังหวัด</div>
                    <div style={{ width: 60, fontSize: 10, color: "#2a3a50", textAlign: "right" }}>ค่าโฆษณา</div>
                    <div style={{ width: 66, fontSize: 10, color: "#2a3a50", textAlign: "right" }}>{cpaLbl}</div>
                  </div>
                  {regionRows.slice(0, 18).map(r => {
                    const cpa = Number(r[cpak]);
                    const t = maxCpa > minCpa ? (cpa - minCpa) / (maxCpa - minCpa) : 0;
                    return (
                      <div key={String(r.key)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 4px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                        <div style={{ flex: 1, fontSize: 11.5, color: "#8a9aba", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{String(r.key)}</div>
                        <div className="font-mono" style={{ width: 60, fontSize: 11, color: "#c9d1e0", textAlign: "right" }}>{fmtBaht(Number(r.spend))}</div>
                        <div className="font-mono" style={{ width: 66, fontSize: 11, color: cpa > 0 ? lerpColor(t) : "#3d4f6a", textAlign: "right" }}>
                          {cpa > 0 ? fmtBaht(cpa) : "—"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
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