"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { OfficeCanvas, type EditTool, type AgentRuntime } from "@/components/agents/office-canvas";
import { AgentCreateModal } from "@/components/agents/agent-create-modal";
import { AgentChat } from "@/components/agents/agent-chat";
import { AgentProfile } from "@/components/agents/agent-profile";
import { Md } from "@/components/agents/markdown";
import type { Office, PublicAgent, TileType, AgentStatus, FurnitureType, LogEntry } from "@/lib/agents/types";

const filterStyle: React.CSSProperties = {
  background: "#0a0e1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7,
  padding: "3px 7px", color: "#c8d0e0", fontSize: 11, outline: "none",
};

interface TaskGroup { id: string; agentId: string; ts: number; task?: LogEntry; children: LogEntry[] }
function groupLogs(logs: LogEntry[]): TaskGroup[] {
  const asc = [...logs].sort((a, b) => a.ts - b.ts);
  const open = new Map<string, TaskGroup>();
  const groups: TaskGroup[] = [];
  for (const l of asc) {
    if (l.kind === "task") {
      const g: TaskGroup = { id: l.id, agentId: l.agentId, ts: l.ts, task: l, children: [] };
      groups.push(g); open.set(l.agentId, g);
    } else {
      const g = open.get(l.agentId);
      if (g) g.children.push(l);
      else groups.push({ id: l.id, agentId: l.agentId, ts: l.ts, children: [l] });
    }
  }
  return groups.sort((a, b) => b.ts - a.ts);
}

