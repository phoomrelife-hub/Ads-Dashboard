"use client";
import { useCallback, useEffect, useState } from "react";
import { RuleModal } from "@/components/agents/rule-modal";
import { RuleHistoryModal } from "@/components/agents/rule-history-modal";
import type { PublicAgent, Rule } from "@/lib/agents/types";

function scheduleLabel(r: Rule) {
  return r.schedule.kind === "daily" ? `ทุกวัน ${r.schedule.time}` : `ทุก ${r.schedule.everyMinutes}นาที`;
}
function ruleLabel(r: Rule) {
  const cond = r.condition ? `ถ้า ${r.condition.metric} ${r.condition.op} ${r.condition.value}` : "AI";
  const act = r.action.type === "set_budget" ? `ตั้งงบ ฿${r.action.dailyBudget}` : r.action.type;
  return `${cond} → ${act}`;
}
function ago(ts?: number) {
  if (!ts) return "ไม่เคยรัน";
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}วินาทีที่แล้ว`;
  if (s < 3600) return `${Math.floor(s / 60)}นาทีที่แล้ว`;
  if (s < 86400) return `${Math.floor(s / 3600)}ชั่วโมงที่แล้ว`;
  return `${Math.floor(s / 86400)}วันที่แล้ว`;
}

export default function AdsAutoPage() {
  const [agents, setAgents] = useState<PublicAgent[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editRule, setEditRule] = useState<Rule | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [filterAccount, setFilterAccount] = useState("all");
  const [historyRule, setHistoryRule] = useState<Rule | null>(null);
  const [hiddenAccts, setHiddenAccts] = useState<string[]>([]);

  const load = useCallback(async () => {
    const [a, r, ac] = await Promise.all([
      fetch("/api/agents").then((x) => x.json()),
      fetch("/api/agents/rules").then((x) => x.json()),
      fetch("/api/accounts").then((x) => x.json()),
    ]);
    setAgents(a.agents || []);
    setRules(r.rules || []);
    setAccounts(Array.isArray(ac) ? ac : []);
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    try { const h = JSON.parse(localStorage.getItem("adsHiddenAccounts") || "[]"); if (Array.isArray(h)) setHiddenAccts(h); } catch { }
  }, []);

  // Drop accounts hidden in Workspace Settings from the filter (all-hidden → show all).
  const visibleAccts = hiddenAccts.length && hiddenAccts.length < accounts.length
    ? accounts.filter((a) => !hiddenAccts.includes(a.id))
    : accounts;

  const agentMap = new Map(agents.map((a) => [a.id, a]));
  const accName = (id: string) => (id === "all" ? "ทุกบัญชี" : accounts.find((a) => a.id === id)?.name || id);

  async function toggleRule(r: Rule) {
    await fetch("/api/agents/rules", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: r.id, patch: { enabled: !r.enabled } }) });
    load();
  }
  async function toggleDry(r: Rule) {
    await fetch("/api/agents/rules", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: r.id, patch: { dryRun: !r.dryRun } }) });
    load();
  }
  async function delRule(id: string) {
    await fetch(`/api/agents/rules?id=${id}`, { method: "DELETE" });
    load();
  }
  async function runNow(id: string) {
    setRunning(id);
    try { await fetch(`/api/agents/cron/tick?force=${id}`, { method: "POST" }); await load(); }
    finally { setRunning(null); }
  }

  const shown = rules.filter((r) => filterAccount === "all" || r.accountId === filterAccount)
    .sort((a, b) => (b.lastRunAt || 0) - (a.lastRunAt || 0));

  return (
    <div className="min-h-screen" style={{ background: "#050810" }}>
      {/* header */}
      <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(255,107,107,0.12)", border: "1px solid rgba(255,107,107,0.25)" }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="#ff6b6b"><path d="M9.5 1L2 9.5h5.5L6 15l8.5-9H9L9.5 1z" /></svg>
          </div>
          <div>
            <div className="text-[17px] font-bold text-[#e8eaf5]">โฆษณาอัตโนมัติ</div>
            <div className="text-[12px] text-[#3a4a6a]">ระบบอัตโนมัติตามกำหนดเวลา — เอเจนต์ตรวจสอบเงื่อนไขและดำเนินการตามเวลาที่กำหนด</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select value={filterAccount} onChange={(e) => setFilterAccount(e.target.value)}
            style={{ background: "#0a0e1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "7px 10px", color: "#c8d0e0", fontSize: 12, outline: "none" }}>
            <option value="all">ทุกบัญชี</option>
            {visibleAccts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <button onClick={() => { setEditRule(null); setModalOpen(true); }}
            className="px-3.5 py-2 rounded-lg text-[12.5px] font-semibold"
            style={{ background: "linear-gradient(135deg,#5b6cff,#a78bfa)", color: "#fff" }}>
            + กฎใหม่
          </button>
        </div>
      </div>

      <div className="p-6 max-w-3xl mx-auto">
        {shown.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-[14px] text-[#8a9aba] mb-1">ไม่มีกฎ{filterAccount !== "all" ? "สำหรับบัญชีนี้" : ""}</div>
            <div className="text-[12px] text-[#3a4a6a]">กด <span className="text-[#5b6cff]">+ กฎใหม่</span> — เช่น "ทุกวัน 00:00 · ถ้า ROAS &gt; 2 · หยุด"</div>
          </div >
        ) : (
          <div className="space-y-2.5">
            {shown.map((r) => {
              const a = r.agentId ? agentMap.get(r.agentId) : undefined;
              return (
                <div key={r.id} className="rounded-xl p-4" style={{ background: "#0a0e1a", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <div className="flex items-center gap-2.5">
                    <button onClick={() => toggleRule(r)} title={r.enabled ? "เปิดใช้งาน — คลิกเพื่อปิด" : "ปิดอยู่ — คลิกเพื่อเปิด"}
                      className="w-9 h-5 rounded-full flex-shrink-0 relative transition-colors" style={{ background: r.enabled ? "#31c48d" : "#2a3a5a" }}>
                      <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" style={{ left: r.enabled ? 18 : 2 }} />
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] font-bold text-[#e8eaf5] truncate">{r.name}</span>
                        <button onClick={() => toggleDry(r)} className="text-[9px] px-1.5 py-0.5 rounded font-bold flex-shrink-0"
                          style={r.dryRun ? { background: "rgba(245,177,76,0.15)", color: "#f5b14c" } : { background: "rgba(255,107,107,0.15)", color: "#ff6b6b" }}>
                          {r.dryRun ? "DRY-RUN" : "LIVE"}
                        </button>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <span className="text-[11px] text-[#6a7a9a]">{accName(r.accountId)} · {scheduleLabel(r)} · {ruleLabel(r)} · {r.level}</span>
                        {r.agentId && a && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1" style={{ background: `${a.color}1a`, color: a.color }}>
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: a.color }} /> AI: {a.name}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {r.lastResult && <div className="text-[11px] text-[#5a6a8a] mt-2 break-words">รันล่าสุด {ago(r.lastRunAt)}: {r.lastResult}</div>}
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => runNow(r.id)} disabled={running === r.id}
                      className="px-3 py-1.5 rounded-lg text-[11.5px] font-semibold" style={{ background: "rgba(49,196,141,0.14)", color: "#31c48d" }}>
                      {running === r.id ? "กำลังรัน..." : "รันเดี๋ยวนี้"}
                    </button>
                    <button onClick={() => setHistoryRule(r)} className="px-3 py-1.5 rounded-lg text-[11.5px] font-medium" style={{ background: "rgba(255,255,255,0.05)", color: "#8a9aba" }}>ประวัติ</button>
                    <button onClick={() => { setEditRule(r); setModalOpen(true); }} className="px-3 py-1.5 rounded-lg text-[11.5px] font-medium" style={{ background: "rgba(255,255,255,0.05)", color: "#8a9aba" }}>แก้ไข</button>
                    <button onClick={() => delRule(r.id)} className="px-3 py-1.5 rounded-lg text-[11.5px] font-medium" style={{ background: "rgba(255,107,107,0.1)", color: "#ff6b6b" }}>ลบ</button>
                  </div>
                </div>
              );
            })}
          </div>
        )
        }
      </div >

      <RuleModal open={modalOpen} agents={agents} accounts={accounts} rule={editRule}
        defaultAccountId={filterAccount !== "all" ? filterAccount : undefined}
        onClose={() => setModalOpen(false)} onSaved={load} />
      <RuleHistoryModal ruleId={historyRule?.id ?? null} ruleName={historyRule?.name ?? ""} onClose={() => setHistoryRule(null)} />
    </div >
  );
}
