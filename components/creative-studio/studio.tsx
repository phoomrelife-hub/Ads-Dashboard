"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  emptyCreativeValue,
  buildCreativeFromValue,
  type CreativeFieldsValue,
} from "@/components/ads-create/creative-fields";
import type { CreativeDraft } from "@/lib/ads-create/chain";
import type { StudioDraft, StudioTemplate } from "@/lib/creative-studio/types";
import { CreativeBuilder } from "./creative-builder";
import { AdPreview } from "./ad-preview";
import { TemplateGallery } from "./template-gallery";
import { TopPerformers } from "./top-performers";
import { DraftsList } from "./drafts-list";

type Acct = { id: string; name: string; active: boolean };

const selectStyle: React.CSSProperties = {
  background: "#070b14",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 10,
  padding: "8px 12px",
  color: "#e8eaf5",
  fontSize: 13,
  outline: "none",
  minWidth: 240,
};

// Rebuild the form value from a stored CreativeDraft (for editing).
function valueFromCreative(c: CreativeDraft): CreativeFieldsValue {
  const base = emptyCreativeValue();
  if (c.mode === "upload") {
    return {
      ...base,
      mode: "upload",
      pageId: c.pageId,
      message: c.message,
      headline: c.headline,
      description: c.description ?? "",
      link: c.link,
      cta: c.cta,
      imageHash: c.imageHash,
      videoId: c.videoId,
    };
  }
  if (c.mode === "existing_post") {
    return { ...base, mode: "existing_post", pageId: c.pageId, selectedPostId: c.postId };
  }
  return { ...base, mode: "existing_creative", selectedCreativeId: c.creativeId };
}

export function Studio({ initialAccounts = [] }: { initialAccounts?: Acct[] }) {
  const [accounts, setAccounts] = useState<Acct[]>(initialAccounts);
  const [act, setAct] = useState(initialAccounts[0]?.id ?? "");

  const [value, setValue] = useState<CreativeFieldsValue>(emptyCreativeValue());
  const [name, setName] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Load accounts if not prefetched.
  useEffect(() => {
    if (accounts.length) return;
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((a) => { if (Array.isArray(a) && a.length) { setAccounts(a); setAct((cur) => cur || a[0].id); } })
      .catch(() => {});
  }, [accounts.length]);

  function patch(p: Partial<CreativeFieldsValue>) {
    setValue((v) => ({ ...v, ...p }));
    setSavedNote(null);
  }

  function applyTemplate(t: StudioTemplate) {
    setValue((v) => ({
      ...v,
      mode: "upload",
      message: t.copy.message,
      headline: t.copy.headline,
      description: t.copy.description ?? "",
      cta: t.copy.cta,
    }));
    setSavedNote(null);
  }

  function blank() {
    setValue(emptyCreativeValue());
    setName("");
    setPreviewUrl(null);
    setEditingId(null);
    setSavedNote(null);
  }

  function editDraft(d: StudioDraft) {
    setValue(valueFromCreative(d.creative));
    setName(d.name);
    setPreviewUrl(d.preview?.thumbUrl ?? null);
    setEditingId(d.id);
    setSavedNote(null);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save() {
    const creative = buildCreativeFromValue(value);
    if (!creative || !name.trim() || !act) return;
    setSaving(true);
    setSavedNote(null);
    try {
      const preview = {
        headline: value.mode === "upload" ? value.headline : undefined,
        message: value.mode === "upload" ? value.message : undefined,
      };
      const r = await fetch("/api/creative-studio/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId ?? undefined,
          accountId: act,
          name: name.trim(),
          creative,
          preview,
        }),
      });
      const d = await r.json();
      if (d.error) { setSavedNote(`บันทึกไม่สำเร็จ: ${d.error}`); return; }
      setEditingId(d.data?.id ?? editingId);
      setSavedNote("บันทึกแล้ว ✓");
      setReloadKey((k) => k + 1);
    } catch (e) {
      setSavedNote(`บันทึกไม่สำเร็จ: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen px-6 py-6" style={{ background: "#050810" }}>
      {/* header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <div className="text-[20px] font-bold text-[#e8eaf5]">Creative Studio</div>
          <div className="text-[12px] text-[#3a4a6a]">สร้าง Creative จากเทมเพลต บันทึกฉบับร่าง แล้วเผยแพร่ขึ้น Facebook</div>
        </div>
        <select value={act} onChange={(e) => setAct(e.target.value)} style={selectStyle}>
          {accounts.length === 0 && <option value="">กำลังโหลดบัญชี…</option>}
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>

      {/* 3-pane */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="grid gap-5 grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)_340px]"
      >
        {/* left: templates + drafts */}
        <div className="space-y-5">
          <TemplateGallery onApply={applyTemplate} onBlank={blank} />
          <DraftsList act={act} reloadKey={reloadKey} onEdit={editDraft} />
        </div>

        {/* center: builder */}
        <CreativeBuilder
          act={act}
          value={value}
          onChange={patch}
          name={name}
          onNameChange={(v) => { setName(v); setSavedNote(null); }}
          onPreviewFile={(url) => setPreviewUrl(url)}
          onSave={save}
          saving={saving}
          savedNote={savedNote}
          editing={!!editingId}
        />

        {/* right: preview + reference */}
        <div className="space-y-5">
          <div className="rounded-xl p-4" style={{ background: "#0a0e1a", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="text-[12px] font-semibold text-[#e8eaf5] mb-3">ตัวอย่างโฆษณา</div>
            <AdPreview value={value} previewUrl={previewUrl} />
          </div>
          <TopPerformers act={act} />
        </div>
      </motion.div>
    </div>
  );
}
