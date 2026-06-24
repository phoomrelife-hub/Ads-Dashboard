"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { PublicAgent, LogEntry, AgentStatus, SessionSummary } from "@/lib/agents/types";

const MODELS: Record<string, string[]> = {
  anthropic: ["claude-opus-4-8", "claude-sonnet-4-6", "claude-haiku-4-5"],
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
};

function ago(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}วินาทีที่แล้ว`;
  if (s < 3600) return `${Math.floor(s / 60)}นาทีที่แล้ว`;
  if (s < 86400) return `${Math.floor(s / 3600)}ชั่วโมงที่แล้ว`;
  return `${Math.floor(s / 86400)}วันที่แล้ว`;
}

export function AgentProfile({ agent, status, onBack, onOpenChat, onSaved }: {
  agent: PublicAgent;
  status: AgentStatus;
  onBack: () => void;
  onOpenChat: (id: string, sessionId?: string) => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(agent.name);
  const [provider, setProvider] = useState(agent.provider);
  const [model, setModel] = useState(agent.model);
  const [accountId, setAccountId] = useState(agent.scope.accountId);
  const [apiKey, setApiKey] = useState("");
  const [keyMsg, setKeyMsg] = useState("");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => { fetch("/api/accounts").then((r) => r.json()).then((d) => Array.isArray(d) && setAccounts(d)).catch(() => {}); }, []);
  const isAll = agent.scope.accountId === "all";
  const accountName = isAll ? "ทุกบัญชี" : (accounts.find((a) => a.id === agent.scope.accountId)?.name || agent.scope.accountId);

  useEffect(() => {
    setName(agent.name); setModel(agent.model); setProvider(agent.provider);
    setAccountId(agent.scope.accountId); setApiKey(""); setKeyMsg("");
  }, [agent.id, agent.name, agent.model, agent.provider, agent.scope.accountId]);

  function changeProvider(p: "anthropic" | "openai") {
    const m = MODELS[p][0];
    setProvider(p); setModel(m); patch({ provider: p, model: m });
  }
  async function updateKey() {
    if (!apiKey.trim()) return;
    setKeyMsg("saving…");
    await patch({ apiKey: apiKey.trim() });
    setApiKey(""); setKeyMsg("✓ key updated");
  }

  const loadLogs = () =>
    fetch(`/api/agents/logs?agentId=${agent.id}&limit=80`).then((r) => r.json()).then((d) => setLogs(d.logs || [])).catch(() => {});
  const loadSessions = () =>
    fetch(`/api/agents/sessions?agentId=${agent.id}`).then((r) => r.json()).then((d) => setSessions(d.sessions || [])).catch(() => {});
  useEffect(() => {
    loadLogs(); loadSessions();
    const t = setInterval(() => { loadLogs(); loadSessions(); }, 5000);
    return () => clearInterval(t);
    /* eslint-disable-next-line */
  }, [agent.id]);

  async function removeSession(id: string) {
    await fetch(`/api/agents/sessions?sessionId=${id}`, { method: "DELETE" }).catch(() => {});
    setSessions((p) => p.filter((s) => s.id !== id));
  }

  async function patch(p: Record<string, unknown>) {
    await fetch("/api/agents", {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: agent.id, patch: p }),
    });
    onSaved();
  }

  const tasks = logs.filter((l) => l.kind === "task").length;
  const actions = logs.filter((l) => l.kind === "action").length;
  const lastActive = logs[0]?.ts;
  const dot = status === "thinking" ? "#5b6cff" : status === "acting" ? "#ff6b6b" : "#3a4a6a";

  return (
    <div className="flex flex-col h-full">
      {/* header */}
      <div className="flex items-center gap-2 px-3 py-2.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <button onClick={onBack} className="w-7 h-7 rounded-lg flex items-center justify-center text-[#8a9aba]" style={{ background: "rgba(255,255,255,0.04)" }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M10 4l-4 4 4 4" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <span className="text-[12px] uppercase tracking-wide text-[#3a4a6a] font-semibold">โปรไฟล์</span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* identity */}
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl flex-shrink-0 relative" style={{ background: agent.color }}>
            <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full" style={{ background: dot, border: "2px solid #0a0e1a" }} />
          </div>
          <div className="flex-1 min-w-0">
            <input value={name} onChange={(e) => setName(e.target.value)}
              onBlur={() => name.trim() && name !== agent.name && patch({ name: name.trim() })}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              className="w-full bg-transparent text-[15px] font-bold text-[#e8eaf5] outline-none"
              style={{ borderBottom: "1px solid transparent" }}
              onFocus={(e) => (e.target.style.borderBottomColor = "rgba(91,108,255,0.5)")}
              onBlurCapture={(e) => (e.target.style.borderBottomColor = "transparent")} />
            <div className="text-[11px] text-[#3a4a6a] capitalize">{agent.provider} · {agent.model}</div>
          </div>
        </div>

        {/* responsible for */}
        <div className="rounded-lg px-3 py-2 flex items-center gap-2" style={{ background: isAll ? "rgba(167,139,250,0.1)" : "rgba(91,108,255,0.08)", border: `1px solid ${isAll ? "rgba(167,139,250,0.3)" : "rgba(91,108,255,0.22)"}` }}>
          <span className="text-[13px]">{isAll ? "🌐" : "🎯"}</span>
          <div className="min-w-0">
            <div className="text-[9px] uppercase tracking-wide text-[#3a4a6a] font-semibold">รับผิดชอบ</div>
            <div className="text-[12.5px] font-semibold text-[#e8eaf5] truncate">{accountName}{isAll ? " · ทั้ง dashboard" : ""}</div>
          </div>
        </div>

        {/* stats */}
        <div className="grid grid-cols-3 gap-2">
          <Stat label="งาน" value={String(tasks)} />
          <Stat label="การกระทำ" value={String(actions)} />
          <Stat label="ใช้งานล่าสุด" value={lastActive ? ago(lastActive) : "—"} />
        </div>

        {/* provider + model */}
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <div className="text-[11px] uppercase tracking-wide text-[#3a4a6a] font-semibold mb-1.5">ผู้ให้บริการ</div>
            <select value={provider} onChange={(e) => changeProvider(e.target.value as any)} style={selStyle}>
              <option value="anthropic">Anthropic</option>
              <option value="openai">OpenAI</option>
            </select>
          </label>
          <label className="block">
            <div className="text-[11px] uppercase tracking-wide text-[#3a4a6a] font-semibold mb-1.5">โมเดล</div>
            <select value={model} onChange={(e) => { setModel(e.target.value); patch({ model: e.target.value }); }} style={selStyle}>
              {(MODELS[provider] || [model]).map((m) => <option key={m} value={m}>{m}</option>)}
              {!MODELS[provider]?.includes(model) && <option value={model}>{model}</option>}
            </select>
          </label>
        </div>

        {/* responsible (account scope) */}
        <label className="block">
          <div className="text-[11px] uppercase tracking-wide text-[#3a4a6a] font-semibold mb-1.5">รับผิดชอบ</div>
          <select value={accountId} onChange={(e) => { setAccountId(e.target.value); patch({ accountId: e.target.value }); }} style={selStyle}>
            <option value="all">🌐 ทุกบัญชี (ทั้ง dashboard)</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            {accountId !== "all" && !accounts.some((a) => a.id === accountId) && <option value={accountId}>{accountId}</option>}
          </select>
        </label>

        {/* api key */}
        <label className="block">
          <div className="text-[11px] uppercase tracking-wide text-[#3a4a6a] font-semibold mb-1.5">
            API key {agent.hasKey && <span style={{ color: "#31c48d" }}>· ตั้งค่าแล้ว</span>}
          </div>
          <div className="flex gap-2">
            <input type="password" value={apiKey} onChange={(e) => { setApiKey(e.target.value); setKeyMsg(""); }}
              placeholder={agent.hasKey ? "•••••••• (replace)" : (provider === "openai" ? "sk-..." : "sk-ant-...")}
              className="flex-1" style={selStyle} />
            <button onClick={updateKey} disabled={!apiKey.trim()}
              className="px-3 rounded-lg text-[12px] font-medium whitespace-nowrap"
              style={{ background: apiKey.trim() ? "rgba(91,108,255,0.15)" : "rgba(255,255,255,0.04)", color: apiKey.trim() ? "#8a9aff" : "#3a4a6a", border: apiKey.trim() ? "1px solid rgba(91,108,255,0.3)" : "1px solid transparent" }}>
              อัปเดต
            </button>
          </div>
          {keyMsg && <div className="text-[11px] mt-1" style={{ color: "#31c48d" }}>{keyMsg}</div>}
        </label>

        <button onClick={() => onOpenChat(agent.id)}
          className="w-full py-2 rounded-lg text-[13px] font-semibold flex items-center justify-center gap-1.5"
          style={{ background: "linear-gradient(135deg,#5b6cff,#a78bfa)", color: "#fff" }}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M8 3v10M3 8h10"/></svg>
          แชทใหม่
        </button>

        {/* automation lives on Ads Auto */}
        <Link href="/ads-auto" className="flex items-center justify-between rounded-lg px-3 py-2"
          style={{ background: "rgba(255,107,107,0.08)", border: "1px solid rgba(255,107,107,0.2)" }}>
          <div className="flex items-center gap-2">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="#ff6b6b"><path d="M9.5 1L2 9.5h5.5L6 15l8.5-9H9L9.5 1z"/></svg>
            <span className="text-[12px] font-semibold text-[#e8eaf5]">กฎอัตโนมัติ</span>
          </div>
          <span className="text-[11px] text-[#8a9aba]">โฆษณาอัตโนมัติ →</span>
        </Link>

        {/* sessions */}
        <div>
          <div className="text-[11px] uppercase tracking-wide text-[#3a4a6a] font-semibold mb-1.5">
            เซสชัน{sessions.length > 0 && <span className="text-[#5b6cff]"> · {sessions.length}</span>}
          </div>
          <div className="space-y-1.5">
            {sessions.length === 0 && <div className="text-[12px] text-[#3a4a6a]">ยังไม่มีการสนทนา — กด แชทใหม่</div>}
            {sessions.map((s) => (
              <div key={s.id} className="group relative rounded-lg" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
                <button onClick={() => onOpenChat(agent.id, s.id)} className="w-full text-left px-2.5 py-2 pr-7"
                  onMouseEnter={(e) => (e.currentTarget.parentElement!.style.background = "rgba(91,108,255,0.08)")}
                  onMouseLeave={(e) => (e.currentTarget.parentElement!.style.background = "rgba(255,255,255,0.03)")}>
                  <div className="text-[12.5px] font-medium text-[#e8eaf5] truncate">{s.title}</div>
                  {s.preview && <div className="text-[11px] text-[#6a7a9a] truncate mt-0.5">{s.preview}</div>}
                  <div className="text-[10px] text-[#3a4a6a] mt-0.5">{s.messageCount} ข้อความ · {ago(s.updatedAt)}</div>
                </button>
                <button onClick={() => removeSession(s.id)} title="ลบเซสชัน"
                  className="absolute top-2 right-1.5 w-5 h-5 rounded flex items-center justify-center text-[#3a4a6a] opacity-0 group-hover:opacity-100 hover:text-[#ff6b6b]">
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 4h10M6 4V2.5h4V4M5 4l.5 9h5L11 4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg p-2 text-center" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
      <div className="text-[14px] font-bold text-[#e8eaf5] truncate">{value}</div>
      <div className="text-[9px] uppercase tracking-wide text-[#3a4a6a] mt-0.5">{label}</div>
    </div>
  );
}

const selStyle: React.CSSProperties = {
  background: "#070b14", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8,
  padding: "8px 10px", color: "#e8eaf5", fontSize: 13, outline: "none", width: "100%",
};
