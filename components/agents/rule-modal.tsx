"use client";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Rule, RuleMetric, RuleOp, RuleActionType, RuleLevel, PublicAgent } from "@/lib/agents/types";

const METRICS: [RuleMetric, string][] = [
  ["roas", "ROAS"], ["spend", "ค่าโฆษณา (฿)"], ["cpl", "ต้นทุน / ลีด"], ["cpc", "CPC"],
  ["ctr", "CTR %"], ["leads", "ลีด"], ["purchases", "ยอดซื้อ"], ["messaging", "ข้อความ"],
  ["frequency", "ความถี่"], ["cpm", "CPM"],
];
const OPS: RuleOp[] = [">", ">=", "<", "<=", "=="];
const LEVELS: [RuleLevel, string][] = [["ad", "โฆษณา"], ["adset", "ชุดโฆษณา"], ["campaign", "แคมเปญ"]];
const PRESETS = ["today", "yesterday", "last_7d", "last_30d", "this_month"];
const ACTIONS: [RuleActionType, string][] = [["pause", "หยุดชั่วคราว (ปิด)"], ["activate", "เปิดใช้งาน (เปิด)"], ["set_budget", "ตั้งงบรายวัน"]];

export function RuleModal({ open, agents, accounts, rule, defaultAccountId, onClose, onSaved }: {
  open: boolean; agents: PublicAgent[]; accounts: { id: string; name: string }[]; rule: Rule | null; defaultAccountId?: string; onClose: () => void; onSaved: () => void;
}) {
  const [accountId, setAccountId] = useState("all");
  const [agentId, setAgentId] = useState("");
  const [name, setName] = useState("");
  const [scheduleKind, setScheduleKind] = useState<"daily" | "interval">("daily");
  const [time, setTime] = useState("00:00");
  const [everyMinutes, setEveryMinutes] = useState(60);
  const [level, setLevel] = useState<RuleLevel>("ad");
  const [datePreset, setDatePreset] = useState("today");
  const [useCondition, setUseCondition] = useState(true);
  const [metric, setMetric] = useState<RuleMetric>("roas");
  const [op, setOp] = useState<RuleOp>(">");
  const [value, setValue] = useState(2);
  const [instruction, setInstruction] = useState("");
  const [actionType, setActionType] = useState<RuleActionType>("pause");
  const [dailyBudget, setDailyBudget] = useState(500);
  const [dryRun, setDryRun] = useState(true);
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAccountId(rule?.accountId || defaultAccountId || "all");
    setAgentId(rule?.agentId || "");
    if (rule) {
      setName(rule.name);
      setScheduleKind(rule.schedule.kind);
      setTime(rule.schedule.time || "00:00");
      setEveryMinutes(rule.schedule.everyMinutes || 60);
      setLevel(rule.level); setDatePreset(rule.datePreset);
      setUseCondition(!!rule.condition);
      if (rule.condition) { setMetric(rule.condition.metric); setOp(rule.condition.op); setValue(rule.condition.value); }
      setInstruction(rule.instruction || "");
      setActionType(rule.action.type); setDailyBudget(rule.action.dailyBudget || 500);
      setDryRun(rule.dryRun); setEnabled(rule.enabled);
    } else {
      setName(""); setScheduleKind("daily"); setTime("00:00"); setEveryMinutes(60);
      setLevel("ad"); setDatePreset("today"); setUseCondition(true);
      setMetric("roas"); setOp(">"); setValue(2); setInstruction("");
      setActionType("pause"); setDailyBudget(500); setDryRun(true); setEnabled(true);
    }
  }, [open, rule]);

  async function save() {
    setSaving(true);
    try {
      const body: any = {
        accountId,
        agentId: instruction.trim() ? agentId : undefined,
        name, enabled, dryRun, level, datePreset,
        condition: useCondition ? { metric, op, value: Number(value) } : undefined,
        instruction: instruction.trim() || undefined,
        action: { type: actionType, ...(actionType === "set_budget" ? { dailyBudget: Number(dailyBudget) } : {}) },
        schedule: scheduleKind === "daily" ? { kind: "daily", time } : { kind: "interval", everyMinutes: Number(everyMinutes) },
      };
      if (rule) {
        await fetch("/api/agents/rules", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: rule.id, patch: body }) });
      } else {
        await fetch("/api/agents/rules", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      }
      onSaved(); onClose();
    } finally { setSaving(false); }
  }

  const canSave = accountId && name.trim() && (useCondition || instruction.trim()) && (!instruction.trim() || agentId) && !saving;

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[110] flex items-center justify-center p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          style={{ background: "rgba(2,4,10,0.7)", backdropFilter: "blur(4px)" }} onClick={onClose}>
          <motion.div initial={{ scale: 0.94, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, y: 16 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }} onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl overflow-hidden"
            style={{ background: "#0a0e1a", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 20px 70px rgba(0,0,0,0.6)" }}>
            <div className="px-5 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
              <div className="text-[15px] font-bold text-[#e8eaf5]">{rule ? "แก้ไขกฎ" : "กฎอัตโนมัติใหม่"}</div>
              <div className="text-[11px] text-[#3a4a6a] mt-0.5">เมื่อถึงเวลา เอเจนต์จะตรวจสอบและดำเนินการ</div>
            </div>

            <div className="px-5 py-4 space-y-4 max-h-[68vh] overflow-y-auto">
              <Field label="รันบน (บัญชี)">
                <select value={accountId} onChange={(e) => setAccountId(e.target.value)} style={inp}>
                  <option value="all">🌐 ทุกบัญชี</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  {accountId !== "all" && !accounts.some((a) => a.id === accountId) && <option value={accountId}>{accountId}</option>}
                </select>
              </Field>

              <Field label="ชื่อกฎ">
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น หยุดโฆษณาที่ชนะตอนเที่ยงคืน" style={inp} />
              </Field>

              {/* schedule */}
              <Field label="เมื่อไหร่">
                <div className="flex gap-2">
                  <select value={scheduleKind} onChange={(e) => setScheduleKind(e.target.value as any)} style={{ ...inp, width: 130 }}>
                    <option value="daily">ทุกวันเวลา</option>
                    <option value="interval">ทุก ๆ</option>
                  </select>
                  {scheduleKind === "daily"
                    ? <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={inp} />
                    : <div className="flex items-center gap-2 flex-1">
                        <input type="number" min={1} value={everyMinutes} onChange={(e) => setEveryMinutes(+e.target.value)} style={inp} />
                        <span className="text-[12px] text-[#6a7a9a]">นาที</span>
                      </div>}
                </div>
              </Field>

              {/* scope */}
              <div className="grid grid-cols-2 gap-3">
                <Field label="ตรวจสอบ"><select value={level} onChange={(e) => setLevel(e.target.value as RuleLevel)} style={inp}>{LEVELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
                <Field label="ช่วงเวลาตัวชี้วัด"><select value={datePreset} onChange={(e) => setDatePreset(e.target.value)} style={inp}>{PRESETS.map((p) => <option key={p} value={p}>{p}</option>)}</select></Field>
              </div>

              {/* condition */}
              <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <label className="flex items-center gap-2 mb-2 cursor-pointer">
                  <input type="checkbox" checked={useCondition} onChange={(e) => setUseCondition(e.target.checked)} />
                  <span className="text-[12px] font-semibold text-[#c8d0e0]">เงื่อนไข (ถ้า...)</span>
                </label>
                {useCondition && (
                  <div className="flex gap-2">
                    <select value={metric} onChange={(e) => setMetric(e.target.value as RuleMetric)} style={{ ...inp, flex: 2 }}>{METRICS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                    <select value={op} onChange={(e) => setOp(e.target.value as RuleOp)} style={{ ...inp, width: 64 }}>{OPS.map((o) => <option key={o} value={o}>{o}</option>)}</select>
                    <input type="number" step="any" value={value} onChange={(e) => setValue(+e.target.value)} style={{ ...inp, width: 80 }} />
                  </div>
                )}
              </div>

              {/* action */}
              <Field label="แล้วทำ (การกระทำ)">
                <div className="flex gap-2">
                  <select value={actionType} onChange={(e) => setActionType(e.target.value as RuleActionType)} style={inp}>{ACTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                  {actionType === "set_budget" && <input type="number" value={dailyBudget} onChange={(e) => setDailyBudget(+e.target.value)} style={{ ...inp, width: 100 }} placeholder="฿/day" />}
                </div>
              </Field>

              {/* NL instruction (needs an agent) */}
              <Field label="คำสั่ง AI (ไม่บังคับ)">
                <textarea value={instruction} onChange={(e) => setInstruction(e.target.value)} rows={2}
                  placeholder="ไม่บังคับ: ให้เอเจนต์ตัดสิน เช่น 'หยุดโฆษณาที่ ROAS ต่ำและใช้งบสูง'" className="resize-none" style={inp} />
                {instruction.trim() && (
                  <select value={agentId} onChange={(e) => setAgentId(e.target.value)} style={{ ...inp, marginTop: 8 }}>
                    <option value="">เลือกเอเจนต์สำหรับรัน AI…</option>
                    {agents.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.provider})</option>)}
                  </select>
                )}
                {instruction.trim() && !agentId && <div className="text-[11px] mt-1" style={{ color: "#ff6b6b" }}>คำสั่ง AI ต้องการเอเจนต์ (สำหรับโมเดลและ API key)</div>}
              </Field>

              {/* toggles */}
              <div className="flex gap-2">
                <Toggle label="Dry-run (บันทึกเท่านั้น)" on={dryRun} onClick={() => setDryRun((v) => !v)} color="#f5b14c" />
                <Toggle label="เปิดใช้งาน" on={enabled} onClick={() => setEnabled((v) => !v)} color="#31c48d" />
              </div>
              {!dryRun && <div className="text-[11px]" style={{ color: "#ff6b6b" }}>⚠ โหมด Live — จะเปลี่ยนโฆษณาจริงโดยอัตโนมัติ</div>}
            </div>

            <div className="px-5 py-4 flex justify-end gap-2" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
              <button onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] text-[#8a9aba]" style={{ background: "rgba(255,255,255,0.04)" }}>ยกเลิก</button>
              <button onClick={save} disabled={!canSave} className="px-4 py-2 rounded-lg text-[13px] font-semibold"
                style={{ background: canSave ? "linear-gradient(135deg,#5b6cff,#a78bfa)" : "rgba(255,255,255,0.06)", color: canSave ? "#fff" : "#3a4a6a" }}>
                {saving ? "กำลังบันทึก…" : rule ? "บันทึกกฎ" : "สร้างกฎ"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><div className="text-[11px] uppercase tracking-wide text-[#3a4a6a] font-semibold mb-1.5">{label}</div>{children}</label>;
}
function Toggle({ label, on, onClick, color }: { label: string; on: boolean; onClick: () => void; color: string }) {
  return (
    <button onClick={onClick} className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] font-medium"
      style={{ background: on ? `${color}1a` : "rgba(255,255,255,0.04)", color: on ? color : "#6a7a9a", border: `1px solid ${on ? color + "55" : "transparent"}` }}>
      <span className="w-3.5 h-3.5 rounded flex items-center justify-center" style={{ background: on ? color : "rgba(255,255,255,0.1)" }}>
        {on && <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="#03130c" strokeWidth="2.5"><path d="M2.5 6l2.5 2.5 4.5-5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
      </span>
      {label}
    </button>
  );
}

const inp: React.CSSProperties = {
  background: "#070b14", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8,
  padding: "8px 10px", color: "#e8eaf5", fontSize: 13, outline: "none", width: "100%",
};
