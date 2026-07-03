"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { TrueRoasResult, TrueRoasRow } from "@/lib/leads/roas";

// ── Types ──────────────────────────────────────────────────────────────────────

type Acct = { id: string; name: string; active: boolean };
type SortKey = "trueRoas" | "gap" | "spend" | "realRevenue" | "cvr" | "trueCac";
type SortDir = "asc" | "desc";

// ── Constants ──────────────────────────────────────────────────────────────────

const PRESETS: [string, string][] = [
  ["today", "วันนี้"],
  ["yesterday", "เมื่อวาน"],
  ["last_7d", "7 วันล่าสุด"],
  ["last_30d", "30 วันล่าสุด"],
  ["this_month", "เดือนนี้"],
  ["last_90d", "90 วันล่าสุด"],
];

const TRUE_ROAS_GOOD = 1.5; // green threshold
const TRUE_ROAS_WARN = 0.8; // yellow threshold (below = red)
const LOW_COVERAGE = 0.4;   // below this: caution

// ── Formatters ─────────────────────────────────────────────────────────────────

const baht = (v: number) => "฿" + Math.round(v).toLocaleString("en-US");
const pct = (v: number) => (v * 100).toFixed(1) + "%";
const n0 = (v: number) => Math.round(v).toLocaleString("en-US");
const r2 = (v: number | null) => (v == null ? "—" : v.toFixed(2));

// ── SVG Icons ──────────────────────────────────────────────────────────────────

function IcoSort({ dir }: { dir?: SortDir }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      {dir === "asc" ? <path d="M5 8V2M2 5l3-3 3 3" /> : dir === "desc" ? <path d="M5 2v6M2 5l3 3 3-3" /> : <path d="M2 3h6M2 7h6" />}
    </svg>
  );
}

function IcoEmpty() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="8" width="32" height="26" rx="3" />
      <path d="M4 16h32M14 8V4M26 8V4M16 24h8M16 28h5" />
    </svg>
  );
}

function IcoWarning() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 1.5L1.5 11.5h11L7 1.5z" />
      <path d="M7 6v2.5M7 10h.01" />
    </svg>
  );
}

function IcoRefresh({ spinning }: { spinning?: boolean }) {
  return (
    <svg
      width="14" height="14" viewBox="0 0 14 14" fill="none"
      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
      style={spinning ? { animation: "spin 0.7s linear infinite" } : {}}
    >
      <path d="M12.5 2.5A6 6 0 1 1 2.5 7" />
      <path d="M12.5 2.5V6M12.5 2.5H9" />
    </svg>
  );
}

// ── Skeleton ───────────────────────────────────────────────────────────────────

function Skel({ w, h }: { w: string; h: string }) {
  return <div className="skeleton rounded" style={{ width: w, height: h, display: "inline-block" }} />;
}

