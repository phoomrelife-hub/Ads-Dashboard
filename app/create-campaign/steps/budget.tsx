"use client";
import { useEffect, useMemo, useState } from "react";
import { optimizationGoalsFor, validateBudgetFloor } from "@/lib/ads-create/spec";
import type { CampaignDraft } from "@/lib/ads-create/chain";

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

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-[#3a4a6a] font-semibold mb-1.5">{label}</div>
      {children}
      {hint && <div className="text-[11px] text-[#3a4a6a] mt-1">{hint}</div>}
    </div>
  );
}

const CURRENCIES = ["USD", "EUR", "GBP", "THB", "JPY", "AUD", "SGD"];

const CONVERSION_EVENTS = [
  "PURCHASE", "LEAD", "COMPLETE_REGISTRATION", "ADD_TO_CART",
  "INITIATE_CHECKOUT", "SUBSCRIBE", "CONTACT", "SUBMIT_APPLICATION",
];

export default function BudgetStep(props: {
  act: string;
  draft: Partial<CampaignDraft>;
  patch: (p: Partial<CampaignDraft>) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const { act, draft, patch, onNext, onBack } = props;
  const [budgetType, setBudgetType] = useState<"daily" | "lifetime">("daily");
  const [budgetAmount, setBudgetAmount] = useState<string>("");
  const [pixels, setPixels] = useState<{ id: string; name: string }[]>([]);

  const goals = useMemo(() => {
    if (!draft.objective) return [];
    return optimizationGoalsFor(draft.objective);
  }, [draft.objective]);

  const needsPixel = draft.objective === "OUTCOME_LEADS" || draft.objective === "OUTCOME_SALES";

  useEffect(() => {
    if (needsPixel && act) {
      fetch(`/api/ads-create/pickers?kind=pixels&act=${act}`)
        .then((r) => r.json())
        .then((d) => setPixels(d.data ?? []))
        .catch(() => {});
    }
  }, [needsPixel, act]);

  const budgetError = useMemo(() => {
    if (!budgetAmount) return null;
    const n = parseFloat(budgetAmount);
    if (isNaN(n)) return "กรุณาใส่ตัวเลขที่ถูกต้อง";
    return validateBudgetFloor(n, draft.currency ?? "USD");
  }, [budgetAmount, draft.currency]);

  const canProceed = !budgetError && !!budgetAmount && !!draft.optimizationGoal;

  function apply() {
    const n = parseFloat(budgetAmount);
    if (budgetType === "daily") {
      patch({ dailyBudgetMajor: n, lifetimeBudgetMajor: undefined });
    } else {
      patch({ lifetimeBudgetMajor: n, dailyBudgetMajor: undefined });
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl p-5 space-y-4" style={{ background: "#0a0e1a", border: "1px solid rgba(255,255,255,0.07)" }}>
        <Field label="เป้าหมายการเพิ่มประสิทธิภาพ">
          <select
            value={draft.optimizationGoal ?? ""}
            onChange={(e) => patch({ optimizationGoal: e.target.value })}
            style={inputStyle}
          >
            <option value="">เลือก…</option>
            {goals.map((g) => (
              <option key={g} value={g}>{g.replace(/_/g, " ")}</option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="สกุลเงิน">
            <select
              value={draft.currency ?? "USD"}
              onChange={(e) => patch({ currency: e.target.value })}
              style={inputStyle}
            >
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>

          <Field label="ประเภทงบ">
            <select value={budgetType} onChange={(e) => setBudgetType(e.target.value as "daily" | "lifetime")} style={inputStyle}>
              <option value="daily">รายวัน</option>
              <option value="lifetime">ตลอดอายุ</option>
            </select>
          </Field>
        </div>

        <Field label={`งบ${budgetType === "daily" ? "รายวัน" : "ตลอดอายุ"}`} hint={budgetError ?? undefined}>
          <input
            type="number"
            min="0"
            step="0.01"
            value={budgetAmount}
            onChange={(e) => { setBudgetAmount(e.target.value); }}
            onBlur={apply}
            placeholder="e.g. 50"
            style={{ ...inputStyle, borderColor: budgetError ? "rgba(255,107,107,0.5)" : "rgba(255,255,255,0.1)" }}
          />
          {budgetError && <div className="text-[11px] mt-1" style={{ color: "#ff6b6b" }}>{budgetError}</div>}
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="เวลาเริ่มต้น (ไม่บังคับ)">
            <input
              type="datetime-local"
              value={draft.schedule?.start_time ?? ""}
              onChange={(e) => patch({ schedule: { ...draft.schedule, start_time: e.target.value } })}
              style={inputStyle}
            />
          </Field>
          <Field label="เวลาสิ้นสุด (ไม่บังคับ)">
            <input
              type="datetime-local"
              value={draft.schedule?.end_time ?? ""}
              onChange={(e) => patch({ schedule: { ...draft.schedule, end_time: e.target.value } })}
              style={inputStyle}
            />
          </Field>
        </div>
      </div>

      {needsPixel && (
        <div className="rounded-xl p-5 space-y-4" style={{ background: "#0a0e1a", border: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="text-[11px] uppercase tracking-wide text-[#3a4a6a] font-semibold mb-3">การติดตาม Conversion</div>
          <Field label="Pixel">
            <select
              value={draft.promotedObject?.pixel_id ?? ""}
              onChange={(e) => patch({ promotedObject: { ...draft.promotedObject, pixel_id: e.target.value } })}
              style={inputStyle}
            >
              <option value="">เลือก Pixel…</option>
              {pixels.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Conversion Event">
            <select
              value={draft.promotedObject?.custom_event_type ?? ""}
              onChange={(e) => patch({ promotedObject: { ...draft.promotedObject, custom_event_type: e.target.value } })}
              style={inputStyle}
            >
              <option value="">เลือก event…</option>
              {CONVERSION_EVENTS.map((ev) => <option key={ev} value={ev}>{ev.replace(/_/g, " ")}</option>)}
            </select>
          </Field>
        </div>
      )}

      <div className="flex justify-between">
        <button onClick={onBack} className="px-4 py-2.5 rounded-xl text-[13px]" style={{ background: "rgba(255,255,255,0.04)", color: "#8a9aba" }}>
          ← ย้อนกลับ
        </button>
        <button
          disabled={!canProceed}
          onClick={() => { apply(); onNext(); }}
          className="px-5 py-2.5 rounded-xl text-[13px] font-semibold"
          style={{
            background: canProceed ? "linear-gradient(135deg,#5b6cff,#a78bfa)" : "rgba(255,255,255,0.06)",
            color: canProceed ? "#fff" : "#3a4a6a",
          }}
        >
          ถัดไป: กลุ่มเป้าหมาย →
        </button>
      </div>
    </div>
  );
}