const KIND_COLOR: Record<string, string> = {
  task: "#5b6cff", response: "#8a9aba", proposal: "#f5b14c", action: "#31c48d", error: "#ff6b6b",
};
function ago(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export default function AgentsPage() {
  const [office, setOffice] = useState<Office | null>(null);
  const [agents, setAgents] = useState<PublicAgent[]>([]);
  const [runtime, setRuntime] = useState<AgentRuntime>({});
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [editTool, setEditTool] = useState<EditTool>("wall");
  const [soundOn, setSoundOn] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [dirty, setDirty] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [chatId, setChatId] = useState<string | null>(null);
  const [chatSessionId, setChatSessionId] = useState<string | undefined>(undefined);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [openTask, setOpenTask] = useState<string | null>(null);
  const [feedAgent, setFeedAgent] = useState("all");
  const [feedRange, setFeedRange] = useState("all");
  const [feedKind, setFeedKind] = useState("all");
  const [feedHeight, setFeedHeight] = useState<number>(() => {
    if (typeof window !== "undefined") { const v = localStorage.getItem("agents-feed-h"); if (v) return Number(v); }
    return 210;
  });
  const [resizing, setResizing] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/agents");
    const d = await r.json();
    setOffice(d.office);
    setAgents(d.agents || []);
  }, []);
  const loadLogs = useCallback(async () => {
    const r = await fetch("/api/agents/logs?limit=250");
    const d = await r.json();
    setLogs(d.logs || []);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadLogs(); const t = setInterval(loadLogs, 4000); return () => clearInterval(t); }, [loadLogs]);

  // Keep the highlighted agent in view only when the office overflows the
  // viewport (i.e. zoomed in). Clamped so it never shoves the office off-centre.
  useEffect(() => {
    if (!highlightId || !office) return;
    const ag = agents.find((a) => a.id === highlightId);
    if (!ag) return;
    const t = setTimeout(() => {
      const cont = scrollRef.current, wrap = wrapRef.current;
      if (!cont || !wrap) return;
      const overflowX = cont.scrollWidth - cont.clientWidth;
      const overflowY = cont.scrollHeight - cont.clientHeight;
      if (overflowX <= 0 && overflowY <= 0) return; // fits — already centred, don't move
      const tile = wrap.getBoundingClientRect().width / office.cols;
      if (overflowX > 0) {
        const target = (ag.pos.x + 0.5) * tile - cont.clientWidth / 2 + wrap.offsetLeft;
        cont.scrollTo({ left: Math.max(0, Math.min(overflowX, target)), behavior: "smooth" });
      }
      if (overflowY > 0) {
        const target = (ag.pos.y + 0.5) * tile - cont.clientHeight / 2 + wrap.offsetTop;
        cont.scrollTo({ top: Math.max(0, Math.min(overflowY, target)), behavior: "smooth" });
      }
    }, 160);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightId]);

  function setStatus(id: string, status: AgentStatus, needsConfirm: boolean) {
    setRuntime((p) => ({ ...p, [id]: { status, needsConfirm } }));
  }

  function paintTile(x: number, y: number, tool: EditTool) {
    const FURN: FurnitureType[] = ["desk", "plant", "coffee", "cooler", "rug"];
    setOffice((prev) => {
      if (!prev) return prev;
      const o: Office = { ...prev, tiles: [...prev.tiles], furniture: [...prev.furniture] };
      if (tool === "erase") {
        o.furniture = o.furniture.filter((f) => !(f.x === x && f.y === y));
      } else if ((FURN as string[]).includes(tool)) {
        if (!o.furniture.some((f) => f.x === x && f.y === y) && o.tiles[y * o.cols + x] !== 1) {
          o.furniture.push({ id: Math.random().toString(36).slice(2, 8), type: tool as FurnitureType, x, y, facing: "down" });
        }
      } else {
        const t: TileType = tool === "wall" ? 1 : tool === "carpet" ? 2 : 0;
        o.tiles[y * o.cols + x] = t;
      }
      return o;
    });
    setDirty(true);
  }

  function moveAgent(id: string, x: number, y: number) {
    let deskId: string | null = null;
    if (office) {
      const adj = office.furniture.find((f) => f.type === "desk" && Math.abs(f.x - x) + Math.abs(f.y - y) === 1);
      if (adj) deskId = adj.id;
    }
    setAgents((p) => p.map((a) => (a.id === id ? { ...a, pos: { x, y }, deskId } : a)));
    fetch("/api/agents", {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, patch: { pos: { x, y }, deskId } }),
    });
  }

  async function saveLayout() {
    if (!office) return;
    await fetch("/api/agents", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ office }) });
    setDirty(false);
  }

  async function deleteAgent(id: string) {
    await fetch(`/api/agents?id=${id}`, { method: "DELETE" });
    setChatId(null); setProfileId(null); setHighlightId(null);
    load();
  }

  function selectAgent(id: string) { setProfileId(id); setHighlightId(id); }

  function startResize(e: React.MouseEvent) {
    e.preventDefault();
    const startY = e.clientY, startH = feedHeight;
    setResizing(true);
    let h = startH;
    const move = (ev: MouseEvent) => {
      h = Math.max(120, Math.min(window.innerHeight - 240, startH + (startY - ev.clientY)));
      setFeedHeight(h);
    };
    const up = () => {
      setResizing(false);
      localStorage.setItem("agents-feed-h", String(Math.round(h)));
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }
  function resetFeedHeight() { setFeedHeight(210); localStorage.setItem("agents-feed-h", "210"); }

  const chatAgent = agents.find((a) => a.id === chatId) || null;
  const profileAgent = agents.find((a) => a.id === profileId) || null;
  const agentMap = new Map(agents.map((a) => [a.id, a]));

  const now = Date.now();
  const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
  const thr = feedRange === "today" ? startToday.getTime() : feedRange === "7d" ? now - 7 * 864e5 : feedRange === "30d" ? now - 30 * 864e5 : 0;
  const filteredLogs = logs.filter((l) =>
    (feedAgent === "all" || l.agentId === feedAgent) &&
    (feedKind === "all" || l.kind === feedKind) &&
    l.ts >= thr);
  const feedFiltered = feedAgent !== "all" || feedRange !== "all" || feedKind !== "all";

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: "#050810", userSelect: resizing ? "none" : undefined }}>
      {/* header */}
      <div className="flex items-center justify-between px-6 py-4 flex-none" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div>
          <div className="text-[17px] font-bold text-[#e8eaf5]">เอเจนต์</div>
          <div className="text-[12px] text-[#3a4a6a]">แพลตฟอร์ม AI — เลือกเอเจนต์ ดูงาน คลิกเพื่อติดตาม</div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setSoundOn((v) => !v)} title={soundOn ? "ปิดเสียง" : "เปิดเสียงเมื่องานเสร็จ"}
            className="w-9 h-9 rounded-lg flex items-center justify-center"
            style={soundOn ? { background: "rgba(49,196,141,0.15)", color: "#31c48d", border: "1px solid rgba(49,196,141,0.3)" } : { background: "rgba(255,255,255,0.05)", color: "#4a5a7a" }}>
            {soundOn
              ? <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M2 6v4h2.5L8 13V3L4.5 6H2z"/><path d="M11 5.5a3.5 3.5 0 0 1 0 5M12.8 3.5a6 6 0 0 1 0 9"/></svg>
              : <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M2 6v4h2.5L8 13V3L4.5 6H2z"/><path d="M11 6l4 4M15 6l-4 4"/></svg>}
          </button>
          {editMode && (
            <button onClick={saveLayout} disabled={!dirty} className="px-3.5 py-2 rounded-lg text-[12.5px] font-semibold"
              style={{ background: dirty ? "#31c48d" : "rgba(255,255,255,0.06)", color: dirty ? "#03130c" : "#3a4a6a" }}>
              {dirty ? "บันทึกเลย์เอาต์" : "บันทึกแล้ว"}
            </button>
          )}
          <button onClick={() => setEditMode((v) => !v)} className="px-3.5 py-2 rounded-lg text-[12.5px] font-medium"
            style={editMode ? { background: "rgba(91,108,255,0.18)", color: "#8a9aff", border: "1px solid rgba(91,108,255,0.35)" } : { background: "rgba(255,255,255,0.05)", color: "#8a9aba" }}>
            {editMode ? "เสร็จสิ้น" : "แก้ไขเลย์เอาต์"}
          </button>
          <button onClick={() => setModalOpen(true)} className="px-3.5 py-2 rounded-lg text-[12.5px] font-semibold"
            style={{ background: "linear-gradient(135deg,#5b6cff,#a78bfa)", color: "#fff" }}>
            + เพิ่มเอเจนต์
          </button>
        </div>
      </div>

      {/* edit toolbar */}
      {editMode && (
        <div className="flex items-center gap-2 px-6 py-2.5 flex-none flex-wrap" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", background: "rgba(91,108,255,0.03)" }}>
          <span className="text-[11px] uppercase tracking-wide text-[#3a4a6a] font-semibold mr-1">เครื่องมือ</span>
          {([
            ["floor", "พื้น"], ["wall", "ผนัง"], ["carpet", "พรม (ใหญ่)"], ["rug", "พรม"],
            ["desk", "โต๊ะ"], ["plant", "ต้นไม้"], ["coffee", "กาแฟ"], ["cooler", "เครื่องทำน้ำ"],
            ["erase", "ลบ"], ["move", "ย้ายเอเจนต์"],
          ] as [EditTool, string][]).map(([t, label]) => (
            <button key={t} onClick={() => setEditTool(t)} className="px-3 py-1.5 rounded-lg text-[12px] font-medium"
              style={editTool === t ? { background: "rgba(91,108,255,0.2)", color: "#9aa8ff", border: "1px solid rgba(91,108,255,0.4)" } : { background: "rgba(255,255,255,0.04)", color: "#6a7a9a" }}>
              {label}
            </button>
          ))}
        </div>
      )}

      {/* main: left rail + (office over feed) */}
      <div className="flex-1 flex min-h-0">
        {/* left rail */}
        <div className="w-[284px] flex-none flex flex-col min-h-0" style={{ borderRight: "1px solid rgba(255,255,255,0.06)", background: "#070b14" }}>
          {profileAgent ? (
            <AgentProfile
              agent={profileAgent}
              status={runtime[profileAgent.id]?.status ?? "idle"}
              onBack={() => { setProfileId(null); setHighlightId(null); }}
              onOpenChat={(id, sessionId) => { setChatId(id); setChatSessionId(sessionId); }}
              onSaved={load}
            />
          ) : (
            <>
              <div className="px-4 py-2.5 flex-none text-[12px] uppercase tracking-wide text-[#3a4a6a] font-semibold" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                เอเจนต์ · {agents.length}
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {agents.length === 0 && <div className="text-[12px] text-[#3a4a6a] px-2 py-3">ยังไม่มีเอเจนต์ — กด <span className="text-[#5b6cff]">+ เพิ่มเอเจนต์</span></div>}
                {agents.map((a) => {
                  const st = runtime[a.id]?.status ?? "idle";
                  const dot = st === "thinking" ? "#5b6cff" : st === "acting" ? "#ff6b6b" : "#2a3a5a";
                  return (
                    <button key={a.id} onClick={() => selectAgent(a.id)}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors"
                      style={{ background: highlightId === a.id ? "rgba(91,108,255,0.12)" : "transparent" }}
                      onMouseEnter={(e) => { if (highlightId !== a.id) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = highlightId === a.id ? "rgba(91,108,255,0.12)" : "transparent"; }}>
                      <div className="w-7 h-7 rounded-lg flex-shrink-0 relative" style={{ background: a.color }}>
                        <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full" style={{ background: dot, border: "2px solid #070b14" }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium text-[#e8eaf5] truncate">{a.name}</div>
                        <div className="text-[10px] text-[#3a4a6a] truncate capitalize">{st === "idle" ? a.provider : st}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* right column */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* office */}
          <div ref={scrollRef} className="relative flex-1 overflow-auto p-6"
            onWheel={(e) => { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); setZoom((z) => Math.max(0.5, Math.min(2.5, z - e.deltaY * 0.0015))); }}>
            <div className="absolute top-4 right-4 z-10 flex flex-col rounded-lg overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.1)" }}>
              {([["+", () => setZoom((z) => Math.min(2.5, z + 0.2))], ["−", () => setZoom((z) => Math.max(0.5, z - 0.2))]] as [string, () => void][]).map(([s, fn]) => (
                <button key={s} onClick={fn} className="w-8 h-8 text-[16px] text-[#8a9aba] leading-none" style={{ background: "rgba(10,14,26,0.9)", borderBottom: s === "+" ? "1px solid rgba(255,255,255,0.08)" : "none" }}>{s}</button>
              ))}
              <button onClick={() => setZoom(1)} className="w-8 h-7 text-[9px] text-[#4a5a7a]" style={{ background: "rgba(10,14,26,0.9)", borderTop: "1px solid rgba(255,255,255,0.08)" }}>{Math.round(zoom * 100)}%</button>
            </div>
            <div className="flex justify-center">
              <div ref={wrapRef} style={{ transform: `scale(${zoom})`, transformOrigin: "top center", transition: "transform 0.12s ease-out" }}>
                {office && (
                  <OfficeCanvas
                    office={office} agents={agents} runtime={runtime}
                    editMode={editMode} editTool={editTool} soundOn={soundOn} highlightId={highlightId}
                    onAgentClick={(id) => { setHighlightId(id); setChatId(id); setChatSessionId(undefined); }}
                    onPaintTile={paintTile} onMoveAgent={moveAgent}
                  />
                )}
              </div>
            </div>
          </div>

          {/* activity feed (drag the top edge to resize) */}
          <div className="flex-none flex flex-col" style={{ height: feedHeight, borderTop: "1px solid rgba(255,255,255,0.06)", background: "#070b14" }}>
            {/* resize handle */}
            <div onMouseDown={startResize} onDoubleClick={resetFeedHeight} title="ลากเพื่อปรับขนาด · ดับเบิลคลิกเพื่อรีเซ็ต"
              className="h-2.5 flex-none flex items-center justify-center cursor-row-resize group" style={{ marginTop: -1 }}>
              <div className="w-12 h-1 rounded-full transition-colors" style={{ background: resizing ? "#5b6cff" : "rgba(255,255,255,0.18)" }} />
            </div>
            <div className="px-5 py-2 flex items-center gap-2 flex-none flex-wrap" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <span className="text-[12px] uppercase tracking-wide text-[#3a4a6a] font-semibold mr-1">กิจกรรม</span>
              <select value={feedAgent} onChange={(e) => setFeedAgent(e.target.value)} style={filterStyle}>
                <option value="all">ทุกเอเจนต์</option>
                {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <select value={feedRange} onChange={(e) => setFeedRange(e.target.value)} style={filterStyle}>
                <option value="all">ทุกช่วงเวลา</option>
                <option value="today">วันนี้</option>
                <option value="7d">7 วันล่าสุด</option>
                <option value="30d">30 วันล่าสุด</option>
              </select>
              <select value={feedKind} onChange={(e) => setFeedKind(e.target.value)} style={filterStyle}>
                <option value="all">ทุกประเภท</option>
                <option value="task">งาน</option>
                <option value="response">ตอบกลับ</option>
                <option value="proposal">ข้อเสนอ</option>
                <option value="action">การกระทำ</option>
                <option value="rule">กฎ</option>
              </select>
              {feedFiltered && (
                <button onClick={() => { setFeedAgent("all"); setFeedRange("all"); setFeedKind("all"); }}
                  className="text-[10px] text-[#5b6cff] font-medium">ล้าง</button>
              )}
              <span className="text-[10px] text-[#2a3a5a] flex items-center gap-1.5 ml-auto">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#31c48d" }} /> ใช้งาน
              </span>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
              {filteredLogs.length === 0 && <div className="text-[12px] text-[#3a4a6a] px-2 py-3">{logs.length === 0 ? "ยังไม่มีกิจกรรม เปิดเอเจนต์และมอบหมายงาน" : "ไม่มีกิจกรรมที่ตรงกับตัวกรอง"}</div>}
              {groupLogs(filteredLogs).map((g) => {
                const a = agentMap.get(g.agentId);
                const expanded = openTask === g.id;
                const headText = g.task?.text ?? g.children[0]?.text ?? "(activity)";
                const hasBody = g.children.length > 0 || !g.task;
                return (
                  <div key={g.id} className="rounded-lg overflow-hidden" style={{ background: expanded ? "rgba(91,108,255,0.06)" : "transparent" }}>
                    {/* task header */}
                    <button
                      onClick={() => { setHighlightId(g.agentId); setOpenTask(expanded ? null : g.id); }}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 text-left transition-colors"
                      onMouseEnter={(e) => { if (!expanded) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                      <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="#5a6a8a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                        style={{ flexShrink: 0, transform: expanded ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>
                        <path d="M6 4l4 4-4 4" />
                      </svg>
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: a?.color ?? "#3a4a6a" }} />
                      <span className="text-[11px] font-semibold flex-shrink-0 w-20 truncate" style={{ color: a?.color ?? "#ff6b6b" }}>{a?.name ?? (g.agentId === "system" ? "Ads Auto" : "—")}</span>
                      <span className="text-[12.5px] text-[#d8deec] flex-1 min-w-0 truncate">{headText}</span>
                      <span className="text-[10px] text-[#3a4a6a] flex-shrink-0">{ago(g.ts)}</span>
                    </button>

                    {/* dropdown body: responses / proposals / actions */}
                    {expanded && hasBody && (
                      <div className="px-3 pb-2.5 pl-9 space-y-2">
                        {g.children.length === 0 && <div className="text-[11px] text-[#3a4a6a] italic">กำลังทำงาน...</div>}
                        {g.children.map((c) => (
                          <div key={c.id}>
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span className="px-1.5 py-0.5 rounded text-[9px] uppercase font-bold" style={{ background: `${KIND_COLOR[c.kind]}22`, color: KIND_COLOR[c.kind] }}>{c.kind}</span>
                              <span className="text-[10px] text-[#3a4a6a]">{ago(c.ts)} ago</span>
                            </div>
                            <Md text={c.text} className="text-[12.5px] leading-relaxed text-[#c8d0e0]" style={{ fontFamily: "'DM Sans', sans-serif" }} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <AgentCreateModal open={modalOpen} onClose={() => setModalOpen(false)} onCreated={() => { load(); }} />
      <AnimatePresence>
        {chatAgent && (
          <AgentChat key={`${chatAgent.id}:${chatSessionId ?? "new"}`} agent={chatAgent} sessionId={chatSessionId}
            onClose={() => { setChatId(null); setChatSessionId(undefined); }}
            onStatus={setStatus} onDelete={deleteAgent} onActivity={loadLogs} />
        )}
      </AnimatePresence>
    </div>
  );
}
