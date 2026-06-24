"use client";
import { useEffect, useRef, useState } from "react";
import type { CampaignDraft, CreativeDraft } from "@/lib/ads-create/chain";

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
    <div>
      <div className="text-[11px] uppercase tracking-wide text-[#3a4a6a] font-semibold mb-1.5">{label}</div>
      {children}
    </div>
  );
}

type Mode = "upload" | "existing_post" | "existing_creative";

const CTA_OPTIONS = ["LEARN_MORE", "SHOP_NOW", "SIGN_UP", "BOOK_NOW", "CONTACT_US", "APPLY_NOW", "DOWNLOAD", "GET_OFFER", "SUBSCRIBE", "WATCH_MORE"];

export default function CreativeStep(props: {
  act: string;
  draft: Partial<CampaignDraft>;
  patch: (p: Partial<CampaignDraft>) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const { act, patch, onNext, onBack } = props;
  const [mode, setMode] = useState<Mode>("upload");
  const [pages, setPages] = useState<{ id: string; name: string }[]>([]);
  const [pageId, setPageId] = useState("");
  const [posts, setPosts] = useState<{ id: string; message: string }[]>([]);
  const [existingCreatives, setExistingCreatives] = useState<{ id: string; name: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Upload mode fields
  const [message, setMessage] = useState("");
  const [headline, setHeadline] = useState("");
  const [description, setDescription] = useState("");
  const [link, setLink] = useState("");
  const [cta, setCta] = useState("LEARN_MORE");
  const [imageHash, setImageHash] = useState<string | undefined>();
  const [videoId, setVideoId] = useState<string | undefined>();
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);

  // Existing post mode
  const [selectedPostId, setSelectedPostId] = useState("");

  // Existing creative mode
  const [selectedCreativeId, setSelectedCreativeId] = useState("");

  useEffect(() => {
    fetch("/api/ads-create/pickers?kind=pages")
      .then((r) => r.json())
      .then((d) => { setPages(d.data ?? []); if (d.data?.[0]) setPageId(d.data[0].id); })
      .catch(() => {});
    if (act) {
      fetch(`/api/ads-create/pickers?kind=creatives&act=${act}`)
        .then((r) => r.json())
        .then((d) => setExistingCreatives(d.data ?? []))
        .catch(() => {});
    }
  }, [act]);

  useEffect(() => {
    if (pageId && mode === "existing_post") {
      fetch(`/api/ads-create/pickers?kind=posts&pageId=${pageId}`)
        .then((r) => r.json())
        .then((d) => setPosts(d.data ?? []))
        .catch(() => {});
    }
  }, [pageId, mode]);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !act) return;
    setUploading(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append("act", act);
      fd.append("file", file);
      const r = await fetch("/api/ads-create/upload", { method: "POST", body: fd });
      const d = await r.json();
      if (d.image_hash) {
        setImageHash(d.image_hash);
        setVideoId(undefined);
        setUploadedFileName(file.name);
      } else if (d.video_id) {
        setVideoId(d.video_id);
        setImageHash(undefined);
        setUploadedFileName(file.name);
      } else {
        setUploadError(d.error ?? "Upload failed");
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  }

  function buildCreative(): CreativeDraft | null {
    if (mode === "existing_creative") {
      if (!selectedCreativeId) return null;
      return { mode: "existing_creative", creativeId: selectedCreativeId };
    }
    if (mode === "existing_post") {
      if (!pageId || !selectedPostId) return null;
      return { mode: "existing_post", pageId, postId: selectedPostId };
    }
    // upload
    if (!pageId || !link || !headline || !message) return null;
    return {
      mode: "upload",
      pageId,
      imageHash,
      videoId,
      message,
      headline,
      description,
      link,
      cta,
    };
  }

  const creative = buildCreative();
  const canProceed = !!creative;

  function commit() {
    const c = buildCreative();
    if (c) patch({ creative: c });
  }

  return (
    <div className="space-y-5">
      {/* Mode toggle */}
      <div className="rounded-xl p-5" style={{ background: "#0a0e1a", border: "1px solid rgba(255,255,255,0.07)" }}>
        <div className="text-[11px] uppercase tracking-wide text-[#3a4a6a] font-semibold mb-3">แหล่ง Creative</div>
        <div className="flex gap-2">
          {([["upload", "อัปโหลดใหม่"], ["existing_post", "โพสต์ที่มีอยู่"], ["existing_creative", "Creative ที่มีอยู่"]] as [Mode, string][]).map(([m, label]) => (
            <button key={m} onClick={() => setMode(m)}
              className="px-3 py-2 rounded-lg text-[12px] font-medium flex-1"
              style={{
                background: mode === m ? "rgba(91,108,255,0.18)" : "rgba(255,255,255,0.04)",
                border: mode === m ? "1px solid rgba(91,108,255,0.4)" : "1px solid rgba(255,255,255,0.07)",
                color: mode === m ? "#8a9aff" : "#6a7a9a",
              }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Upload mode */}
      {mode === "upload" && (
        <div className="rounded-xl p-5 space-y-4" style={{ background: "#0a0e1a", border: "1px solid rgba(255,255,255,0.07)" }}>
          <Field label="เพจ">
            <select value={pageId} onChange={(e) => setPageId(e.target.value)} style={inputStyle}>
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
              ) : uploadedFileName ? (
                <div className="text-[12px] text-[#31c48d]">✓ {uploadedFileName} {imageHash ? `(hash: ${imageHash.slice(0, 8)}…)` : videoId ? `(video: ${videoId})` : ""}</div>
              ) : (
                <div className="text-[12px] text-[#3a4a6a]">คลิกเพื่ออัปโหลดรูปภาพหรือวิดีโอ</div>
              )}
              {uploadError && <div className="text-[11px] mt-1" style={{ color: "#ff6b6b" }}>{uploadError}</div>}
            </div>
          </Field>

          <Field label="ข้อความหลัก">
            <textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)}
              placeholder="ข้อความหลักของโฆษณาคืออะไร?" className="resize-none" style={inputStyle} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="หัวข้อ">
              <input value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="หัวข้อสั้น ๆ" style={inputStyle} />
            </Field>
            <Field label="คำอธิบาย (ไม่บังคับ)">
              <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="รายละเอียดเพิ่มเติม" style={inputStyle} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="URL ปลายทาง">
              <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" style={inputStyle} />
            </Field>
            <Field label="Call to Action">
              <select value={cta} onChange={(e) => setCta(e.target.value)} style={inputStyle}>
                {CTA_OPTIONS.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
              </select>
            </Field>
          </div>
        </div>
      )}

      {/* Existing post mode */}
      {mode === "existing_post" && (
        <div className="rounded-xl p-5 space-y-4" style={{ background: "#0a0e1a", border: "1px solid rgba(255,255,255,0.07)" }}>
          <Field label="เพจ">
            <select value={pageId} onChange={(e) => setPageId(e.target.value)} style={inputStyle}>
              <option value="">เลือกเพจ…</option>
              {pages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="โพสต์">
            <select value={selectedPostId} onChange={(e) => setSelectedPostId(e.target.value)} style={inputStyle}>
              <option value="">เลือกโพสต์…</option>
              {posts.map((p) => <option key={p.id} value={p.id}>{p.message.slice(0, 80)}</option>)}
            </select>
          </Field>
        </div>
      )}

      {/* Existing creative mode */}
      {mode === "existing_creative" && (
        <div className="rounded-xl p-5 space-y-4" style={{ background: "#0a0e1a", border: "1px solid rgba(255,255,255,0.07)" }}>
          <Field label="Ad Creative">
            <select value={selectedCreativeId} onChange={(e) => setSelectedCreativeId(e.target.value)} style={inputStyle}>
              <option value="">เลือก Creative…</option>
              {existingCreatives.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
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
