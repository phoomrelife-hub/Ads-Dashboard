"use client";
import { useState } from "react";
import type { CampaignDraft } from "@/lib/ads-create/chain";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 py-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
      <span className="text-[11px] uppercase tracking-wide text-[#3a4a6a] font-semibold w-32 flex-shrink-0 pt-0.5">{label}</span>
      <span className="text-[13px] text-[#c8d0e0] break-all">{value || "—"}</span>
    </div>
  );
}

export default function ReviewStep(props: {
  act: string;
  draft: Partial<CampaignDraft>;
  onBack: () => void;
}) {
  const { act, draft, onBack } = props;
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: true; campaignId: string } | { ok: false; error: { message: string; hint?: string } } | null>(null);

  const budgetLine = draft.dailyBudgetMajor != null
    ? `${draft.dailyBudgetMajor} ${draft.currency}/day`
    : draft.lifetimeBudgetMajor != null
    ? `${draft.lifetimeBudgetMajor} ${draft.currency} lifetime`
    : "—";

  const creativeLine = !draft.creative ? "—"
    : draft.creative.mode === "existing_creative" ? `Existing creative ${draft.creative.creativeId}`
    : draft.creative.mode === "existing_post" ? `Page post ${draft.creative.pageId}_${draft.creative.postId}`
    : `Upload (${draft.creative.imageHash ? "image" : draft.creative.videoId ? "video" : "pending"}) · ${draft.creative.link}`;

  async function submit() {
    setSubmitting(true);
    setResult(null);
    try {
      const r = await fetch("/api/ads-create/campaign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ act, draft }),
      });
      const d = await r.json();
      setResult(d);
    } catch (e) {
      setResult({ ok: false, error: { message: e instanceof Error ? e.message : String(e) } });
    } finally {
      setSubmitting(false);
    }
  }

  if (result?.ok) {
    return (
      <div className="rounded-xl p-8 text-center" style={{ background: "#0a0e1a", border: "1px solid rgba(49,196,141,0.3)" }}>
        <div className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: "rgba(49,196,141,0.18)" }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#31c48d" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <div className="text-[16px] font-bold text-[#e8eaf5] mb-1">สร้างแคมเปญแล้ว (หยุดชั่วคราว)</div>
        <div className="text-[12px] text-[#8a9aba] mb-4">ID: {result.campaignId}</div>
        <div className="text-[11px] text-[#3a4a6a] mb-6">
          ยังไม่มีการใช้งบ เปิดใช้งานใน dashboard เมื่อพร้อม
        </div>
        <a
          href={`/?campaign=${result.campaignId}`}
          className="inline-block px-5 py-2.5 rounded-xl text-[13px] font-semibold"
          style={{ background: "linear-gradient(135deg,#5b6cff,#a78bfa)", color: "#fff" }}
        >
          ดูใน Dashboard →
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* PAUSED notice */}
      <div className="rounded-xl p-4" style={{ background: "rgba(245,177,76,0.08)", border: "1px solid rgba(245,177,76,0.25)" }}>
        <div className="text-[13px] font-semibold text-[#f5b14c]">จะถูกสร้างในสถานะหยุดชั่วคราว</div>
        <div className="text-[11px] text-[#c8a050] mt-1">
          แคมเปญ ชุดโฆษณา และโฆษณาจะเริ่มในสถานะ PAUSED ไม่มีการใช้งบจนกว่าจะเปิดใช้งานใน dashboard
        </div>
      </div>

      {/* Summary */}
      <div className="rounded-xl p-5" style={{ background: "#0a0e1a", border: "1px solid rgba(255,255,255,0.07)" }}>
        <div className="text-[11px] uppercase tracking-wide text-[#3a4a6a] font-semibold mb-3">สรุปแคมเปญ</div>
        <Row label="บัญชี" value={act} />
        <Row label="ชื่อ" value={draft.name ?? ""} />
        <Row label="วัตถุประสงค์" value={draft.objective ?? ""} />
        <Row label="หมวดพิเศษ" value={(draft.specialAdCategories ?? []).join(", ") || "ไม่มี"} />
        <Row label="งบประมาณ" value={budgetLine} />
        <Row label="เป้าหมาย" value={draft.optimizationGoal ?? ""} />
        {draft.promotedObject?.pixel_id && <Row label="Pixel" value={draft.promotedObject.pixel_id} />}
        {draft.promotedObject?.custom_event_type && <Row label="Conv. Event" value={draft.promotedObject.custom_event_type} />}
        <Row label="กลุ่มเป้าหมาย" value={JSON.stringify(draft.targeting ?? {})} />
        <Row label="Creative" value={creativeLine} />
        {draft.schedule?.start_time && <Row label="เวลาเริ่ม" value={draft.schedule.start_time} />}
        {draft.schedule?.end_time && <Row label="เวลาสิ้นสุด" value={draft.schedule.end_time} />}
      </div>

      {/* Error from previous attempt */}
      {result && !result.ok && (
        <div className="rounded-xl p-4" style={{ background: "rgba(255,107,107,0.08)", border: "1px solid rgba(255,107,107,0.25)" }}>
          <div className="text-[13px] font-semibold text-[#ff6b6b]">สร้างไม่สำเร็จ</div>
          <div className="text-[12px] text-[#ff8a8a] mt-1">{result.error.message}</div>
          {result.error.hint && <div className="text-[11px] text-[#ff6b6b] mt-1 opacity-70">{result.error.hint}</div>}
          <div className="text-[11px] text-[#5a6a8a] mt-2">ร่างยังคงอยู่ — แก้ไขปัญหาแล้วลองใหม่</div>
        </div>
      )}

      <div className="flex justify-between">
        <button onClick={onBack} className="px-4 py-2.5 rounded-xl text-[13px]" style={{ background: "rgba(255,255,255,0.04)", color: "#8a9aba" }}>
          ← ย้อนกลับ
        </button>
        <button
          onClick={submit}
          disabled={submitting}
          className="px-6 py-2.5 rounded-xl text-[13px] font-bold"
          style={{
            background: submitting ? "rgba(255,255,255,0.06)" : "linear-gradient(135deg,#31c48d,#059669)",
            color: submitting ? "#3a4a6a" : "#fff",
          }}
        >
          {submitting ? "กำลังสร้าง…" : "สร้างแคมเปญ (หยุดชั่วคราว)"}
        </button>
      </div>
    </div>
  );
}
