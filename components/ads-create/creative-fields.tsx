"use client";
import { useEffect, useRef, useState } from "react";
import type { CreativeDraft } from "@/lib/ads-create/chain";

// Shared creative form: mode toggle (upload / existing post / existing creative),
// file upload, and ad-copy fields. Consumed by both the campaign wizard
// (app/create-campaign/steps/creative.tsx) and Creative Studio.

export const inputStyle: React.CSSProperties = {
  background: "#070b14",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8,
  padding: "8px 10px",
  color: "#e8eaf5",
  fontSize: 13,
  outline: "none",
  width: "100%",
};

export const CTA_OPTIONS = [
  "LEARN_MORE", "SHOP_NOW", "SIGN_UP", "BOOK_NOW", "CONTACT_US",
  "APPLY_NOW", "DOWNLOAD", "GET_OFFER", "SUBSCRIBE", "WATCH_MORE",
];

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-[#3a4a6a] font-semibold mb-1.5">{label}</div>
      {children}
    </div>
  );
}

export type CreativeMode = "upload" | "existing_post" | "existing_creative";

export interface CreativeFieldsValue {
  mode: CreativeMode;
  pageId: string;
  // upload mode
  message: string;
  headline: string;
  description: string;
  link: string;
  cta: string;
  imageHash?: string;
  videoId?: string;
  uploadedFileName?: string;
  // existing modes
  selectedPostId: string;
  selectedCreativeId: string;
}

export function emptyCreativeValue(): CreativeFieldsValue {
  return {
    mode: "upload",
    pageId: "",
    message: "",
    headline: "",
    description: "",
    link: "",
    cta: "LEARN_MORE",
    selectedPostId: "",
    selectedCreativeId: "",
  };
}

/** Shared validation: turn the form value into a CreativeDraft, or null if incomplete. */
export function buildCreativeFromValue(v: CreativeFieldsValue): CreativeDraft | null {
  if (v.mode === "existing_creative") {
    if (!v.selectedCreativeId) return null;
    return { mode: "existing_creative", creativeId: v.selectedCreativeId };
  }
  if (v.mode === "existing_post") {
    if (!v.pageId || !v.selectedPostId) return null;
    return { mode: "existing_post", pageId: v.pageId, postId: v.selectedPostId };
  }
  // upload
  if (!v.pageId || !v.link || !v.headline || !v.message) return null;
  return {
    mode: "upload",
    pageId: v.pageId,
    imageHash: v.imageHash,
    videoId: v.videoId,
    message: v.message,
    headline: v.headline,
    description: v.description,
    link: v.link,
    cta: v.cta,
  };
}

