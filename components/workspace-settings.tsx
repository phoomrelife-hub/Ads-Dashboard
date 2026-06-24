"use client";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

type Item = { id: string; name: string; active?: boolean };

// ── Reusable visibility toggle list (accounts, pages, …) ──
function ToggleList({
  title, subtitle, unit, items, hidden, loading, error, emptyText, dotColor, onToggle, onReset,
}: {
  title: string; subtitle: string; unit: string;
  items: Item[]; hidden: string[]; loading: boolean; error: string; emptyText: string;
  dotColor?: (it: Item) => string;
  onToggle: (id: string) => void; onReset: () => void;
}) {
  const allHidden = hidden.length > 0 && hidden.length === items.length;
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "#0c1220", border: "1px solid rgba(255,255,255,0.08)" }}>
      {/* section header */}
      <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div>
          <div className="text-[13px] font-semibold text-[#c9d1e0]">{title}</div>
          <div className="text-[11px] text-[#4a5a7a] mt-0.5">{subtitle}</div>
        </div>
        {hidden.length > 0 && (
          <button
            onClick={onReset}
            className="text-[11px] px-2.5 py-1 rounded-lg transition-colors"
            style={{ color: "#2d88ff", background: "rgba(45,136,255,0.08)", border: "1px solid rgba(45,136,255,0.15)" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(45,136,255,0.15)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(45,136,255,0.08)"; }}
          >
            รีเซ็ตทั้งหมด
          </button>
        )}
      </div>

      {/* all-hidden warning */}
      <AnimatePresence>
        {allHidden && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="px-4 overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-[12px] mt-3"
              style={{ background: "rgba(255,107,107,0.08)", border: "1px solid rgba(255,107,107,0.2)", color: "#ff6b6b" }}>
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5 flex-shrink-0">
                <path d="M8 6v3M8 11.5v.5" strokeLinecap="round" />
                <path d="M6.6 2.5L1 13h14L9.4 2.5a1.6 1.6 0 0 0-2.8 0z" strokeLinejoin="round" />
              </svg>
              ซ่อนทุก{unit}แล้ว — dashboard จะแสดงทุก{unit} (fallback อัตโนมัติ)
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* list */}
      <div className="py-2">
        {loading ? (
          [1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-3">
              <div className="w-2 h-2 rounded-full bg-[#1a2438] flex-shrink-0" />
              <div className="h-3 rounded-md bg-[#1a2438] flex-1" style={{ maxWidth: `${160 + i * 40}px` }} />
              <div className="w-9 h-5 rounded-full bg-[#1a2438] flex-shrink-0" />
            </div>
          ))
        ) : error ? (
          <div className="px-5 py-4 text-[13px] text-[#ff6b6b]">{error}</div>
        ) : items.length === 0 ? (
          <div className="px-5 py-4 text-[13px] text-[#3d4f6a]">{emptyText}</div>
        ) : (
          items.map((it) => {
            const isHidden = hidden.includes(it.id);
            return (
              <div key={it.id} className="flex items-center gap-3 px-5 py-3 transition-colors" style={{ opacity: isHidden ? 0.45 : 1 }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: dotColor ? dotColor(it) : (it.active ? "#31c48d" : "#3a4a6a") }} />
                <div className="flex-1 text-[13px] truncate" style={{ color: isHidden ? "#4a5a7a" : "#c9d1e0" }}>{it.name}</div>
                <button onClick={() => onToggle(it.id)} className="flex-shrink-0 relative"
                  style={{
                    width: 36, height: 20,
                    background: isHidden ? "rgba(255,255,255,0.06)" : "#2d88ff",
                    borderRadius: 10, border: `1px solid ${isHidden ? "rgba(255,255,255,0.1)" : "#2d88ff"}`,
                    transition: "background 0.18s, border-color 0.18s", cursor: "pointer",
                  }}>
                  <div style={{ width: 14, height: 14, background: "#fff", borderRadius: "50%", position: "absolute", top: 2, left: isHidden ? 2 : 18, transition: "left 0.18s", boxShadow: "0 1px 3px rgba(0,0,0,0.4)" }} />
                </button>
              </div>
            );
          })
        )}
      </div>

      {hidden.length > 0 && !allHidden && (
        <div className="px-5 pb-4 -mt-1 text-[12px] text-[#4a5a7a]">ซ่อน {hidden.length} จาก {items.length} {unit}</div>
      )}
    </div>
  );
}

