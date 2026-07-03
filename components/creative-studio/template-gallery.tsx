"use client";
import { useEffect, useState } from "react";
import type { StudioTemplate } from "@/lib/creative-studio/types";

// Templates prefill the builder's upload-mode copy fields. "Blank" clears them.

export function TemplateGallery({
  onApply,
  onBlank,
}: {
  onApply: (t: StudioTemplate) => void;
  onBlank: () => void;
}) {
  const [templates, setTemplates] = useState<StudioTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/creative-studio/templates")
      .then((r) => r.json())
      .then((d) => setTemplates(d.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="rounded-xl p-4" style={{ background: "#0a0e1a", border: "1px solid rgba(255,255,255,0.07)" }}>
      <div className="text-[12px] font-semibold text-[#e8eaf5] mb-3">เทมเพลต</div>

      {loading && <div className="text-[12px] text-[#3a4a6a]">กำลังโหลด…</div>}

      <div className="space-y-2">
        <button
          onClick={onBlank}
          className="w-full text-left rounded-lg p-2.5 transition-colors"
          style={{ background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(255,255,255,0.12)" }}
        >
          <div className="text-[12px] text-[#c9d1e0]">เริ่มจากศูนย์</div>
          <div className="text-[11px] text-[#3a4a6a]">ล้างฟิลด์ทั้งหมด</div>
        </button>

        {templates.map((t) => (
          <button
            key={t.id}
            onClick={() => onApply(t)}
            className="w-full text-left rounded-lg p-2.5 transition-colors hover:border-[#5b6cff]/40"
            style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="text-[12px] text-[#c9d1e0] truncate">{t.name}</div>
              {t.category && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ background: "rgba(91,108,255,0.12)", color: "#8a9aff" }}>
                  {t.category}
                </span>
              )}
            </div>
            <div className="text-[11px] text-[#6a7a9a] truncate mt-0.5">{t.copy.headline}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
