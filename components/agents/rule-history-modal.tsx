"use client";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { RuleRun } from "@/lib/agents/types";

const STATUS: Record<string, { c: string; label: string }> = {
  applied: { c: "#31c48d", label: "APPLIED" },
  "dry-run": { c: "#f5b14c", label: "DRY-RUN" },
  error: { c: "#ff6b6b", label: "ERROR" },
  info: { c: "#6a7a9a", label: "INFO" },
};
function when(ts: number) {
  const d = new Date(ts);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function RuleHistoryModal({ ruleId, ruleName, onClose }: { ruleId: string | null; ruleName: string; onClose: () => void }) {
  const [runs, setRuns] = useState<RuleRun[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ruleId) return;
    setLoading(true);
    fetch(`/api/agents/rules/runs?ruleId=${ruleId}&limit=50`).then((r) => r.json())
      .then((d) => setRuns(d.runs || [])).catch(() => {}).finally(() => setLoading(false));
  }, [ruleId]);

  return (
    <AnimatePresence>
      {ruleId && (
        <motion.div className="fixed inset-0 z-[120] flex items-center justify-center p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          style={{ background: "rgba(2,4,10,0.72)", backdropFilter: "blur(4px)" }} onClick={onClose}>
          <motion.div initial={{ scale: 0.95, y: 14 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 14 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }} onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-2xl overflow-hidden flex flex-col"
            style={{ background: "#0a0e1a", border: "1px solid rgba(255,255,255,0.1)", maxHeight: "82vh", boxShadow: "0 20px 70px rgba(0,0,0,0.6)" }}>
            <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
              <div>
                <div className="text-[15px] font-bold text-[#e8eaf5]">ประวัติการรัน</div>
                <div className="text-[11px] text-[#3a4a6a] mt-0.5">{ruleName} — สิ่งที่รัน เมื่อไหร่ และกับโฆษณาใด</div>
              </div>
              <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-[#4a5a7a]" style={{ background: "rgba(255,255,255,0.04)" }}>
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round"/></svg>
              </button>
            </div>

            <div className="overflow-y-auto p-4 space-y-3">
              {loading && <div className="text-[12px] text-[#3a4a6a]">Loading…</div>}
              {!loading && runs.length === 0 && <div className="text-[12px] text-[#3a4a6a]">ยังไม่มีการรัน กด "รันเดี๋ยวนี้" หรือรอตามกำหนดเวลา</div>}
              {runs.map((run) => (
                <div key={run.id} className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.07)" }}>
                  <div className="px-3 py-2 flex items-center gap-2 flex-wrap" style={{ background: "rgba(255,255,255,0.03)" }}>
                    <span className="text-[12px] font-semibold text-[#e8eaf5]">{when(run.ts)}</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-bold" style={{ background: run.dryRun ? "rgba(245,177,76,0.15)" : "rgba(255,107,107,0.15)", color: run.dryRun ? "#f5b14c" : "#ff6b6b" }}>{run.dryRun ? "DRY-RUN" : "LIVE"}</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.06)", color: "#8a9aba" }}>{run.trigger}</span>
                    <span className="text-[10px] text-[#3a4a6a] ml-auto">{run.items.filter((i) => i.status === "applied" || i.status === "dry-run").length} ดำเนินการ</span>
                  </div>
                  <div className="p-3 space-y-1.5">
                    {run.items.map((it, i) => {
                      const st = STATUS[it.status] || STATUS.info;
                      return (
                        <div key={i} className="flex items-start gap-2 text-[12px]">
                          <span className="mt-0.5 text-[8px] px-1.5 py-0.5 rounded font-bold flex-shrink-0" style={{ background: `${st.c}1f`, color: st.c }}>{st.label}</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-[#d8deec] break-words">
                              <span className="font-semibold">{it.action}</span>{" "}
                              <span className="text-[#aab4c8]">{it.entityName}</span>
                              {it.metric != null && <span className="text-[#6a7a9a]"> · {it.metric}{it.value != null ? ` ${it.value}` : ""}</span>}
                            </div>
                            {it.note && it.status === "error" && <div className="text-[10px]" style={{ color: "#ff6b6b" }}>{it.note}</div>}
                            {it.entityId && <div className="text-[9px] text-[#3a4a6a]">{it.entityId}</div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