export function WorkspaceSettings() {
  const [accounts, setAccounts] = useState<Item[]>([]);
  const [hidden, setHidden] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [pages, setPages] = useState<Item[]>([]);
  const [hiddenPages, setHiddenPages] = useState<string[]>([]);
  const [pagesLoading, setPagesLoading] = useState(true);
  const [pagesError, setPagesError] = useState("");

  // load hidden lists from localStorage
  useEffect(() => {
    try { const h = JSON.parse(localStorage.getItem("adsHiddenAccounts") || "[]"); if (Array.isArray(h)) setHidden(h); } catch {}
    try { const p = JSON.parse(localStorage.getItem("adsHiddenPages") || "[]"); if (Array.isArray(p)) setHiddenPages(p); } catch {}
  }, []);

  // accounts
  useEffect(() => {
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((a: Item[] | { error: string }) => {
        if (Array.isArray(a)) setAccounts(a);
        else setError((a as any).error || "โหลดบัญชีไม่ได้");
        setLoading(false);
      })
      .catch(() => { setError("โหลดบัญชีไม่ได้"); setLoading(false); });
  }, []);

  // all pages across all accounts
  useEffect(() => {
    fetch("/api/pages?act=all")
      .then((r) => r.json())
      .then((p: Item[] | { error: string }) => {
        if (Array.isArray(p)) setPages(p);
        else setPagesError((p as any).error || "โหลดเพจไม่ได้");
        setPagesLoading(false);
      })
      .catch(() => { setPagesError("โหลดเพจไม่ได้"); setPagesLoading(false); });
  }, []);

  const toggle = (key: string, list: string[], set: (v: string[]) => void) => (id: string) => {
    const next = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
    set(next);
    localStorage.setItem(key, JSON.stringify(next));
  };
  const reset = (key: string, set: (v: string[]) => void) => () => {
    set([]);
    localStorage.setItem(key, JSON.stringify([]));
  };

  return (
    <div style={{ background: "#060a12", minHeight: "100vh" }}>
      {/* top bar */}
      <div className="flex items-center gap-3 px-6 py-3 sticky top-0 z-30"
        style={{ background: "rgba(6,10,18,0.92)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#8a9aba" }} />
        <span className="text-[14px] font-semibold text-[#c9d1e0]">ตั้งค่าพื้นที่ทำงาน</span>
      </div>

      {/* content */}
      <div className="px-6 py-6 max-w-2xl flex flex-col gap-5">
        <ToggleList
          title="บัญชีโฆษณา"
          subtitle="เลือกบัญชีที่ต้องการซ่อนจาก dashboard"
          unit="บัญชี"
          items={accounts}
          hidden={hidden}
          loading={loading}
          error={error}
          emptyText="ไม่พบบัญชี"
          onToggle={toggle("adsHiddenAccounts", hidden, setHidden)}
          onReset={reset("adsHiddenAccounts", setHidden)}
        />

        <ToggleList
          title="เพจ"
          subtitle="เลือกเพจที่ต้องการซ่อนจากตัวกรองเพจ"
          unit="เพจ"
          items={pages}
          hidden={hiddenPages}
          loading={pagesLoading}
          error={pagesError}
          emptyText="ไม่พบเพจ"
          dotColor={() => "#f5b14c"}
          onToggle={toggle("adsHiddenPages", hiddenPages, setHiddenPages)}
          onReset={reset("adsHiddenPages", setHiddenPages)}
        />
      </div>
    </div>
  );
}