function SkeletonTable() {
  return (
    <div>
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-white/[0.05]">
        <Skel w="140px" h="12px" />
      </div>
      <div className="divide-y divide-white/[0.04]">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-3.5">
            <Skel w={`${50 + (i % 3) * 20}%`} h="12px" />
            {Array.from({ length: 8 }).map((_, j) => (
              <Skel key={j} w="56px" h="12px" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Coverage badge ─────────────────────────────────────────────────────────────

function CoverageBadge({ coverage, unattributed }: { coverage: number | null; unattributed: number }) {
  if (coverage == null) return null;
  const pctVal = Math.round(coverage * 100);
  const isLow = coverage < LOW_COVERAGE;
  const bgColor = isLow ? "rgba(239,68,68,0.12)" : coverage >= 0.7 ? "rgba(49,196,141,0.12)" : "rgba(245,177,76,0.12)";
  const borderColor = isLow ? "rgba(239,68,68,0.3)" : coverage >= 0.7 ? "rgba(49,196,141,0.3)" : "rgba(245,177,76,0.3)";
  const textColor = isLow ? "#f87171" : coverage >= 0.7 ? "#31c48d" : "#f5b14c";

  return (
    <div
      style={{
        background: bgColor,
        border: `1px solid ${borderColor}`,
        borderRadius: 10,
        padding: "10px 14px",
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        marginBottom: 16,
      }}
    >
      <span style={{ color: textColor, marginTop: 1 }}><IcoWarning /></span>
      <div>
        <div style={{ color: textColor, fontFamily: "'Fira Code', monospace", fontWeight: 600, fontSize: 15, marginBottom: 2 }}>
          ครอบคลุม {pctVal}% ของงบ
        </div>
        <div style={{ color: "#8892a0", fontSize: 12, lineHeight: 1.5 }}>
          {pctVal}% of ad spend has tracked leads.
          {isLow && " Coverage is low — TRUE ROAS values may not reflect full performance."}
          {unattributed > 0 && ` (${n0(unattributed)} unattributed lead${unattributed !== 1 ? "s" : ""} excluded from entity rows.)`}
        </div>
      </div>
    </div>
  );
}

// ── Totals footer row ──────────────────────────────────────────────────────────

function TotalsRow({ totals }: { totals: TrueRoasResult["totals"] }) {
  const cellStyle: React.CSSProperties = {
    padding: "10px 12px",
    fontFamily: "'Fira Code', monospace",
    fontSize: 12,
    fontVariantNumeric: "tabular-nums",
    color: "#c8d0e0",
    borderTop: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.025)",
    fontWeight: 600,
  };
  return (
    <tr>
      <td style={{ ...cellStyle, color: "#e2e8f0", fontSize: 11, fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.05em", textTransform: "uppercase" }}>รวม / Total</td>
      <td style={cellStyle}>{baht(totals.spend)}</td>
      <td style={cellStyle}>{r2(totals.fbRoas)}</td>
      <td style={{ ...cellStyle, color: totals.trueRoas != null && totals.trueRoas >= TRUE_ROAS_GOOD ? "#31c48d" : totals.trueRoas != null && totals.trueRoas < TRUE_ROAS_WARN ? "#f87171" : "#f5b14c" }}>
        {r2(totals.trueRoas)}
      </td>
      <td style={cellStyle}>—</td>
      <td style={cellStyle}>{n0(totals.leads)}</td>
      <td style={cellStyle}>{n0(totals.won)}</td>
      <td style={cellStyle}>—</td>
      <td style={cellStyle}>—</td>
    </tr>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function TrueRoasTable({ initialAccounts = [] }: { initialAccounts?: Acct[] }) {
  const [accounts, setAccounts] = useState<Acct[]>(initialAccounts);
  const [acctId, setAcctId] = useState("");
  const [preset, setPreset] = useState("last_30d");
  const [level, setLevel] = useState<"campaign" | "ad">("campaign");
  const [data, setData] = useState<TrueRoasResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("trueRoas");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Load accounts if not server-prefetched
  useEffect(() => {
    if (accounts.length > 0) return;
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((a: Acct[] | { error: string }) => {
        if (Array.isArray(a) && a.length) setAccounts(a);
      })
      .catch(() => {});
  }, []);

  // Select first account
  useEffect(() => {
    if (!acctId && accounts.length > 0) {
      setAcctId(accounts[0].id);
    }
  }, [accounts, acctId]);

  // Fetch data
  const load = useCallback(async () => {
    if (!acctId) return;
    setLoading(true);
    setRefreshing(true);
    setError("");
    try {
      const url = `/api/true-roas?account=${encodeURIComponent(acctId)}&level=${level}&preset=${preset}`;
      const r = await fetch(url);
      const json = await r.json();
      if (json.error) throw new Error(json.error);
      setData(json as TrueRoasResult);
    } catch (e: any) {
      setError(e.message || "โหลดข้อมูลไม่ได้");
      setData(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [acctId, level, preset]);

  useEffect(() => { load(); }, [load]);

  // Sorting
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sortedRows = useMemo(() => {
    if (!data) return [];
    return [...data.rows].sort((a, b) => {
      const av = a[sortKey] as number | null;
      const bv = b[sortKey] as number | null;
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return sortDir === "desc" ? bv - av : av - bv;
    });
  }, [data, sortKey, sortDir]);

  // ── Styles ──────────────────────────────────────────────────────────────────

  const SELECT_STYLE: React.CSSProperties = {
    background: "#0a0e1a",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 8,
    padding: "6px 10px",
    color: "#c8d0e0",
    fontSize: 12,
    outline: "none",
    cursor: "pointer",
    fontFamily: "'DM Sans', sans-serif",
  };

  const TH_STYLE: React.CSSProperties = {
    padding: "10px 12px",
    textAlign: "left",
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.05em",
    textTransform: "uppercase" as const,
    color: "#8892a0",
    background: "#0a0e1a",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    whiteSpace: "nowrap",
    userSelect: "none",
    cursor: "pointer",
    fontFamily: "'DM Sans', sans-serif",
  };

  const TD_STYLE: React.CSSProperties = {
    padding: "10px 12px",
    fontSize: 13,
    fontFamily: "'Fira Code', monospace",
    fontVariantNumeric: "tabular-nums",
    color: "#c8d0e0",
    borderBottom: "1px solid rgba(255,255,255,0.04)",
    whiteSpace: "nowrap",
  };

  const acctName = accounts.find((a) => a.id === acctId)?.name ?? acctId;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: "24px 28px", minHeight: "100vh", background: "#050a14", color: "#e2e8f0" }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#f0f4ff", marginBottom: 4, fontFamily: "'DM Sans', sans-serif" }}>
          True ROAS
        </h1>
        <p style={{ fontSize: 13, color: "#8892a0", fontFamily: "'DM Sans', sans-serif" }}>
          ROAS ที่แท้จริงจากยอดขายจริง — เปรียบเทียบกับตัวเลขของ Facebook
        </p>
      </div>

      {/* Controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
        {/* Account selector */}
        <select
          value={acctId}
          onChange={(e) => setAcctId(e.target.value)}
          style={SELECT_STYLE}
          aria-label="เลือกบัญชี"
        >
          {accounts.length === 0 && <option value="">กำลังโหลด...</option>}
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>

        {/* Level toggle */}
        <div style={{ display: "flex", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, overflow: "hidden" }}>
          {(["campaign", "ad"] as const).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLevel(l)}
              style={{
                background: level === l ? "#2d88ff" : "#0a0e1a",
                color: level === l ? "#fff" : "#8892a0",
                border: "none",
                padding: "6px 14px",
                fontSize: 12,
                fontFamily: "'DM Sans', sans-serif",
                cursor: "pointer",
                fontWeight: level === l ? 600 : 400,
                transition: "background 0.15s, color 0.15s",
              }}
            >
              {l === "campaign" ? "แคมเปญ" : "โฆษณา"}
            </button>
          ))}
        </div>

        {/* Date preset */}
        <select
          value={preset}
          onChange={(e) => setPreset(e.target.value)}
          style={SELECT_STYLE}
          aria-label="ช่วงเวลา"
        >
          {PRESETS.map(([k, label]) => (
            <option key={k} value={k}>{label}</option>
          ))}
        </select>

        {/* Refresh */}
        <button
          type="button"
          onClick={load}
          disabled={refreshing}
          style={{
            ...SELECT_STYLE,
            display: "flex",
            alignItems: "center",
            gap: 6,
            opacity: refreshing ? 0.6 : 1,
            cursor: refreshing ? "not-allowed" : "pointer",
          }}
          title="โหลดใหม่"
        >
          <IcoRefresh spinning={refreshing} />
          <span>{refreshing ? "กำลังโหลด..." : "โหลดใหม่"}</span>
        </button>

        {/* Period label */}
        {data && (
          <span style={{ fontSize: 11, color: "#8892a0", fontFamily: "'Fira Code', monospace" }}>
            {data.period.since} → {data.period.until}
          </span>
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={{
          background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)",
          borderRadius: 10, padding: "10px 14px", color: "#f87171",
          fontSize: 13, marginBottom: 16, fontFamily: "'DM Sans', sans-serif",
        }}>
          {error}
        </div>
      )}

      {/* Coverage badge */}
      {data && !loading && (
        <CoverageBadge coverage={data.coverage} unattributed={data.unattributedLeads} />
      )}

      {/* Main card */}
      <div style={{
        background: "#0a0e1a",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 14,
        overflow: "hidden",
      }}>
        {/* Card header */}
        <div style={{
          padding: "14px 18px",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <div style={{ fontSize: 13, color: "#8892a0", fontFamily: "'DM Sans', sans-serif" }}>
            <span style={{ color: "#c8d0e0", fontWeight: 500 }}>{acctName}</span>
            {" · "}
            {level === "campaign" ? "แคมเปญ" : "โฆษณา"}
            {data && !loading && (
              <span style={{ fontFamily: "'Fira Code', monospace", fontSize: 11, marginLeft: 8 }}>
                ({data.rows.length} รายการ)
              </span>
            )}
          </div>
          {/* Totals summary chips */}
          {data && !loading && (
            <div style={{ display: "flex", gap: 16, fontSize: 11, fontFamily: "'Fira Code', monospace", color: "#8892a0" }}>
              <span>งบ <span style={{ color: "#c8d0e0" }}>{baht(data.totals.spend)}</span></span>
              <span>TRUE ROAS <span style={{
                color: data.totals.trueRoas != null && data.totals.trueRoas >= TRUE_ROAS_GOOD
                  ? "#31c48d"
                  : data.totals.trueRoas != null && data.totals.trueRoas < TRUE_ROAS_WARN
                    ? "#f87171"
                    : "#f5b14c",
                fontWeight: 600,
              }}>{r2(data.totals.trueRoas)}</span></span>
              <span>FB ROAS <span style={{ color: "#c8d0e0" }}>{r2(data.totals.fbRoas)}</span></span>
            </div>
          )}
        </div>

        {/* Table */}
        {loading ? (
          <SkeletonTable />
        ) : !data || data.rows.length === 0 ? (
          <div style={{ padding: "48px 24px", textAlign: "center", color: "#8892a0" }}>
            <div style={{ marginBottom: 12, opacity: 0.4 }}><IcoEmpty /></div>
            <div style={{ fontSize: 14, fontFamily: "'DM Sans', sans-serif", marginBottom: 6, color: "#c8d0e0" }}>
              ยังไม่มีข้อมูลการขาย
            </div>
            <div style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.6 }}>
              No sales recorded yet — mark leads as Won in the Leads inbox
              <br />
              เพื่อดูข้อมูล True ROAS ในหน้านี้
            </div>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 820 }}>
              <thead>
                <tr>
                  {/* Name column — not sortable */}
                  <th style={{ ...TH_STYLE, cursor: "default" }}>
                    {level === "campaign" ? "แคมเปญ" : "โฆษณา"}
                  </th>
                  {/* Sortable columns */}
                  {(
                    [
                      ["spend",       "งบ / Spend"],
                      ["fbRoas",      "FB ROAS"],
                      ["trueRoas",    "TRUE ROAS"],
                      ["gap",         "Gap (ตัวตรวจโกหก)"],
                      ["leads",       "Leads"],
                      ["won",         "Won"],
                      ["cvr",         "CVR"],
                      ["trueCac",     "TRUE CAC"],
                    ] as [SortKey | "fbRoas" | "leads" | "won", string][]
                  ).map(([key, label]) => {
                    const isSortable = ["spend", "trueRoas", "gap", "cvr", "trueCac", "realRevenue"].includes(key);
                    const isActive = sortKey === key;
                    return (
                      <th
                        key={key}
                        style={{
                          ...TH_STYLE,
                          cursor: isSortable ? "pointer" : "default",
                          color: isActive ? "#c8d0e0" : "#8892a0",
                        }}
                        onClick={isSortable ? () => handleSort(key as SortKey) : undefined}
                        title={isSortable ? `เรียงตาม ${label}` : undefined}
                      >
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                          {label}
                          {isSortable && (
                            <IcoSort dir={isActive ? sortDir : undefined} />
                          )}
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row) => (
                  <DataRow key={row.id} row={row} TD_STYLE={TD_STYLE} />
                ))}
              </tbody>
              <tfoot>
                <TotalsRow totals={data.totals} />
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Legend */}
      {data && !loading && data.rows.length > 0 && (
        <div style={{
          marginTop: 14, display: "flex", gap: 20, fontSize: 11,
          color: "#8892a0", fontFamily: "'DM Sans', sans-serif", flexWrap: "wrap",
        }}>
          <span><span style={{ color: "#31c48d" }}>●</span> TRUE ROAS ≥ {TRUE_ROAS_GOOD} (ดี)</span>
          <span><span style={{ color: "#f5b14c" }}>●</span> {TRUE_ROAS_WARN}–{TRUE_ROAS_GOOD} (กลาง)</span>
          <span><span style={{ color: "#f87171" }}>●</span> &lt; {TRUE_ROAS_WARN} (ต่ำ)</span>
          <span style={{ marginLeft: 8 }}><span style={{ color: "#f87171" }}>Gap +</span> = FB รายงานสูงเกินจริง</span>
          <span><span style={{ color: "#31c48d" }}>Gap −</span> = Hidden winner (FB ต่ำเกินจริง)</span>
        </div>
      )}

      {/* Spin keyframe injection */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Per-row data cell ──────────────────────────────────────────────────────────

function DataRow({ row, TD_STYLE }: { row: TrueRoasRow; TD_STYLE: React.CSSProperties }) {
  const trueRoasColor =
    row.trueRoas == null
      ? "#8892a0"
      : row.trueRoas >= TRUE_ROAS_GOOD
        ? "#31c48d"
        : row.trueRoas < TRUE_ROAS_WARN
          ? "#f87171"
          : "#f5b14c";

  // Gap: positive = FB over-reports (bad, red); negative = hidden winner (green)
  const gapColor =
    row.gap == null
      ? "#8892a0"
      : row.gap > 0.1
        ? "#f87171"
        : row.gap < -0.1
          ? "#31c48d"
          : "#c8d0e0";

  const gapLabel =
    row.gap == null
      ? "—"
      : row.gap > 0.1
        ? `+${pct(row.gap)} ▲ โกหก`
        : row.gap < -0.1
          ? `${pct(row.gap)} ▼ ซ่อน`
          : pct(row.gap);

  return (
    <tr style={{ transition: "background 0.1s" }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = "rgba(255,255,255,0.025)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = "transparent"; }}
    >
      {/* Name */}
      <td style={{ ...TD_STYLE, fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#e2e8f0", maxWidth: 280 }}>
        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={row.name}>
          {row.name}
        </div>
      </td>
      {/* Spend */}
      <td style={TD_STYLE}>{baht(row.spend)}</td>
      {/* FB ROAS */}
      <td style={{ ...TD_STYLE, color: "#8892a0" }}>{r2(row.fbRoas)}</td>
      {/* TRUE ROAS */}
      <td style={{ ...TD_STYLE, color: trueRoasColor, fontWeight: row.trueRoas != null ? 600 : 400 }}>
        {r2(row.trueRoas)}
      </td>
      {/* Gap */}
      <td style={{ ...TD_STYLE, color: gapColor, fontSize: 12 }}>{gapLabel}</td>
      {/* Leads */}
      <td style={{ ...TD_STYLE, color: row.leads === 0 ? "#4a5568" : "#c8d0e0" }}>{n0(row.leads)}</td>
      {/* Won */}
      <td style={{ ...TD_STYLE, color: row.won === 0 ? "#4a5568" : "#c8d0e0" }}>{n0(row.won)}</td>
      {/* CVR */}
      <td style={{ ...TD_STYLE, color: row.cvr == null ? "#4a5568" : "#c8d0e0" }}>
        {row.cvr == null ? "—" : pct(row.cvr)}
      </td>
      {/* TRUE CAC */}
      <td style={{ ...TD_STYLE, color: row.trueCac == null ? "#4a5568" : "#c8d0e0" }}>
        {row.trueCac == null ? "—" : baht(row.trueCac)}
      </td>
    </tr>
  );
}
