"use client";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { Md } from "./markdown";
import { SourceModal } from "./source-modal";
import type { PublicAgent, ChatMessage, ProposedAction, AgentStatus, ToolSource } from "@/lib/agents/types";

interface Props {
  agent: PublicAgent;
  /** resume this saved conversation; omit to start a fresh one */
  sessionId?: string;
  onClose: () => void;
  onStatus: (id: string, status: AgentStatus, needsConfirm: boolean) => void;
  onDelete: (id: string) => void;
  onActivity?: () => void;
}

interface Entry { role: "user" | "assistant"; text: string; proposals?: ProposedAction[]; sources?: ToolSource[]; done?: boolean }

export function AgentChat({ agent, sessionId, onClose, onStatus, onDelete, onActivity }: Props) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [sourceView, setSourceView] = useState<ToolSource[] | null>(null);
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);

  // session persistence: sidRef tracks the live session id, loadedRef skips the
  // save that the resume-load itself would otherwise trigger, busyRef gates saving
  // to settled turns only.
  const sidRef = useRef<string | undefined>(sessionId);
  const loadedRef = useRef(false);
  const busyRef = useRef(false);
  useEffect(() => { busyRef.current = busy; }, [busy]);

  // resume a saved conversation
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    fetch(`/api/agents/sessions?sessionId=${sessionId}`).then((r) => r.json()).then((d) => {
      if (cancelled || !d.session) return;
      sidRef.current = d.session.id;
      loadedRef.current = true;
      setEntries((d.session.messages as ChatMessage[])
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role as "user" | "assistant", text: m.content })));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [sessionId]);

  // autosave the transcript once a turn settles (create on first save)
  useEffect(() => {
    if (entries.length === 0) return;
    if (loadedRef.current) { loadedRef.current = false; return; }
    if (busyRef.current) return;
    const messages = entries.filter((e) => e.text).map((e) => ({ role: e.role, content: e.text }));
    if (!messages.length) return;
    fetch("/api/agents/sessions", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: sidRef.current, agentId: agent.id, messages }),
    }).then((r) => r.json()).then((d) => {
      if (!d.session) return;
      const created = !sidRef.current;
      sidRef.current = d.session.id;
      if (created) onActivity?.();
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, busy]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [entries, busy]);

  function transcript(extra: Entry[]): ChatMessage[] {
    return [...entries, ...extra]
      .filter((e) => e.text)
      .map((e) => ({ role: e.role, content: e.text } as ChatMessage));
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    const userEntry: Entry = { role: "user", text };
    const next = [...entries, userEntry];
    setEntries(next);
    setBusy(true);
    onStatus(agent.id, "thinking", false);
    try {
      const r = await fetch("/api/agents/chat", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ agentId: agent.id, messages: transcript([userEntry]) }),
      });
      const d = await r.json();
      if (d.error) {
        setEntries((p) => [...p, { role: "assistant", text: `⚠️ ${d.error}` }]);
      } else {
        const hasProps = d.proposals?.length > 0;
        setEntries((p) => [...p, { role: "assistant", text: d.text || "(no response)", proposals: hasProps ? d.proposals : undefined, sources: d.sources?.length ? d.sources : undefined }]);
        onStatus(agent.id, "idle", hasProps);
      }
    } catch (e: any) {
      setEntries((p) => [...p, { role: "assistant", text: `⚠️ ${e.message}` }]);
    } finally {
      setBusy(false);
      onStatus(agent.id, "idle", false);
      onActivity?.();
    }
  }

  async function confirm(entryIdx: number, prop: ProposedAction) {
    onStatus(agent.id, "acting", false);
    try {
      const r = await fetch("/api/agents/act", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ agentId: agent.id, tool: prop.tool, args: prop.args, summary: prop.summary }),
      });
      const d = await r.json();
      markDone(entryIdx, prop.id);
      if (d.error) {
        setEntries((p) => [...p, { role: "assistant", text: `⚠️ การกระทำล้มเหลว: ${d.error}` }]);
      } else if (prop.tool === "navigate") {
        const q = prop.args.query ? `?${prop.args.query}` : "";
        router.push(`${prop.args.path}${q}`);
      } else {
        setEntries((p) => [...p, { role: "assistant", text: `✅ เสร็จ: ${prop.summary}` }]);
      }
    } catch (e: any) {
      setEntries((p) => [...p, { role: "assistant", text: `⚠️ ${e.message}` }]);
    } finally {
      onStatus(agent.id, "idle", false);
      onActivity?.();
    }
  }

  function markDone(entryIdx: number, propId: string) {
    setEntries((p) => p.map((e, i) => i === entryIdx
      ? { ...e, proposals: e.proposals?.filter((x) => x.id !== propId) }
      : e));
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: 0.97 }}
      transition={{ type: "spring", stiffness: 340, damping: 30 }}
      className="fixed bottom-5 right-5 z-[90] flex flex-col rounded-2xl overflow-hidden"
      style={{ width: 360, height: 520, background: "#0a0e1a", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }}>
      {/* header */}
      <div className="flex items-center gap-2.5 px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        <div className="w-7 h-7 rounded-lg flex-shrink-0" style={{ background: agent.color }} />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-bold text-[#e8eaf5] truncate">{agent.name}</div>
          <div className="text-[10px] text-[#3a4a6a] truncate">{agent.provider} · {agent.scope.accountId}</div>
        </div>
        <button onClick={() => onDelete(agent.id)} title="ลบเอเจนต์"
          className="w-7 h-7 rounded-lg flex items-center justify-center text-[#4a5a7a] hover:text-[#ff6b6b]" style={{ background: "rgba(255,255,255,0.04)" }}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 4h10M6 4V2.5h4V4M5 4l.5 9h5L11 4" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-[#4a5a7a] hover:text-[#e8eaf5]" style={{ background: "rgba(255,255,255,0.04)" }}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round"/></svg>
        </button>
      </div>

      {/* messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5">
        {entries.length === 0 && (
          <div className="text-center text-[12px] text-[#3a4a6a] mt-8 px-4">
            ถาม {agent.name} เกี่ยวกับโฆษณาของคุณ — เช่น <span className="text-[#5b6cff]">&ldquo;โฆษณาไหนเปลืองงบสัปดาห์นี้?&rdquo;</span>
          </div>
        )}
        {entries.map((e, i) => (
          <div key={i}>
            <div className={`flex ${e.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className="max-w-[85%] px-3 py-2 rounded-2xl text-[12.5px] leading-relaxed"
                style={e.role === "user"
                  ? { background: "linear-gradient(135deg,#5b6cff,#7c5cff)", color: "#fff", borderBottomRightRadius: 4, whiteSpace: "pre-wrap", wordBreak: "break-word" }
                  : { background: "rgba(255,255,255,0.05)", color: "#d8deec", borderBottomLeftRadius: 4 }}>
                {e.role === "assistant" ? <Md text={e.text} /> : e.text}
              </div>
            </div>
            {e.sources && e.sources.length > 0 && (
              <div className="flex justify-start mt-1">
                <button onClick={() => setSourceView(e.sources!)}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-medium"
                  style={{ background: "rgba(91,108,255,0.1)", color: "#8a9aff", border: "1px solid rgba(91,108,255,0.25)" }}>
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14" strokeLinecap="round"/></svg>
                  แหล่งข้อมูล · {e.sources.reduce((n, s: any) => n + (s.tool === "get_insights" && s.result?.rows ? s.result.rows.length : 1), 0)} จุดข้อมูล
                </button>
              </div>
            )}
            {e.proposals?.map((p) => (
              <div key={p.id} className="mt-2 rounded-xl p-3" style={{ background: "rgba(245,177,76,0.08)", border: "1px solid rgba(245,177,76,0.3)" }}>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "#f5b14c" }}>{labelFor(p.tool)}</span>
                </div>
                <div className="text-[12px] text-[#d8deec] mb-2.5">{p.summary}</div>
                <div className="flex gap-2">
                  <button onClick={() => confirm(i, p)} className="flex-1 py-1.5 rounded-lg text-[12px] font-semibold" style={{ background: "#31c48d", color: "#03130c" }}>ยืนยัน</button>
                  <button onClick={() => markDone(i, p.id)} className="flex-1 py-1.5 rounded-lg text-[12px] font-medium" style={{ background: "rgba(255,255,255,0.06)", color: "#8a9aba" }}>ยกเลิก</button>
                </div>
              </div>
            ))}
          </div>
        ))}
        {busy && (
          <div className="flex justify-start">
            <div className="px-3 py-2 rounded-2xl flex gap-1" style={{ background: "rgba(255,255,255,0.05)" }}>
              {[0, 1, 2].map((i) => (
                <motion.span key={i} className="w-1.5 h-1.5 rounded-full" style={{ background: "#5b6cff" }}
                  animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* input */}
      <div className="p-3" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
        <div className="flex gap-2 items-end">
          <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={1}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="ข้อความ…" className="flex-1 resize-none"
            style={{ background: "#070b14", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "9px 11px", color: "#e8eaf5", fontSize: 13, outline: "none", maxHeight: 80 }} />
          <button onClick={send} disabled={!input.trim() || busy}
            className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: input.trim() && !busy ? "linear-gradient(135deg,#5b6cff,#a78bfa)" : "rgba(255,255,255,0.06)" }}>
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke={input.trim() && !busy ? "#fff" : "#3a4a6a"} strokeWidth="1.6"><path d="M2 8h11M9 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        </div>
      </div>

      <SourceModal sources={sourceView} onClose={() => setSourceView(null)} />
    </motion.div>
  );
}

function labelFor(tool: string) {
  return tool === "set_status" ? "หยุด / เปิดใช้งาน"
    : tool === "set_budget" ? "เปลี่ยนงบ"
    : tool === "navigate" ? "เปิดหน้า" : tool;
}
