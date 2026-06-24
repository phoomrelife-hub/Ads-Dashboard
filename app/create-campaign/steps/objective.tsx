"use client";
import { useEffect, useState } from "react";
import { OBJECTIVES, type Objective } from "@/lib/ads-create/spec";
import type { CampaignDraft } from "@/lib/ads-create/chain";

const SPECIAL_AD_CATS = [
  { value: "HOUSING", label: "ที่อยู่อาศัย" },
  { value: "CREDIT", label: "สินเชื่อ" },
  { value: "EMPLOYMENT", label: "การจ้างงาน" },
];

const inputStyle: React.CSSProperties = {
  background: "#070b14",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8,
  padding: "8px 10px",
  color: "#e8eaf5",
  fontSize: 13,
  outline: "none",
  width: "100%",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[11px] uppercase tracking-wide text-[#3a4a6a] font-semibold mb-1.5">{label}</div>
      {children}
    </label>
  );
}

export default function ObjectiveStep(props: {
  act: string;
  setAct: (a: string) => void;
  draft: Partial<CampaignDraft>;
  patch: (p: Partial<CampaignDraft>) => void;
  onNext: () => void;
}) {
  const { act, setAct, draft, patch, onNext } = props;
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [canWrite, setCanWrite] = useState<boolean | null>(null);
  const [loadingAccts, setLoadingAccts] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/accounts").then((r) => r.json()),
      fetch("/api/ads-create/status").then((r) => r.json()).catch(() => ({ canWrite: true })),
    ]).then(([accts, status]) => {
      if (Array.isArray(accts)) {
        setAccounts(accts);
        if (accts[0] && !act) setAct(accts[0].id);
      }
      setCanWrite(status?.canWrite !== false);
    }).catch(() => {
      setCanWrite(true);
    }).finally(() => setLoadingAccts(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleCat = (cat: string) => {
    const cur = draft.specialAdCategories ?? [];
    const next = cur.includes(cat) ? cur.filter((c) => c !== cat) : [...cur, cat];
    patch({ specialAdCategories: next });
  };

  const canProceed = !!act && !!draft.objective && canWrite !== false;

  return (
    <div className="space-y-5">
      {canWrite === false && (
        <div className="rounded-xl p-4" style={{ background: "rgba(255,107,107,0.08)", border: "1px solid rgba(255,107,107,0.25)" }}>
          <div className="text-[13px] font-semibold text-[#ff6b6b]">Token อ่านได้อย่างเดียว</div>
          <div className="text-[11px] text-[#ff8a8a] mt-1">
            Token นี้อ่านได้แต่ไม่สามารถสร้างแคมเปญ — ต้องการสิทธิ์ <code>ads_management</code>
          </div>
        </div>
      )}

      <div className="rounded-xl p-5 space-y-4" style={{ background: "#0a0e1a", border: "1px solid rgba(255,255,255,0.07)" }}>
        <Field label="บัญชีโฆษณา">
          {loadingAccts ? (
            <div className="h-9 rounded-lg animate-pulse" style={{ background: "rgba(255,255,255,0.05)" }} />
          ) : (
            <select value={act} onChange={(e) => setAct(e.target.value)} style={inputStyle}>
              <option value="">เลือกบัญชี…</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          )}
        </Field>

        <Field label="ชื่อแคมเปญ">
          <input
            value={draft.name ?? ""}
            onChange={(e) => patch({ name: e.target.value })}
            placeholder="เช่น Summer Sale 2026"
            style={inputStyle}
          />
        </Field>
      </div>

      <div className="rounded-xl p-5" style={{ background: "#0a0e1a", border: "1px solid rgba(255,255,255,0.07)" }}>
        <div className="text-[11px] uppercase tracking-wide text-[#3a4a6a] font-semibold mb-3">วัตถุประสงค์</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {OBJECTIVES.map((o) => {
            const active = draft.objective === o.value;
            return (
              <button
                key={o.value}
                onClick={() => patch({ objective: o.value as Objective })}
                className="rounded-xl p-3 text-left transition-all"
                style={{
                  background: active ? "rgba(91,108,255,0.18)" : "rgba(255,255,255,0.03)",
                  border: active ? "1px solid rgba(91,108,255,0.45)" : "1px solid rgba(255,255,255,0.06)",
                  color: active ? "#8a9aff" : "#8a9aba",
                }}
              >
                <div className="text-[13px] font-semibold">{o.label}</div>
                <div className="text-[10px] mt-0.5 opacity-60">{o.value}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl p-5" style={{ background: "#0a0e1a", border: "1px solid rgba(255,255,255,0.07)" }}>
        <div className="text-[11px] uppercase tracking-wide text-[#3a4a6a] font-semibold mb-1">หมวดโฆษณาพิเศษ</div>
        <div className="text-[11px] text-[#3a4a6a] mb-3">เลือกทุกข้อที่เกี่ยวข้อง (บังคับโดย Facebook)</div>
        <div className="flex gap-3 flex-wrap">
          {SPECIAL_AD_CATS.map((c) => {
            const active = (draft.specialAdCategories ?? []).includes(c.value);
            return (
              <button
                key={c.value}
                onClick={() => toggleCat(c.value)}
                className="px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all"
                style={{
                  background: active ? "rgba(245,177,76,0.18)" : "rgba(255,255,255,0.04)",
                  border: active ? "1px solid rgba(245,177,76,0.4)" : "1px solid rgba(255,255,255,0.07)",
                  color: active ? "#f5b14c" : "#6a7a9a",
                }}
              >
                {c.label}
              </button>
            );
          })}
          <button
            onClick={() => patch({ specialAdCategories: [] })}
            className="px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all"
            style={{
              background: (draft.specialAdCategories ?? []).length === 0 ? "rgba(49,196,141,0.18)" : "rgba(255,255,255,0.04)",
              border: (draft.specialAdCategories ?? []).length === 0 ? "1px solid rgba(49,196,141,0.4)" : "1px solid rgba(255,255,255,0.07)",
              color: (draft.specialAdCategories ?? []).length === 0 ? "#31c48d" : "#6a7a9a",
            }}
          >
            ไม่มี
          </button>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          disabled={!canProceed}
          onClick={onNext}
          className="px-5 py-2.5 rounded-xl text-[13px] font-semibold transition-all"
          style={{
            background: canProceed ? "linear-gradient(135deg,#5b6cff,#a78bfa)" : "rgba(255,255,255,0.06)",
            color: canProceed ? "#fff" : "#3a4a6a",
          }}
        >
          ถัดไป: งบประมาณ →
        </button>
      </div>
    </div>
  );
}
