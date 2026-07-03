"use client";
import { useState } from "react";
import type { CampaignDraft } from "@/lib/ads-create/chain";
import {
  CreativeFields,
  buildCreativeFromValue,
  emptyCreativeValue,
  type CreativeFieldsValue,
} from "@/components/ads-create/creative-fields";

export default function CreativeStep(props: {
  act: string;
  draft: Partial<CampaignDraft>;
  patch: (p: Partial<CampaignDraft>) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const { act, patch, onNext, onBack } = props;
  const [value, setValue] = useState<CreativeFieldsValue>(emptyCreativeValue());

  const creative = buildCreativeFromValue(value);
  const canProceed = !!creative;

  function commit() {
    const c = buildCreativeFromValue(value);
    if (c) patch({ creative: c });
  }

  return (
    <div className="space-y-5">
      <CreativeFields
        act={act}
        value={value}
        onChange={(p) => setValue((v) => ({ ...v, ...p }))}
      />

      <div className="flex justify-between">
        <button onClick={onBack} className="px-4 py-2.5 rounded-xl text-[13px]" style={{ background: "rgba(255,255,255,0.04)", color: "#8a9aba" }}>
          ← ย้อนกลับ
        </button>
        <button
          disabled={!canProceed}
          onClick={() => { commit(); onNext(); }}
          className="px-5 py-2.5 rounded-xl text-[13px] font-semibold"
          style={{
            background: canProceed ? "linear-gradient(135deg,#5b6cff,#a78bfa)" : "rgba(255,255,255,0.06)",
            color: canProceed ? "#fff" : "#3a4a6a",
          }}
        >
          ถัดไป: ตรวจสอบ →
        </button>
      </div>
    </div>
  );
}
