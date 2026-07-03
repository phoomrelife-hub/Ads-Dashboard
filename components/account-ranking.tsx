"use client";
import { useEffect, useMemo, useState } from "react";

// Shared account-selector ranking. Pulls per-account 7-day metrics once (cached server-side) and
// lets the user reorder any account picker by ROAS / spend / CPL / leads so the accounts needing
// attention float to the top. Built as a hook so it adapts to both native <select> pickers and the
// custom combobox dropdowns used across the app — each page renders `controls` next to its picker,
// iterates `sorted` instead of its raw list, and appends `tagOf(id)` to each label.

interface AccountStat { id: string; spend: number; roas: number; cpl: number; leads: number; purchases: number; error?: string }

const baht = (v: number) => "฿" + Math.round(v).toLocaleString("en-US");

// `attn` = the direction that surfaces accounts needing attention (low ROAS, high spend, high CPL,
// few leads) — applied automatically when the metric is picked.
const SORT_METRICS: { key: keyof AccountStat & string; label: string; attn: "asc" | "desc"; fmt: (s: AccountStat) => string }[] = [
  { key: "roas",  label: "ROAS",    attn: "asc",  fmt: (s) => (s.roas ? s.roas.toFixed(2) : "—") },
  { key: "spend", label: "ใช้จ่าย", attn: "desc", fmt: (s) => baht(s.spend) },
  { key: "cpl",   label: "CPL",     attn: "desc", fmt: (s) => (s.cpl ? baht(s.cpl) : "—") },
  { key: "leads", label: "Leads",   attn: "asc",  fmt: (s) => Math.round((s.leads || 0) + (s.purchases || 0)).toLocaleString("en-US") },
];

const DEFAULT_STYLE: React.CSSProperties = {
  background: "#0a0e1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8,
  padding: "6px 10px", color: "#c8d0e0", fontSize: 12, outline: "none", cursor: "pointer",
};

let statsCache: { at: number; key: string; data: Record<string, AccountStat> } | null = null;
const CLIENT_TTL = 5 * 60 * 1000; // mirror-ish of the server cache; avoids refetch on every mount

export function useAccountRanking<T extends { id: string }>(
  accounts: T[],
  hidden: string[],
  opts: { style?: React.CSSProperties } = {},
) {
  const hiddenKey = [...hidden].sort().join(",");
  const [stats, setStats] = useState<Record<string, AccountStat>>(
    () => (statsCache && statsCache.key === hiddenKey ? statsCache.data : {}),
  );
  const [loading, setLoading] = useState(false);
  const [metric, setMetric] = useState("");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    if (statsCache && statsCache.key === hiddenKey && Date.now() - statsCache.at < CLIENT_TTL) {
      setStats(statsCache.data);
      return;
    }
    setLoading(true);
    const q = hidden.length ? `?hidden=${encodeURIComponent(hidden.join(","))}` : "";
    fetch(`/api/agents/account-stats${q}`)
      .then((r) => r.json())
      .then((d: { stats?: AccountStat[] }) => {
        if (!Array.isArray(d.stats)) return;
        const map = Object.fromEntries(d.stats.map((s) => [s.id, s]));
        statsCache = { at: Date.now(), key: hiddenKey, data: map };
        setStats(map);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hiddenKey]);

  const cfg = SORT_METRICS.find((m) => m.key === metric);

  const sorted = useMemo(() => {
    if (!cfg) return accounts;
    return [...accounts].sort((a, b) => {
      const sa = stats[a.id], sb = stats[b.id];
      const va = sa && !sa.error ? Number(sa[cfg.key]) : null;
      const vb = sb && !sb.error ? Number(sb[cfg.key]) : null;
      if (va == null && vb == null) return 0;
      if (va == null) return 1;   // accounts with no data sink to the bottom, either direction
      if (vb == null) return -1;
      return dir === "asc" ? va - vb : vb - va;
    });
  }, [accounts, cfg, dir, stats]);

  const tagOf = (id: string) => {
    const st = stats[id];
    return cfg && st && !st.error ? ` · ${cfg.label} ${cfg.fmt(st)}` : "";
  };

  const style = opts.style ?? DEFAULT_STYLE;
  const controls = (
    <>
      <select
        value={metric}
        onChange={(e) => {
          const next = e.target.value;
          setMetric(next);
          const c = SORT_METRICS.find((m) => m.key === next);
          if (c) setDir(c.attn);
        }}
        style={style}
        title="เรียงบัญชีตามผลงาน 7 วันล่าสุด"
      >
        <option value="">เรียงตามปกติ</option>
        {SORT_METRICS.map((m) => <option key={m.key} value={m.key}>เรียงตาม {m.label}</option>)}
      </select>
      {cfg && (
        <button
          type="button"
          onClick={() => setDir((d) => (d === "asc" ? "desc" : "asc"))}
          style={{ ...style, whiteSpace: "nowrap" }}
          title="สลับมาก/น้อย"
        >
          {dir === "asc" ? "↑ น้อยสุด" : "↓ มากสุด"}
        </button>
      )}
    </>
  );

  return { sorted, tagOf, controls, loading, ranking: !!cfg };
}
