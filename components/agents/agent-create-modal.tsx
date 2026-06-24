"use client";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Account { id: string; name: string; active: boolean }

const COLORS = ["#5b6cff", "#31c48d", "#f5b14c", "#ff6b6b", "#a78bfa", "#22d3ee", "#f472b6", "#facc15"];
const MODELS: Record<string, string[]> = {
  anthropic: ["claude-opus-4-8", "claude-sonnet-4-6", "claude-haiku-4-5"],
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
};

export function AgentCreateModal({ open, onClose, onCreated }: {
  open: boolean; onClose: () => void; onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [provider, setProvider] = useState<"anthropic" | "openai">("anthropic");
  const [model, setModel] = useState(MODELS.anthropic[0]);
  const [apiKey, setApiKey] = useState("");
  const [accountId, setAccountId] = useState("");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [testState, setTestState] = useState<"idle" | "testing" | "ok" | "fail">("idle");
  const [testMsg, setTestMsg] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetch("/api/accounts").then((r) => r.json()).then((d) => {
      if (Array.isArray(d)) { setAccounts(d); if (d[0]) setAccountId(d[0].id); }
    }).catch(() => {});
  }, [open]);

  useEffect(() => { setModel(MODELS[provider][0]); }, [provider]);

  function reset() {
    setName(""); setColor(COLORS[0]); setProvider("anthropic"); setApiKey("");
    setSystemPrompt(""); setTestState("idle"); setTestMsg("");
  }

  async function testKey() {
    setTestState("testing"); setTestMsg("");
    try {
      const r = await fetch("/api/agents/test-key", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider, model, apiKey }),
      });
      const d = await r.json();
      if (d.ok) { setTestState("ok"); setTestMsg("Key works"); }
      else { setTestState("fail"); setTestMsg(d.error || "Invalid key"); }
    } catch (e: any) { setTestState("fail"); setTestMsg(e.message); }
  }

  async function create() {
    setSaving(true);
    try {
      const r = await fetch("/api/agents", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name, color, provider, model, apiKey, systemPrompt,
          accountId, scope: { accountId },
        }),
      });
      if (r.ok) { reset(); onCreated(); onClose(); }
    } finally { setSaving(false); }
  }

  const canCreate = name.trim() && apiKey.trim() && accountId && !saving;

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          style={{ background: "rgba(2,4,10,0.7)", backdropFilter: "blur(4px)" }}
          onClick={onClose}>
          <motion.div
            initial={{ scale: 0.94, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, y: 16 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl overflow-hidden"
            style={{ background: "#0a0e1a", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 20px 70px rgba(0,0,0,0.6)" }}>
            <div className="px-5 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
              <div className="text-[15px] font-bold text-[#e8eaf5]">เอเจนต์ใหม่</div>
              <div className="text-[11px] text-[#3a4a6a] mt-0.5">เพิ่มผู้ช่วยใหม่เข้าทีม</div>
            </div>

            <div className="px-5 py-4 space-y-4 max-h-[68vh] overflow-y-auto">
              <Field label="ชื่อ">
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น ผู้เฝ้าดูงบประมาณ"
                  className="w-full" style={inputStyle} />
              </Field>

              <Field label="สี">
                <div className="flex gap-2 flex-wrap">
                  {COLORS.map((c) => (
                    <button key={c} onClick={() => setColor(c)}
                      className="w-7 h-7 rounded-lg transition-transform"
                      style={{ background: c, outline: color === c ? "2px solid #fff" : "none", outlineOffset: 2, transform: color === c ? "scale(1.1)" : "scale(1)" }} />
                  ))}
                </div>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="ผู้ให้บริการ">
                  <select value={provider} onChange={(e) => setProvider(e.target.value as any)} style={inputStyle}>
                    <option value="anthropic">Anthropic</option>
                    <option value="openai">OpenAI</option>
                  </select>
                </Field>
                <Field label="โมเดล">
                  <select value={model} onChange={(e) => setModel(e.target.value)} style={inputStyle}>
                    {MODELS[provider].map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </Field>
              </div>

              <Field label="API Key">
                <div className="flex gap-2">
                  <input type="password" value={apiKey} onChange={(e) => { setApiKey(e.target.value); setTestState("idle"); }}
                    placeholder={provider === "openai" ? "sk-..." : "sk-ant-..."} className="flex-1" style={inputStyle} />
                  <button onClick={testKey} disabled={!apiKey || testState === "testing"}
                    className="px-3 rounded-lg text-[12px] font-medium whitespace-nowrap"
                    style={{ background: "rgba(91,108,255,0.15)", color: "#8a9aff", border: "1px solid rgba(91,108,255,0.3)" }}>
                    {testState === "testing" ? "..." : "ทดสอบ"}
                  </button>
                </div>
                {testMsg && <div className="text-[11px] mt-1" style={{ color: testState === "ok" ? "#31c48d" : "#ff6b6b" }}>{testMsg}</div>}
              </Field>

              <Field label="รับผิดชอบ">
                <select value={accountId} onChange={(e) => setAccountId(e.target.value)} style={inputStyle}>
                  <option value="all">🌐 ทุกบัญชี (ทั้ง dashboard)</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <div className="text-[11px] text-[#3a4a6a] mt-1">
                  {accountId === "all" ? "อ่านและดำเนินการได้ทุกบัญชีโฆษณา" : "จำกัดเฉพาะบัญชีนี้"}
                </div>
              </Field>

              <Field label="System Prompt (ไม่บังคับ)">
                <textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} rows={3}
                  placeholder="คุณคือเอเจนต์ดูแลโฆษณา วิเคราะห์ประสิทธิภาพและเสนอการหยุด/ปรับงบ อธิบายเหตุผลเสมอ"
                  className="w-full resize-none" style={inputStyle} />
              </Field>
            </div>

            <div className="px-5 py-4 flex justify-end gap-2" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
              <button onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] text-[#8a9aba]" style={{ background: "rgba(255,255,255,0.04)" }}>ยกเลิก</button>
              <button onClick={create} disabled={!canCreate}
                className="px-4 py-2 rounded-lg text-[13px] font-semibold"
                style={{ background: canCreate ? "linear-gradient(135deg,#5b6cff,#a78bfa)" : "rgba(255,255,255,0.06)", color: canCreate ? "#fff" : "#3a4a6a" }}>
                {saving ? "กำลังสร้าง…" : "สร้างเอเจนต์"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[11px] uppercase tracking-wide text-[#3a4a6a] font-semibold mb-1.5">{label}</div>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  background: "#070b14", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8,
  padding: "8px 10px", color: "#e8eaf5", fontSize: 13, outline: "none", width: "100%",
};
