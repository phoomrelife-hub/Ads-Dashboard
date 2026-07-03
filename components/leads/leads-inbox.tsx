"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Lead, LeadEvent, LeadStatus } from "@/lib/leads/types";

/* ── Types ── */
type Acct = { id: string; name: string; active: boolean };
type StatusFilter = LeadStatus | "all";
type AdOption = {
  adId: string | null;
  adName: string | null;
  campaignId: string;
  campaignName: string;
};
type Counts = { new: number; contacted: number; won: number; lost: number };

/* ── Helpers ── */
function relAge(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function fmtBaht(amount: number): string {
  return `฿${amount.toLocaleString("th-TH")}`;
}

const STATUS_LABELS: Record<StatusFilter, string> = {
  all: "ทั้งหมด",
  new: "ใหม่",
  contacted: "ติดต่อแล้ว",
  won: "ปิดขายได้",
  lost: "ไม่สำเร็จ",
};

const STATUS_COLOR: Record<LeadStatus, string> = {
  new: "#31c48d",
  contacted: "#2d88ff",
  won: "#f5b14c",
  lost: "#ff6b6b",
};

const LOST_REASONS = [
  { value: "price", label: "ราคาแพงเกินไป (Price)" },
  { value: "no_answer", label: "ไม่รับสาย (No answer)" },
  { value: "not_interested", label: "ไม่สนใจ (Not interested)" },
  { value: "other", label: "อื่นๆ (Other)" },
];

const EVENT_KIND_LABEL: Record<string, string> = {
  created: "เพิ่มลูกค้า",
  contacted: "ติดต่อแล้ว",
  won: "ปิดการขาย",
  lost: "ไม่สำเร็จ",
  reopened: "เปิดใหม่",
};

const EVENT_KIND_COLOR: Record<string, string> = {
  created: "#8a9aba",
  contacted: "#2d88ff",
  won: "#f5b14c",
  lost: "#ff6b6b",
  reopened: "#a78bfa",
};

/* ── Icons (inline SVG, 16×16, matches side-nav pattern) ── */
function IcoPlus() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M7 2v10M2 7h10" />
    </svg>
  );
}
function IcoPhone() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 2H3a1 1 0 0 0-1 1v2c0 5.5 4.5 10 10 10h2a1 1 0 0 0 1-1v-2l-3-1-1 1.5C9 12 7 10 5.5 8.5L7 7 6 4 5 2z" />
    </svg>
  );
}
function IcoSearch() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="6" cy="6" r="4" /><path d="M10 10L13 13" />
    </svg>
  );
}
function IcoX() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M3 3l8 8M11 3L3 11" />
    </svg>
  );
}
function IcoCopy() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="9" height="9" rx="1.5" />
      <path d="M4 12H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v1" />
    </svg>
  );
}
function IcoCheck() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 6l3 3 5-5" />
    </svg>
  );
}

/* ── Shared styles ── */
const inputCls =
  "bg-[#0c1220] border border-white/[0.08] rounded-xl px-3 py-2 text-[13px] outline-none transition-colors focus:border-[#2d88ff]/60 hover:border-white/[0.14] placeholder:text-[#3d4f6a] text-[#c9d1e0]";

/* ── Skeleton row ── */
function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 px-5 py-3.5 border-b border-white/[0.04]">
      <div className="skeleton rounded-full w-2 h-2 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="skeleton h-[13px] w-[120px] mb-2 rounded" />
        <div className="skeleton h-[11px] w-[200px] rounded" />
      </div>
      <div className="skeleton h-[22px] w-[60px] rounded-full" />
      <div className="skeleton h-[11px] w-[24px] rounded" />
      <div className="flex gap-1.5">
        <div className="skeleton h-[28px] w-[78px] rounded-lg" />
        <div className="skeleton h-[28px] w-[78px] rounded-lg" />
      </div>
    </div>
  );
}

/* ── Action button ── */
function ActionBtn({ color, onClick, children }: { color: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg px-2.5 py-1.5 text-[11px] font-semibold cursor-pointer transition-all whitespace-nowrap"
      style={{ background: `${color}12`, color, border: `1px solid ${color}28` }}
      onMouseEnter={(e) => { e.currentTarget.style.background = `${color}22`; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = `${color}12`; }}>
      {children}
    </button>
  );
}

