"use client";
import type { CreativeFieldsValue } from "@/components/ads-create/creative-fields";

// Facebook feed-card mockup of the current draft. Best-effort: for uploads we show
// the local object URL; for existing post/creative modes we show a placeholder
// (their real asset lives on FB and isn't fetched here).

function hostFromUrl(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

const CTA_LABEL: Record<string, string> = {
  LEARN_MORE: "ดูเพิ่มเติม",
  SHOP_NOW: "ซื้อเลย",
  SIGN_UP: "ลงทะเบียน",
  BOOK_NOW: "จองเลย",
  CONTACT_US: "ติดต่อเรา",
  APPLY_NOW: "สมัครเลย",
  DOWNLOAD: "ดาวน์โหลด",
  GET_OFFER: "รับข้อเสนอ",
  SUBSCRIBE: "ติดตาม",
  WATCH_MORE: "ดูเพิ่ม",
};

export function AdPreview({
  value,
  previewUrl,
  pageName,
}: {
  value: CreativeFieldsValue;
  previewUrl: string | null;
  pageName?: string;
}) {
  const isUpload = value.mode === "upload";
  const headline = isUpload ? value.headline : "(จากโพสต์/Creative ที่มีอยู่)";
  const description = isUpload ? value.description : "";
  const message = isUpload ? value.message : "ตัวอย่างจะแสดงเมื่อเผยแพร่บน Facebook";
  const link = isUpload ? value.link : "";
  const cta = CTA_LABEL[value.cta] ?? "ดูเพิ่มเติม";
  const name = pageName || "เพจของคุณ";

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "#fff", border: "1px solid rgba(255,255,255,0.1)", maxWidth: 360 }}>
      {/* header */}
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <div className="w-9 h-9 rounded-full flex-shrink-0" style={{ background: "linear-gradient(135deg,#5b6cff,#a78bfa)" }} />
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-[#050505] truncate">{name}</div>
          <div className="text-[11px] text-[#65676b]">ได้รับการสนับสนุน · 🌐</div>
        </div>
      </div>

      {/* primary text */}
      {message && (
        <div className="px-3 pb-2.5 text-[13px] text-[#050505] whitespace-pre-wrap break-words">{message}</div>
      )}

      {/* media */}
      <div className="w-full bg-[#e4e6eb] flex items-center justify-center" style={{ aspectRatio: "1.91 / 1" }}>
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="creative preview" className="w-full h-full object-cover" />
        ) : (
          <div className="text-[12px] text-[#8a8d91] text-center px-4">
            {isUpload ? "อัปโหลดรูปภาพเพื่อดูตัวอย่าง" : "ตัวอย่างสื่อจะมาจาก Facebook"}
          </div>
        )}
      </div>

      {/* link card footer */}
      <div className="flex items-center gap-2 px-3 py-2.5" style={{ background: "#f0f2f5" }}>
        <div className="min-w-0 flex-1">
          {link && <div className="text-[11px] uppercase text-[#65676b] truncate">{hostFromUrl(link)}</div>}
          <div className="text-[13px] font-semibold text-[#050505] truncate">{headline || "หัวข้อโฆษณา"}</div>
          {description && <div className="text-[12px] text-[#65676b] truncate">{description}</div>}
        </div>
        <button className="text-[12px] font-semibold px-3 py-1.5 rounded-md flex-shrink-0" style={{ background: "#e4e6eb", color: "#050505" }}>
          {cta}
        </button>
      </div>
    </div>
  );
}
