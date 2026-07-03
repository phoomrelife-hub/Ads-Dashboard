"use client";
import {
  CreativeFields,
  buildCreativeFromValue,
  Field,
  inputStyle,
  type CreativeFieldsValue,
} from "@/components/ads-create/creative-fields";

export function CreativeBuilder({
  act,
  value,
  onChange,
  name,
  onNameChange,
  onPreviewFile,
  onSave,
  saving,
  savedNote,
  editing,
}: {
  act: string;
  value: CreativeFieldsValue;
  onChange: (patch: Partial<CreativeFieldsValue>) => void;
  name: string;
  onNameChange: (v: string) => void;
  onPreviewFile: (url: string | null, fileName: string | null) => void;
  onSave: () => void;
  saving: boolean;
  savedNote: string | null;
  editing: boolean;
}) {
  const canSave = !!name.trim() && !!buildCreativeFromValue(value) && !saving;

  return (
    <div className="space-y-5">
      <div className="rounded-xl p-5" style={{ background: "#0a0e1a", border: "1px solid rgba(255,255,255,0.07)" }}>
        <Field label="ชื่อฉบับร่าง">
          <input
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="เช่น โปรเดือนนี้ – รูปคู่"
            style={inputStyle}
          />
        </Field>
      </div>

      <CreativeFields act={act} value={value} onChange={onChange} onPreviewFile={onPreviewFile} />

      <div className="flex items-center gap-3">
        <button
          disabled={!canSave}
          onClick={onSave}
          className="px-5 py-2.5 rounded-xl text-[13px] font-semibold"
          style={{
            background: canSave ? "linear-gradient(135deg,#5b6cff,#a78bfa)" : "rgba(255,255,255,0.06)",
            color: canSave ? "#fff" : "#3a4a6a",
          }}
        >
          {saving ? "กำลังบันทึก…" : editing ? "อัปเดตฉบับร่าง" : "บันทึกฉบับร่าง"}
        </button>
        {savedNote && <span className="text-[12px]" style={{ color: "#31c48d" }}>{savedNote}</span>}
      </div>
    </div>
  );
}
