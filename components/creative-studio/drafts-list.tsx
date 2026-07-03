"use client";
import { useCallback, useEffect, useState } from "react";
import type { StudioDraft } from "@/lib/creative-studio/types";

const MODE_LABEL: Record<string, string> = {
  upload: "อัปโหลด",
  existing_post: "โพสต์",
  existing_creative: "Creative",
};

export function DraftsList({
  act,
  reloadKey,
  onEdit,
}: {
  act: string;
  reloadKey: number;
  onEdit: (draft: StudioDraft) => void;
}) {
  const [drafts, setDrafts] = useState<StudioDraft[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!act) return;
    setLoading(true);
    fetch(`/api/creative-studio/drafts?act=${act}`)
      .then((r) => r.json())
      .then((d) => setDrafts(d.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [act]);

  useEffect(() => { load(); }, [load, reloadKey]);

  async function publish(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const r = await fetch("/api/creative-studio/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const d = await r.json();
      if (d.error) { setError(d.hint ? `${d.hint}: ${d.error}` : d.error); return; }
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    setBusyId(id);
    try {
      await fetch(`/api/creative-studio/drafts?id=${id}`, { method: "DELETE" });
      load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="rounded-xl p-4" style={{ background: "#0a0e1a", border: "1px solid rgba(255,255,255,0.07)" }}>
      <div className="flex items-center justify-between mb-3">
        <div className="text-[12px] font-semibold text-[#e8eaf5]">ฉบับร่างที่บันทึก</div>
        {loading && <div className="text-[10px] text-[#3a4a6a]">กำลังโหลด…</div>}
      </div>

      {error && <div className="text-[11px] mb-2" style={{ color: "#ff6b6b" }}>{error}</div>}
      {!loading && drafts.length === 0 && (
        <div className="text-[12px] text-[#3a4a6a]">ยังไม่มีฉบับร่าง — สร้างและบันทึกได้เลย</div>
      )}

      <div className="space-y-2">
        {drafts.map((d) => {
          const published = d.status === "published";
          const busy = busyId === d.id;
          return (
            <div key={d.id} className="rounded-lg p-2.5" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] text-[#c9d1e0] truncate">{d.name}</div>
                  <div className="text-[10px] text-[#6a7a9a]">
                    {MODE_LABEL[d.creative.mode] ?? d.creative.mode}
                    {published && <span className="ml-1.5" style={{ color: "#31c48d" }}>· เผยแพร่แล้ว</span>}
                  </div>
                </div>
              </div>
              <div className="flex gap-1.5 mt-2">
                <button
                  onClick={() => onEdit(d)}
                  className="text-[11px] font-semibold px-2.5 py-1 rounded-md"
                  style={{ background: "rgba(91,108,255,0.12)", color: "#8a9aff", border: "1px solid rgba(91,108,255,0.22)" }}
                >
                  แก้ไข
                </button>
                {!published && (
                  <button
                    disabled={busy}
                    onClick={() => publish(d.id)}
                    className="text-[11px] font-semibold px-2.5 py-1 rounded-md disabled:opacity-50"
                    style={{ background: "rgba(49,196,141,0.12)", color: "#31c48d", border: "1px solid rgba(49,196,141,0.22)" }}
                  >
                    {busy ? "กำลังเผยแพร่…" : "เผยแพร่"}
                  </button>
                )}
                <button
                  disabled={busy}
                  onClick={() => remove(d.id)}
                  className="text-[11px] font-semibold px-2.5 py-1 rounded-md disabled:opacity-50 ml-auto"
                  style={{ background: "rgba(255,107,107,0.1)", color: "#ff6b6b", border: "1px solid rgba(255,107,107,0.2)" }}
                >
                  ลบ
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