export function CreativeFields({
  act,
  value,
  onChange,
  onPreviewFile,
}: {
  act: string;
  value: CreativeFieldsValue;
  onChange: (patch: Partial<CreativeFieldsValue>) => void;
  /** Fires when a local file is selected, giving an object URL for live preview. */
  onPreviewFile?: (url: string | null, fileName: string | null) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pages, setPages] = useState<{ id: string; name: string }[]>([]);
  const [posts, setPosts] = useState<{ id: string; message: string }[]>([]);
  const [existingCreatives, setExistingCreatives] = useState<{ id: string; name: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/ads-create/pickers?kind=pages")
      .then((r) => r.json())
      .then((d) => {
        setPages(d.data ?? []);
        if (!value.pageId && d.data?.[0]) onChange({ pageId: d.data[0].id });
      })
      .catch(() => {});
    if (act) {
      fetch(`/api/ads-create/pickers?kind=creatives&act=${act}`)
        .then((r) => r.json())
        .then((d) => setExistingCreatives(d.data ?? []))
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [act]);

  useEffect(() => {
    if (value.pageId && value.mode === "existing_post") {
      fetch(`/api/ads-create/pickers?kind=posts&pageId=${value.pageId}`)
        .then((r) => r.json())
        .then((d) => setPosts(d.data ?? []))
        .catch(() => {});
    }
  }, [value.pageId, value.mode]);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !act) return;
    onPreviewFile?.(URL.createObjectURL(file), file.name); // local preview immediately
    setUploading(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append("act", act);
      fd.append("file", file);
      const r = await fetch("/api/ads-create/upload", { method: "POST", body: fd });
      const d = await r.json();
      if (d.image_hash) {
        onChange({ imageHash: d.image_hash, videoId: undefined, uploadedFileName: file.name });
      } else if (d.video_id) {
        onChange({ videoId: d.video_id, imageHash: undefined, uploadedFileName: file.name });
      } else {
        setUploadError(d.error ?? "Upload failed");
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Mode toggle */}
      <div className="rounded-xl p-5" style={{ background: "#0a0e1a", border: "1px solid rgba(255,255,255,0.07)" }}>
        <div className="text-[11px] uppercase tracking-wide text-[#3a4a6a] font-semibold mb-3">แหล่ง Creative</div>
        <div className="flex gap-2">
          {([["upload", "อัปโหลดใหม่"], ["existing_post", "โพสต์ที่มีอยู่"], ["existing_creative", "Creative ที่มีอยู่"]] as [CreativeMode, string][]).map(([m, label]) => (
            <button key={m} onClick={() => onChange({ mode: m })}
              className="px-3 py-2 rounded-lg text-[12px] font-medium flex-1"
              style={{
                background: value.mode === m ? "rgba(91,108,255,0.18)" : "rgba(255,255,255,0.04)",
                border: value.mode === m ? "1px solid rgba(91,108,255,0.4)" : "1px solid rgba(255,255,255,0.07)",
                color: value.mode === m ? "#8a9aff" : "#6a7a9a",
              }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Upload mode */}
      {value.mode === "upload" && (
        <div className="rounded-xl p-5 space-y-4" style={{ background: "#0a0e1a", border: "1px solid rgba(255,255,255,0.07)" }}>
          <Field label="เพจ">
            <select value={value.pageId} onChange={(e) => onChange({ pageId: e.target.value })} style={inputStyle}>
              <option value="">เลือกเพจ…</option>
              {pages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>

          <Field label="รูปภาพหรือวิดีโอ">
            <div
              className="rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-colors"
              style={{ borderColor: "rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.02)" }}
              onClick={() => fileRef.current?.click()}
            >
              <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleFileUpload} />
              {uploading ? (
                <div className="text-[12px] text-[#5b6cff]">กำลังอัปโหลด…</div>
              ) : value.uploadedFileName ? (
                <div className="text-[12px] text-[#31c48d]">✓ {value.uploadedFileName} {value.imageHash ? `(hash: ${value.imageHash.slice(0, 8)}…)` : value.videoId ? `(video: ${value.videoId})` : ""}</div>
              ) : (
                <div className="text-[12px] text-[#3a4a6a]">คลิกเพื่ออัปโหลดรูปภาพหรือวิดีโอ</div>
              )}
              {uploadError && <div className="text-[11px] mt-1" style={{ color: "#ff6b6b" }}>{uploadError}</div>}
            </div>
          </Field>

          <Field label="ข้อความหลัก">
            <textarea rows={3} value={value.message} onChange={(e) => onChange({ message: e.target.value })}
              placeholder="ข้อความหลักของโฆษณาคืออะไร?" className="resize-none" style={inputStyle} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="หัวข้อ">
              <input value={value.headline} onChange={(e) => onChange({ headline: e.target.value })} placeholder="หัวข้อสั้น ๆ" style={inputStyle} />
            </Field>
            <Field label="คำอธิบาย (ไม่บังคับ)">
              <input value={value.description} onChange={(e) => onChange({ description: e.target.value })} placeholder="รายละเอียดเพิ่มเติม" style={inputStyle} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="URL ปลายทาง">
              <input value={value.link} onChange={(e) => onChange({ link: e.target.value })} placeholder="https://…" style={inputStyle} />
            </Field>
            <Field label="Call to Action">
              <select value={value.cta} onChange={(e) => onChange({ cta: e.target.value })} style={inputStyle}>
                {CTA_OPTIONS.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
              </select>
            </Field>
          </div>
        </div>
      )}

      {/* Existing post mode */}
      {value.mode === "existing_post" && (
        <div className="rounded-xl p-5 space-y-4" style={{ background: "#0a0e1a", border: "1px solid rgba(255,255,255,0.07)" }}>
          <Field label="เพจ">
            <select value={value.pageId} onChange={(e) => onChange({ pageId: e.target.value })} style={inputStyle}>
              <option value="">เลือกเพจ…</option>
              {pages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="โพสต์">
            <select value={value.selectedPostId} onChange={(e) => onChange({ selectedPostId: e.target.value })} style={inputStyle}>
              <option value="">เลือกโพสต์…</option>
              {posts.map((p) => <option key={p.id} value={p.id}>{p.message.slice(0, 80)}</option>)}
            </select>
          </Field>
        </div>
      )}

      {/* Existing creative mode */}
      {value.mode === "existing_creative" && (
        <div className="rounded-xl p-5 space-y-4" style={{ background: "#0a0e1a", border: "1px solid rgba(255,255,255,0.07)" }}>
          <Field label="Ad Creative">
            <select value={value.selectedCreativeId} onChange={(e) => onChange({ selectedCreativeId: e.target.value })} style={inputStyle}>
              <option value="">เลือก Creative…</option>
              {existingCreatives.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        </div>
      )}
    </div>
  );
}
