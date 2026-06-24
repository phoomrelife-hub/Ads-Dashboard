"use client";
import { useState } from "react";
import type { CampaignDraft } from "@/lib/ads-create/chain";
import ObjectiveStep from "./steps/objective";
import BudgetStep from "./steps/budget";
import TargetingStep from "./steps/targeting";
import CreativeStep from "./steps/creative";
import ReviewStep from "./steps/review";

const STEPS = ["บัญชี & เป้าหมาย", "งบประมาณ & การเพิ่มประสิทธิภาพ", "กลุ่มเป้าหมาย", "Creative", "ตรวจสอบ"];

const EMPTY: Partial<CampaignDraft> = {
  specialAdCategories: [],
  currency: "USD",
  targeting: { geo_locations: { countries: ["US"] } },
};

export default function CreateCampaignPage() {
  const [step, setStep] = useState(0);
  const [act, setAct] = useState("");
  const [draft, setDraft] = useState<Partial<CampaignDraft>>(EMPTY);
  const patch = (p: Partial<CampaignDraft>) => setDraft((d) => ({ ...d, ...p }));

  const next = () => setStep((s) => Math.min(STEPS.length - 1, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  return (
    <div className="min-h-screen" style={{ background: "#050810" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(91,108,255,0.12)", border: "1px solid rgba(91,108,255,0.25)" }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="#5b6cff"><path d="M8 1l2 5h5l-4 3 1.5 5L8 11l-4.5 3L5 9 1 6h5z"/></svg>
          </div>
          <div>
            <div className="text-[17px] font-bold text-[#e8eaf5]">แคมเปญใหม่</div>
            <div className="text-[12px] text-[#3a4a6a]">สร้างในสถานะหยุดชั่วคราว — ไม่มีการใช้งบจนกว่าจะเปิดใช้งาน</div>
          </div>
        </div>
      </div>

      {/* Step progress */}
      <div className="px-6 pt-5 pb-2">
        <ol className="flex gap-0 text-[11px]">
          {STEPS.map((label, i) => (
            <li key={label} className="flex items-center gap-0">
              <span
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
                style={{
                  background: i === step ? "rgba(91,108,255,0.18)" : "transparent",
                  color: i === step ? "#8a9aff" : i < step ? "#31c48d" : "#3a4a6a",
                  fontWeight: i === step ? 700 : 400,
                }}
              >
                <span
                  className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0"
                  style={{
                    background: i < step ? "#31c48d" : i === step ? "#5b6cff" : "rgba(255,255,255,0.06)",
                    color: i <= step ? "#fff" : "#3a4a6a",
                  }}
                >
                  {i < step ? "✓" : i + 1}
                </span>
                {label}
              </span>
              {i < STEPS.length - 1 && (
                <span style={{ color: "#1a2a4a", fontSize: 10, padding: "0 2px" }}>›</span>
              )}
            </li>
          ))}
        </ol>
      </div>

      {/* Step content */}
      <div className="px-6 py-4 max-w-2xl">
        {step === 0 && <ObjectiveStep act={act} setAct={setAct} draft={draft} patch={patch} onNext={next} />}
        {step === 1 && <BudgetStep act={act} draft={draft} patch={patch} onNext={next} onBack={back} />}
        {step === 2 && <TargetingStep act={act} draft={draft} patch={patch} onNext={next} onBack={back} />}
        {step === 3 && <CreativeStep act={act} draft={draft} patch={patch} onNext={next} onBack={back} />}
        {step === 4 && <ReviewStep act={act} draft={draft} onBack={back} />}
      </div>
    </div>
  );
}