/* ── Lead row sub-component ── */
function LeadRow({
  lead, onRowClick, onContacted, onWon, onLost, onLostConfirm, onReopen,
  lostExpanded, lostReason, onLostReasonChange,
}: {
  lead: Lead;
  onRowClick: () => void;
  onContacted: () => void;
  onWon: () => void;
  onLost: () => void;
  onLostConfirm: (reason: string) => void;
  onReopen: () => void;
  lostExpanded: boolean;
  lostReason: string;
  onLostReasonChange: (v: string) => void;
}) {
  const isNew = lead.status === "new";
  const isTerminal = lead.status === "won" || lead.status === "lost";
  const color = STATUS_COLOR[lead.status];
  const age = relAge(lead.createdAt);

  return (
    <div style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
      {/* main row */}
      <div
        className="flex items-center gap-3 px-5 py-3.5 cursor-pointer transition-colors"
        style={{ background: isNew ? "rgba(49,196,141,0.025)" : "transparent" }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.018)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = isNew ? "rgba(49,196,141,0.025)" : "transparent")}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("button,select,a")) return;
          onRowClick();
        }}>

        {/* status dot — new leads have a pulsing ring */}
        <div className="flex-shrink-0 relative w-2 h-2">
          <div className="w-2 h-2 rounded-full absolute" style={{ background: color }} />
          {isNew && (
            <div
              className="w-2 h-2 rounded-full absolute animate-ping"
              style={{ background: color, opacity: 0.35 }}
            />
          )}
        </div>

        {/* phone · name · badges */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono font-bold text-[13px] text-[#e8eaf5] tracking-wide">{lead.phone}</span>
            {lead.name && <span className="text-[12px] text-[#8a9aba]">{lead.name}</span>}
            {lead.campaignName && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded-full truncate max-w-[200px]"
                style={{ background: "rgba(45,136,255,0.1)", color: "#5a8aff", border: "1px solid rgba(45,136,255,0.18)" }}>
                {lead.campaignName}
              </span>
            )}
          </div>
          {/* sub-line: sale amount or lost reason */}
          {lead.status === "won" && lead.saleAmount ? (
            <div className="text-[11px] font-mono text-[#f5b14c] mt-0.5">
              {fmtBaht(lead.saleAmount)}{lead.product ? ` · ${lead.product}` : ""}
            </div>
          ) : lead.status === "lost" && lead.lostReason ? (
            <div className="text-[11px] text-[#3d4f6a] mt-0.5">{lead.lostReason}</div>
          ) : null}
        </div>

        {/* age */}
        <div className="text-[11px] text-[#2a3a52] flex-shrink-0 font-mono w-[28px] text-right">{age}</div>

        {/* action buttons — depends on status */}
        <div className="flex items-center gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          {lead.status === "new" && (
            <>
              <ActionBtn color="#2d88ff" onClick={onContacted}>ติดต่อแล้ว</ActionBtn>
              <ActionBtn color="#f5b14c" onClick={onWon}>ปิดการขาย</ActionBtn>
              <ActionBtn color="#ff6b6b" onClick={onLost}>ไม่สำเร็จ</ActionBtn>
            </>
          )}
          {lead.status === "contacted" && (
            <>
              <ActionBtn color="#f5b14c" onClick={onWon}>ปิดการขาย</ActionBtn>
              <ActionBtn color="#ff6b6b" onClick={onLost}>ไม่สำเร็จ</ActionBtn>
            </>
          )}
          {isTerminal && (
            <ActionBtn color="#a78bfa" onClick={onReopen}>เปิดใหม่</ActionBtn>
          )}
        </div>
      </div>

      {/* inline lost-reason picker (expands below the row) */}
      <AnimatePresence>
        {lostExpanded && !isTerminal && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden">
            <div
              className="px-5 py-3 flex items-center gap-2"
              style={{ background: "rgba(255,107,107,0.04)", borderTop: "1px solid rgba(255,107,107,0.1)" }}>
              <select
                value={lostReason}
                onChange={(e) => onLostReasonChange(e.target.value)}
                className="flex-1 rounded-lg px-2.5 py-1.5 text-[12px] outline-none cursor-pointer text-[#c9d1e0]"
                style={{ background: "#070c17", border: "1px solid rgba(255,255,255,0.07)" }}>
                <option value="">— เลือกเหตุผล (ไม่บังคับ) —</option>
                {LOST_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
              <button
                onClick={() => onLostConfirm(lostReason)}
                className="rounded-lg px-3 py-1.5 text-[12px] font-semibold cursor-pointer transition-all"
                style={{ background: "rgba(255,107,107,0.12)", color: "#ff6b6b", border: "1px solid rgba(255,107,107,0.25)" }}>
                ยืนยัน
              </button>
              <button
                onClick={() => onLostConfirm("")}
                className="rounded-lg px-2 py-1.5 text-[12px] cursor-pointer transition-colors text-[#3d4f6a] hover:text-[#8a9aba]"
                title="ข้ามเหตุผล">
                ข้าม
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   Main component
   ══════════════════════════════════════════════════════ */
export function LeadsInbox({ initialAccounts = [] }: { initialAccounts?: Acct[] }) {
  /* account state — mirrors dashboard.tsx pattern */
  const [accounts, setAccounts] = useState<Acct[]>(initialAccounts);
  const [acctId, setAcctId] = useState("");
  const [acctName, setAcctName] = useState("");
  const [acctOpen, setAcctOpen] = useState(false);
  const [acctQuery, setAcctQuery] = useState("");
  const [hiddenAccts, setHiddenAccts] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const acctRef = useRef<HTMLDivElement>(null);

  /* leads state */
  const [leads, setLeads] = useState<Lead[]>([]);
  const [counts, setCounts] = useState<Counts>({ new: 0, contacted: 0, won: 0, lost: 0 });
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  /* won modal */
  const [wonLeadId, setWonLeadId] = useState<string | null>(null);
  const [wonAmount, setWonAmount] = useState("");
  const [wonProduct, setWonProduct] = useState("");
  const [wonSubmitting, setWonSubmitting] = useState(false);
  const [wonError, setWonError] = useState("");

  /* lost inline picker */
  const [lostLeadId, setLostLeadId] = useState<string | null>(null);
  const [lostReason, setLostReason] = useState("");

  /* event drawer */
  const [drawerLead, setDrawerLead] = useState<Lead | null>(null);
  const [events, setEvents] = useState<LeadEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  /* add lead modal */
  const [addOpen, setAddOpen] = useState(false);
  const [addPhone, setAddPhone] = useState("");
  const [addName, setAddName] = useState("");
  const [addCampaignId, setAddCampaignId] = useState("");
  const [adOptions, setAdOptions] = useState<AdOption[]>([]);
  const [adOptionsLoading, setAdOptionsLoading] = useState(false);
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addError, setAddError] = useState("");

  /* ── init: read localStorage (same pattern as dashboard) ── */
  useEffect(() => {
    try {
      const h = JSON.parse(localStorage.getItem("adsHiddenAccounts") || "[]");
      if (Array.isArray(h)) setHiddenAccts(h);
    } catch {}
    setHydrated(true);
  }, []);

  /* load accounts if server didn't prefetch */
  useEffect(() => {
    if (accounts.length) return;
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((a) => { if (Array.isArray(a) && a.length) setAccounts(a); })
      .catch(() => {});
  }, [accounts.length]);

  /* select first visible account once both lists are known (mirrors dashboard) */
  useEffect(() => {
    if (!hydrated || accounts.length === 0) return;
    const allHidden = hiddenAccts.length === accounts.length;
    const isVisible = (id: string) => allHidden || !hiddenAccts.includes(id);
    if (acctId && isVisible(acctId)) return;
    const first = accounts.find((a) => isVisible(a.id));
    if (first) { setAcctId(first.id); setAcctName(first.name); }
  }, [hydrated, accounts, hiddenAccts, acctId]);

  /* close account dropdown on outside click */
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (acctRef.current && !acctRef.current.contains(e.target as Node)) setAcctOpen(false);
    };
    document.addEventListener("click", h);
    return () => document.removeEventListener("click", h);
  }, []);

  /* debounce search input */
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  /* ── Load leads ── */
  const loadLeads = useCallback(async () => {
    if (!acctId) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ account: acctId, status: statusFilter });
      if (debouncedSearch) params.set("search", debouncedSearch);
      const data = await fetch(`/api/leads?${params}`).then((r) => r.json());
      if (data.error) throw new Error(data.error);
      setLeads(data.leads ?? []);
      setCounts(data.counts ?? { new: 0, contacted: 0, won: 0, lost: 0 });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [acctId, statusFilter, debouncedSearch]);

  useEffect(() => { loadLeads(); }, [loadLeads]);

  /* load ad options when add modal opens */
  useEffect(() => {
    if (!addOpen || !acctId) return;
    setAdOptionsLoading(true);
    setAdOptions([]);
    fetch(`/api/leads/ad-options?account=${acctId}`)
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d.options)) setAdOptions(d.options); })
      .catch(() => {})
      .finally(() => setAdOptionsLoading(false));
  }, [addOpen, acctId]);

  /* ── Mutate a lead (optimistic update + refetch) ── */
  async function mutate(id: string, action: string, extra: Record<string, unknown> = {}) {
    const targetLead = leads.find((l) => l.id === id);
    if (!targetLead) return;

    const newStatus: LeadStatus | null =
      action === "contacted" ? "contacted"
      : action === "won" ? "won"
      : action === "lost" ? "lost"
      : action === "reopen" ? "contacted"
      : null;

    // Optimistic update
    if (newStatus) {
      const from: LeadStatus = targetLead.status;
      setLeads((ls) => ls.map((l) => l.id === id ? { ...l, status: newStatus } : l));
      setCounts((c) => {
        const next = { ...c };
        next[from] = Math.max(0, next[from] - 1);
        next[newStatus] = next[newStatus] + 1;
        return next;
      });
    }

    try {
      const res = await fetch("/api/leads/mutate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action, ...extra }),
      }).then((r) => r.json());
      if (res.error) throw new Error(res.error);
      // Sync with server to get accurate data (sale amounts, timestamps, etc.)
      await loadLeads();
    } catch (e: any) {
      // Revert on failure
      await loadLeads();
      alert(`เกิดข้อผิดพลาด: ${e.message}`);
    }
  }

  /* ── Open event drawer ── */
  async function openDrawer(lead: Lead) {
    setDrawerLead(lead);
    setEvents([]);
    setCopied(false);
    setEventsLoading(true);
    try {
      const d = await fetch(`/api/leads/events?id=${lead.id}`).then((r) => r.json());
      setEvents(Array.isArray(d.events) ? d.events : []);
    } catch {}
    setEventsLoading(false);
  }

  /* ── Submit won ── */
  async function submitWon() {
    if (!wonLeadId) return;
    const cleaned = wonAmount.replace(/[,\s]/g, "");
    const amt = parseFloat(cleaned);
    if (!cleaned || !Number.isFinite(amt) || amt <= 0) {
      setWonError("กรุณากรอกยอดเงินที่ถูกต้อง");
      return;
    }
    setWonSubmitting(true);
    setWonError("");
    await mutate(wonLeadId, "won", { saleAmount: amt, product: wonProduct.trim() || undefined });
    setWonLeadId(null);
    setWonAmount("");
    setWonProduct("");
    setWonSubmitting(false);
  }

  /* ── Submit add lead ── */
  async function submitAddLead() {
    if (!addPhone.trim()) { setAddError("กรุณากรอกเบอร์โทร"); return; }
    setAddSubmitting(true);
    setAddError("");
    try {
      const selectedOpt = adOptions.find((o) => o.campaignId === addCampaignId);
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: acctId,
          phone: addPhone.trim(),
          name: addName.trim() || undefined,
          campaignId: selectedOpt?.campaignId,
          campaignName: selectedOpt?.campaignName,
          source: "click_to_message",
        }),
      }).then((r) => r.json());
      if (res.error) throw new Error(res.error);
      setAddPhone(""); setAddName(""); setAddCampaignId("");
      setAddOpen(false);
      await loadLeads();
    } catch (e: any) {
      setAddError(e.message);
    } finally {
      setAddSubmitting(false);
    }
  }

  /* ── Copy phone ── */
  function copyPhone(phone: string) {
    navigator.clipboard.writeText(phone).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  /* ── Derived values ── */
  const visibleAccts = hiddenAccts.length === accounts.length
    ? accounts
    : accounts.filter((a) => !hiddenAccts.includes(a.id));
  const filteredAccts = visibleAccts.filter((a) =>
    a.name.toLowerCase().includes(acctQuery.toLowerCase()),
  );
  const STATUS_FILTERS: StatusFilter[] = ["all", "new", "contacted", "won", "lost"];
  const totalCount = counts.new + counts.contacted + counts.won + counts.lost;

  /* ════════════════════════════════════════════════════
     Render
     ════════════════════════════════════════════════════ */
  return (
    <div style={{ background: "#060a12", minHeight: "100vh" }}>

      {/* ── Top bar ── */}
      <div
        className="flex items-center justify-between gap-3 flex-wrap px-6 py-3 border-b border-white/[0.06] sticky top-0 z-30"
        style={{ background: "rgba(6,10,18,0.92)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}>

        {/* title */}
        <div className="flex items-center gap-2.5">
          <div className="w-2 h-2 rounded-full" style={{ background: "#31c48d", boxShadow: "0 0 10px 2px rgba(49,196,141,0.5)" }} />
          <span className="font-semibold text-[14px] text-[#e8eaf5] tracking-[-0.01em]">ลูกค้ามุ่งหวัง</span>
        </div>

        {/* controls */}
        <div className="flex items-center gap-2 flex-wrap">

          {/* account combobox — mirrors dashboard.tsx exactly */}
          <div ref={acctRef} className="relative">
            <input
              value={acctOpen ? acctQuery : acctName}
              onChange={(e) => { setAcctQuery(e.target.value); setAcctOpen(true); }}
              onFocus={() => { setAcctQuery(""); setAcctOpen(true); }}
              placeholder="ค้นหาบัญชี..."
              className={`${inputCls} min-w-[220px] cursor-pointer`}
            />
            <AnimatePresence>
              {acctOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.97 }}
                  transition={{ duration: 0.14, ease: "easeOut" }}
                  className="absolute top-[calc(100%+6px)] left-0 right-0 max-h-72 overflow-y-auto rounded-xl z-40 shadow-[0_16px_48px_rgba(0,0,0,0.7)]"
                  style={{ background: "#0c1220", border: "1px solid rgba(255,255,255,0.08)" }}>
                  {filteredAccts.length ? filteredAccts.map((a) => (
                    <div
                      key={a.id}
                      onClick={() => { setAcctId(a.id); setAcctName(a.name); setAcctOpen(false); }}
                      className="px-3.5 py-2.5 cursor-pointer truncate text-[13px] transition-colors"
                      style={{ color: a.id === acctId ? "#fff" : "#8a9aba", background: a.id === acctId ? "#2d88ff" : "transparent" }}
                      onMouseEnter={(e) => { if (a.id !== acctId) { e.currentTarget.style.background = "rgba(45,136,255,0.1)"; e.currentTarget.style.color = "#c9d1e0"; } }}
                      onMouseLeave={(e) => { if (a.id !== acctId) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#8a9aba"; } }}>
                      {a.name}
                    </div>
                  )) : (
                    <div className="px-3.5 py-2.5 text-[#3d4f6a] text-[13px]">ไม่พบบัญชี</div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* search */}
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#3d4f6a] pointer-events-none">
              <IcoSearch />
            </div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาชื่อ / เบอร์..."
              className={`${inputCls} pl-9 min-w-[190px]`}
            />
          </div>

          {/* add lead button */}
          <button
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-semibold text-white cursor-pointer transition-all duration-150"
            style={{
              background: "linear-gradient(135deg, #31c48d, #1fa876)",
              border: "1px solid rgba(49,196,141,0.5)",
              boxShadow: "0 0 14px rgba(49,196,141,0.2)",
            }}>
            <IcoPlus /> + เพิ่มลูกค้า
          </button>
        </div>
      </div>

      {/* ── Page body ── */}
      <div className="p-6">

        {/* page heading */}
        <div className="mb-5">
          <h1 className="text-[17px] font-bold text-[#e8eaf5] tracking-[-0.02em] mb-1">ลูกค้ามุ่งหวัง</h1>
          <p className="text-[#3d4f6a] text-[13px]">
            {!acctName
              ? "กรุณาเลือกบัญชีโฆษณา"
              : loading
              ? `${acctName} · กำลังโหลด...`
              : `${acctName} · ${totalCount} รายการ`}
          </p>
        </div>

        {/* status filter chips */}
        <div className="flex gap-2 flex-wrap mb-5">
          {STATUS_FILTERS.map((s) => {
            const active = statusFilter === s;
            const count = s === "all" ? totalCount : counts[s as LeadStatus];
            const color = s === "all" ? "#8a9aba" : STATUS_COLOR[s as LeadStatus];
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[13px] font-medium cursor-pointer transition-all duration-150"
                style={{
                  background: active ? `${color}18` : "#0c1220",
                  border: `1px solid ${active ? `${color}50` : "rgba(255,255,255,0.07)"}`,
                  color: active ? color : "#4a5a7a",
                  boxShadow: active ? `0 0 10px ${color}20` : "none",
                }}>
                {STATUS_LABELS[s]}
                <span
                  className="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                  style={{
                    background: active ? `${color}28` : "rgba(255,255,255,0.05)",
                    color: active ? color : "#2a3a52",
                  }}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* ── Lead list panel ── */}
        <div className="rounded-2xl overflow-hidden" style={{ background: "#0c1220", border: "1px solid rgba(255,255,255,0.06)" }}>
          <AnimatePresence mode="wait" initial={false}>
            {loading ? (
              <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {Array.from({ length: 7 }).map((_, i) => <SkeletonRow key={i} />)}
              </motion.div>
            ) : error ? (
              <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="py-16 flex flex-col items-center gap-4 text-center">
                <div className="text-[#ff6b6b] font-semibold text-[14px]">เกิดข้อผิดพลาด</div>
                <div className="text-[#3d4f6a] text-[12px] max-w-[280px]">{error}</div>
                <button onClick={loadLeads}
                  className="text-[13px] px-4 py-2 rounded-xl cursor-pointer transition-colors text-[#c9d1e0]"
                  style={{ background: "#0c1220", border: "1px solid rgba(255,255,255,0.08)" }}>
                  ลองใหม่
                </button>
              </motion.div>
            ) : leads.length === 0 ? (
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="py-16 flex flex-col items-center gap-3">
                <div className="text-[#3d4f6a] text-[13px]">
                  {search ? `ไม่พบผลลัพธ์สำหรับ "${search}"` : "ยังไม่มีลูกค้า"}
                </div>
                {!search && acctId && (
                  <button onClick={() => setAddOpen(true)}
                    className="flex items-center gap-1.5 text-[13px] px-4 py-2 rounded-xl cursor-pointer transition-all font-medium"
                    style={{ background: "rgba(49,196,141,0.08)", border: "1px solid rgba(49,196,141,0.2)", color: "#31c48d" }}>
                    <IcoPlus /> เพิ่มลูกค้ารายแรก
                  </button>
                )}
              </motion.div>
            ) : (
              <motion.div key={`list-${statusFilter}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {leads.map((lead) => (
                  <LeadRow
                    key={lead.id}
                    lead={lead}
                    onRowClick={() => openDrawer(lead)}
                    onContacted={() => mutate(lead.id, "contacted")}
                    onWon={() => { setWonLeadId(lead.id); setWonAmount(""); setWonProduct(""); setWonError(""); }}
                    onLost={() => {
                      if (lostLeadId === lead.id) { setLostLeadId(null); }
                      else { setLostLeadId(lead.id); setLostReason(""); }
                    }}
                    onLostConfirm={(reason) => { mutate(lead.id, "lost", reason ? { reason } : {}); setLostLeadId(null); }}
                    onReopen={() => mutate(lead.id, "reopen")}
                    lostExpanded={lostLeadId === lead.id}
                    lostReason={lostReason}
                    onLostReasonChange={setLostReason}
                  />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ══ Won modal ══ */}
      <AnimatePresence>
        {wonLeadId && (
          <motion.div
            key="won-overlay"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)" }}
            onClick={(e) => { if (e.target === e.currentTarget) setWonLeadId(null); }}>
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 12 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="w-full max-w-sm rounded-2xl p-5 shadow-[0_32px_80px_rgba(0,0,0,0.8)]"
              style={{ background: "#0c1220", border: "1px solid rgba(245,177,76,0.28)" }}
              onClick={(e) => e.stopPropagation()}>
              {/* header */}
              <div className="flex items-center justify-between mb-4">
                <div className="font-bold text-[15px] text-[#e8eaf5]">ปิดการขาย</div>
                <button onClick={() => setWonLeadId(null)} className="text-[#4a5a7a] hover:text-[#8a9aba] cursor-pointer p-0.5"><IcoX /></button>
              </div>
              {/* amount */}
              <div className="mb-3">
                <label className="block text-[11px] uppercase tracking-[0.1em] text-[#3d4f6a] font-semibold mb-1.5">
                  ยอดขาย (฿) *
                </label>
                <input
                  type="number"
                  value={wonAmount}
                  onChange={(e) => setWonAmount(e.target.value)}
                  placeholder="0"
                  autoFocus
                  className={`${inputCls} w-full text-right font-mono text-[16px]`}
                  style={{ borderColor: wonError ? "rgba(255,107,107,0.6)" : undefined }}
                  onKeyDown={(e) => { if (e.key === "Enter") submitWon(); if (e.key === "Escape") setWonLeadId(null); }}
                />
                {wonError && <div className="text-[11px] text-[#ff6b6b] mt-1.5">{wonError}</div>}
              </div>
              {/* product */}
              <div className="mb-4">
                <label className="block text-[11px] uppercase tracking-[0.1em] text-[#3d4f6a] font-semibold mb-1.5">
                  สินค้า (ไม่บังคับ)
                </label>
                <input
                  type="text"
                  value={wonProduct}
                  onChange={(e) => setWonProduct(e.target.value)}
                  placeholder="ระบุสินค้า..."
                  className={`${inputCls} w-full`}
                  onKeyDown={(e) => { if (e.key === "Enter") submitWon(); }}
                />
              </div>
              {/* buttons */}
              <div className="flex gap-2">
                <button
                  onClick={() => setWonLeadId(null)}
                  className="flex-1 rounded-xl py-2.5 text-[13px] font-medium cursor-pointer transition-colors text-[#4a5a7a] hover:text-[#8a9aba]"
                  style={{ background: "#070c17", border: "1px solid rgba(255,255,255,0.06)" }}>
                  ยกเลิก
                </button>
                <button
                  onClick={submitWon}
                  disabled={wonSubmitting}
                  className="flex-1 rounded-xl py-2.5 text-[13px] font-bold cursor-pointer disabled:opacity-60 transition-all"
                  style={{
                    background: "linear-gradient(135deg, #f5b14c, #e8981a)",
                    color: "#0a0e17",
                    boxShadow: "0 0 16px rgba(245,177,76,0.3)",
                  }}>
                  {wonSubmitting ? "กำลังบันทึก..." : "บันทึกการขาย"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══ Add lead modal ══ */}
      <AnimatePresence>
        {addOpen && (
          <motion.div
            key="add-overlay"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)" }}
            onClick={(e) => { if (e.target === e.currentTarget) setAddOpen(false); }}>
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 12 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="w-full max-w-sm rounded-2xl p-5 shadow-[0_32px_80px_rgba(0,0,0,0.8)]"
              style={{ background: "#0c1220", border: "1px solid rgba(255,255,255,0.1)" }}
              onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <div className="font-bold text-[15px] text-[#e8eaf5]">เพิ่มลูกค้ามุ่งหวัง</div>
                <button onClick={() => setAddOpen(false)} className="text-[#4a5a7a] hover:text-[#8a9aba] cursor-pointer p-0.5"><IcoX /></button>
              </div>
              <div className="space-y-3 mb-4">
                <div>
                  <label className="block text-[11px] uppercase tracking-[0.1em] text-[#3d4f6a] font-semibold mb-1.5">เบอร์โทร *</label>
                  <input
                    type="tel" value={addPhone} onChange={(e) => setAddPhone(e.target.value)}
                    placeholder="08X-XXX-XXXX" autoFocus
                    className={`${inputCls} w-full font-mono`}
                    style={{ borderColor: addError && !addPhone.trim() ? "rgba(255,107,107,0.6)" : undefined }}
                    onKeyDown={(e) => { if (e.key === "Enter") submitAddLead(); }}
                  />
                </div>
                <div>
                  <label className="block text-[11px] uppercase tracking-[0.1em] text-[#3d4f6a] font-semibold mb-1.5">ชื่อ (ไม่บังคับ)</label>
                  <input
                    type="text" value={addName} onChange={(e) => setAddName(e.target.value)}
                    placeholder="ชื่อลูกค้า"
                    className={`${inputCls} w-full`}
                  />
                </div>
                <div>
                  <label className="block text-[11px] uppercase tracking-[0.1em] text-[#3d4f6a] font-semibold mb-1.5">แคมเปญ (ไม่บังคับ)</label>
                  <select
                    value={addCampaignId}
                    onChange={(e) => setAddCampaignId(e.target.value)}
                    className={`${inputCls} w-full cursor-pointer`}
                    disabled={adOptionsLoading}>
                    <option value="">{adOptionsLoading ? "กำลังโหลด..." : "— ไม่ระบุ (unattributed) —"}</option>
                    {adOptions.map((o) => (
                      <option key={o.campaignId} value={o.campaignId}>{o.campaignName}</option>
                    ))}
                  </select>
                </div>
              </div>
              {addError && <div className="text-[12px] text-[#ff6b6b] mb-3">{addError}</div>}
              <div className="flex gap-2">
                <button
                  onClick={() => { setAddOpen(false); setAddError(""); }}
                  className="flex-1 rounded-xl py-2.5 text-[13px] font-medium cursor-pointer transition-colors text-[#4a5a7a] hover:text-[#8a9aba]"
                  style={{ background: "#070c17", border: "1px solid rgba(255,255,255,0.06)" }}>
                  ยกเลิก
                </button>
                <button
                  onClick={submitAddLead}
                  disabled={addSubmitting}
                  className="flex-1 rounded-xl py-2.5 text-[13px] font-bold cursor-pointer disabled:opacity-60 transition-all"
                  style={{
                    background: "linear-gradient(135deg, #31c48d, #1fa876)",
                    color: "#0a0e17",
                    boxShadow: "0 0 14px rgba(49,196,141,0.25)",
                  }}>
                  {addSubmitting ? "กำลังเพิ่ม..." : "เพิ่มลูกค้า"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══ Event drawer ══ */}
      <AnimatePresence>
        {drawerLead && (
          <>
            {/* scrim */}
            <motion.div
              key="drawer-scrim"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40"
              style={{ background: "rgba(0,0,0,0.4)" }}
              onClick={() => setDrawerLead(null)}
            />
            {/* drawer panel */}
            <motion.aside
              key="drawer-panel"
              initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 32 }}
              className="fixed right-0 top-0 h-screen w-[360px] max-w-[90vw] z-50 flex flex-col overflow-hidden"
              style={{ background: "#080c18", borderLeft: "1px solid rgba(255,255,255,0.07)" }}>

              {/* drawer header */}
              <div className="flex items-center justify-between px-5 py-4 flex-shrink-0"
                style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <div>
                  <div className="font-bold text-[15px] text-[#e8eaf5]">
                    {drawerLead.name || drawerLead.phone}
                  </div>
                  <div className="text-[12px] text-[#3d4f6a] mt-0.5 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ background: STATUS_COLOR[drawerLead.status] }} />
                    {STATUS_LABELS[drawerLead.status]}
                    <span className="mx-1">·</span>
                    <span className="font-mono">{relAge(drawerLead.createdAt)}</span>
                  </div>
                </div>
                <button onClick={() => setDrawerLead(null)} className="text-[#4a5a7a] hover:text-[#8a9aba] cursor-pointer p-1">
                  <IcoX />
                </button>
              </div>

              {/* phone + actions */}
              <div className="px-5 py-4 flex-shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-[15px] font-bold text-[#e8eaf5] tracking-wider">{drawerLead.phone}</span>
                  <button
                    onClick={() => copyPhone(drawerLead.phone)}
                    className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg cursor-pointer transition-colors"
                    style={{ background: "rgba(255,255,255,0.06)", color: copied ? "#31c48d" : "#8a9aba" }}>
                    {copied ? <IcoCheck /> : <IcoCopy />}
                    {copied ? "คัดลอกแล้ว" : "คัดลอก"}
                  </button>
                  <a href={`tel:${drawerLead.phone}`}
                    className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg transition-colors"
                    style={{ background: "rgba(49,196,141,0.08)", color: "#31c48d", border: "1px solid rgba(49,196,141,0.2)" }}>
                    <IcoPhone /> โทร
                  </a>
                </div>

                {/* attribution block */}
                {drawerLead.campaignName && (
                  <div className="mt-3 rounded-xl px-3 py-2.5"
                    style={{ background: "rgba(45,136,255,0.06)", border: "1px solid rgba(45,136,255,0.14)" }}>
                    <div className="text-[10px] uppercase tracking-[0.1em] text-[#2d88ff] font-semibold mb-1">แหล่งที่มา</div>
                    <div className="text-[12px] text-[#8a9aba]">{drawerLead.campaignName}</div>
                    {drawerLead.adName && <div className="text-[11px] text-[#4a5a7a] mt-0.5">{drawerLead.adName}</div>}
                  </div>
                )}

                {/* sale amount */}
                {drawerLead.saleAmount != null && (
                  <div className="mt-2 rounded-xl px-3 py-2.5"
                    style={{ background: "rgba(245,177,76,0.06)", border: "1px solid rgba(245,177,76,0.18)" }}>
                    <div className="text-[10px] uppercase tracking-[0.1em] text-[#f5b14c] font-semibold mb-0.5">ยอดขาย</div>
                    <div className="font-mono text-[15px] font-bold text-[#f5b14c]">{fmtBaht(drawerLead.saleAmount)}</div>
                    {drawerLead.product && <div className="text-[11px] text-[#8a9aba] mt-0.5">{drawerLead.product}</div>}
                  </div>
                )}
              </div>

              {/* event timeline */}
              <div className="flex-1 overflow-y-auto px-5 py-4">
                <div className="text-[10px] uppercase tracking-[0.1em] text-[#3d4f6a] font-semibold mb-3">ประวัติ</div>
                {eventsLoading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="flex gap-3">
                        <div className="skeleton w-[7px] h-[7px] rounded-full mt-1.5 flex-shrink-0" />
                        <div className="flex-1">
                          <div className="skeleton h-[12px] w-[80px] mb-2 rounded" />
                          <div className="skeleton h-[10px] w-[120px] rounded" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : events.length === 0 ? (
                  <div className="text-[12px] text-[#3d4f6a]">ยังไม่มีประวัติ</div>
                ) : (
                  <div>
                    {events.map((ev, i) => (
                      <div key={ev.id} className="flex gap-3 relative">
                        {i < events.length - 1 && (
                          <div className="absolute left-[3px] top-4 bottom-0 w-px" style={{ background: "rgba(255,255,255,0.05)" }} />
                        )}
                        <div className="w-[7px] h-[7px] rounded-full mt-[5px] flex-shrink-0"
                          style={{ background: EVENT_KIND_COLOR[ev.kind] || "#8a9aba" }} />
                        <div className="pb-3 flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[12px] font-semibold"
                              style={{ color: EVENT_KIND_COLOR[ev.kind] || "#8a9aba" }}>
                              {EVENT_KIND_LABEL[ev.kind] || ev.kind}
                            </span>
                            {ev.agent && <span className="text-[10px] text-[#3d4f6a]">โดย {ev.agent}</span>}
                            <span className="text-[10px] text-[#2a3a52] ml-auto font-mono">{relAge(ev.ts)}</span>
                          </div>
                          {ev.note && <div className="text-[11px] text-[#5a6a8a] mt-0.5 truncate">{ev.note}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* placeholder chat button */}
              <div className="px-5 pb-5 pt-3 flex-shrink-0" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                <button
                  disabled
                  className="w-full rounded-xl py-2.5 text-[13px] font-medium cursor-not-allowed opacity-35"
                  style={{ background: "#0c1220", border: "1px solid rgba(255,255,255,0.07)", color: "#8a9aba" }}>
                  💬 เปิดแชท — เร็วๆ นี้
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
