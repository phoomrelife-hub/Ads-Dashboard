"use client";
import { motion, AnimatePresence } from "framer-motion";
import type { ToolSource } from "@/lib/agents/types";

function toolLabel(t: string) {
  return t === "get_insights" ? "ข้อมูล Insights" : t === "list_accounts" ? "รายการบัญชี" : t;
}
const num = (v: unknown) => {
  const n = Number(v);
  if (!isFinite(n) || n === 0) return "—";
  return Math.abs(n) >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : n.toFixed(2);
};

export function SourceModal({ sources, onClose }: { sources: ToolSource[] | null; onClose: () => void }) {
  return (
    <AnimatePresence>
      {sources && (
        <motion.div className="fixed inset-0 z-[120] flex items-center justify-center p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          style={{ background: "rgba(2,4,10,0.72)", backdropFilter: "blur(4px)" }} onClick={onClose}>
          <motion.div initial={{ scale: 0.95, y: 14 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 14 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }} onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-2xl overflow-hidden flex flex-col"
            style={{ background: "#0a0e1a", border: "1px solid rgba(255,255,255,0.1)", maxHeight: "82vh", boxShadow: "0 20px 70px rgba(0,0,0,0.6)" }}>
            <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
              <div>
                <div className="text-[15px] font-bold text-[#e8eaf5]">ข้อมูลแหล่งที่มา</div>
                <div className="text-[11px] text-[#3a4a6a] mt-0.5">สิ่งที่เอเจนต์อ่านเพื่อตอบ — ตรงจาก Facebook</div>
              </div>
              <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-[#4a5a7a]" style={{ background: "rgba(255,255,255,0.04)" }}>
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round"/></svg>
              </button>
            </div>

            <div className="overflow-y-auto p-4 space-y-4">
              {sources.length === 0 && <div className="text-[12px] text-[#3a4a6a]">คำตอบนี้ไม่ได้ใช้ข้อมูลภายนอก (ไม่มีการเรียกใช้เครื่องมือ)</div>}
              {sources.map((s) => (
                <div key={s.id} className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.07)" }}>
                  {/* header with args as chips */}
                  <div className="px-3 py-2 flex flex-wrap items-center gap-1.5" style={{ background: "rgba(91,108,255,0.06)" }}>
                    <span className="text-[12px] font-bold text-[#9aa8ff]">{toolLabel(s.tool)}</span>
                    {Object.entries(s.args || {}).map(([k, v]) => (
                      <span key={k} className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.06)", color: "#8a9aba" }}>
                        {k}: <span className="text-[#c8d0e0]">{String(v)}</span>
                      </span>
                    ))}
                  </div>
                  <div className="p-3">{renderResult(s)}</div>
                </div>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function renderResult(s: ToolSource) {
  const r: any = s.result;
  if (s.tool === "list_accounts" && Array.isArray(r)) {
    return (
      <div className="space-y-1">
        <div className="text-[11px] text-[#3a4a6a] mb-1">{r.length} บัญชี</div>
        {r.slice(0, 30).map((a: any) => (
          <div key={a.id} className="flex items-center gap-2 text-[12px]">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: a.active ? "#31c48d" : "#3a4a6a" }} />
            <span className="text-[#d8deec]">{a.name}</span>
            <span className="text-[10px] text-[#3a4a6a]">{a.id}</span>
          </div>
        ))}
      </div>
    );
  }
  if (s.tool === "get_insights" && r?.rows) {
    const rows: any[] = r.rows;
    const t = r.totals || {};
    return (
      <div>
        <div className="flex flex-wrap gap-3 mb-2 text-[11px]">
          <Totl label="แถว" v={String(rows.length)} />
          <Totl label="ค่าโฆษณา" v={`฿${num(t.spend)}`} />
          <Totl label="ลีด" v={num(t.leads)} />
          <Totl label="ยอดซื้อ" v={num(t.purchases)} />
        </div>
        <div className="overflow-x-auto rounded-lg" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
          <table className="w-full text-[11px]" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "rgba(255,255,255,0.03)" }}>
                {["ชื่อ", "สถานะ", "ค่าโฆษณา", "ROAS", "ลีด", "CPL"].map((h) => (
                  <th key={h} className="text-left px-2 py-1.5 text-[#5a6a8a] font-semibold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 40).map((row: any, i: number) => (
                <tr key={row.id || i} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                  <td className="px-2 py-1.5 text-[#d8deec] max-w-[150px] truncate">{row.name}</td>
                  <td className="px-2 py-1.5"><span style={{ color: row.status === "ACTIVE" ? "#31c48d" : "#6a7a9a" }}>{row.status}</span></td>
                  <td className="px-2 py-1.5 text-[#c8d0e0]">฿{num(row.spend)}</td>
                  <td className="px-2 py-1.5 text-[#c8d0e0]">{num(row.roas)}</td>
                  <td className="px-2 py-1.5 text-[#c8d0e0]">{num(row.leads)}</td>
                  <td className="px-2 py-1.5 text-[#c8d0e0]">฿{num(row.cpl)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length > 40 && <div className="text-[10px] text-[#3a4a6a] mt-1">…และอีก {rows.length - 40} แถว</div>}
      </div>
    );
  }
  // fallback: raw JSON
  return <pre className="text-[10.5px] text-[#8a9aba] whitespace-pre-wrap break-words" style={{ fontFamily: "'Fira Code', monospace" }}>{JSON.stringify(r, null, 2).slice(0, 1500)}</pre>;
}

function Totl({ label, v }: { label: string; v: string }) {
  return <span><span className="text-[#3a4a6a]">{label}: </span><span className="text-[#e8eaf5] font-semibold">{v}</span></span>;
}
