"use client";
import { useEffect, useRef, useState } from "react";
import type { CampaignDraft } from "@/lib/ads-create/chain";

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

const COUNTRIES = [
  { code: "US", name: "United States" }, { code: "TH", name: "Thailand" },
  { code: "GB", name: "United Kingdom" }, { code: "AU", name: "Australia" },
  { code: "SG", name: "Singapore" }, { code: "JP", name: "Japan" },
  { code: "IN", name: "India" }, { code: "ID", name: "Indonesia" },
  { code: "PH", name: "Philippines" }, { code: "MY", name: "Malaysia" },
];

export default function TargetingStep(props: {
  act: string;
  draft: Partial<CampaignDraft>;
  patch: (p: Partial<CampaignDraft>) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const { act, draft, patch, onNext, onBack } = props;
  const targeting = (draft.targeting ?? {}) as Record<string, unknown>;

  const [interestQ, setInterestQ] = useState("");
  const [interestResults, setInterestResults] = useState<{ id: string; name: string }[]>([]);
  const [selectedInterests, setSelectedInterests] = useState<{ id: string; name: string }[]>([]);
  const [audiences, setAudiences] = useState<{ id: string; name: string; type: string }[]>([]);
  const [selectedAudiences, setSelectedAudiences] = useState<{ id: string; name: string }[]>([]);
  const [reach, setReach] = useState<{ users_lower_bound: number; users_upper_bound: number } | null>(null);
  const [reachLoading, setReachLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const geoLoc = targeting?.geo_locations as { countries?: string[] } | undefined;
  const countries: string[] = geoLoc?.countries ?? ["US"];
  const ageMin: number = (targeting?.age_min as number) ?? 18;
  const ageMax: number = (targeting?.age_max as number) ?? 65;
  const genders: number[] = (targeting?.genders as number[]) ?? [];

  useEffect(() => {
    if (act) {
      fetch(`/api/ads-create/pickers?kind=audiences&act=${act}`)
        .then((r) => r.json())
        .then((d) => setAudiences(d.data ?? []))
        .catch(() => {});
    }
  }, [act]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (!interestQ.trim()) {
        setInterestResults([]);
        return;
      }
      fetch(`/api/ads-create/targeting-search?q=${encodeURIComponent(interestQ)}&type=adinterest`)
        .then((r) => r.json())
        .then((d) => setInterestResults(d.data ?? []))
        .catch(() => {});
    }, 100);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [interestQ]);

  function buildTargeting() {
    const t: Record<string, unknown> = {
      geo_locations: { countries },
      age_min: ageMin,
      age_max: ageMax,
    };
    if (genders.length > 0) t.genders = genders;
    if (selectedInterests.length > 0) t.flexible_spec = [{ interests: selectedInterests.map((i) => ({ id: i.id, name: i.name })) }];
    if (selectedAudiences.length > 0) t.custom_audiences = selectedAudiences.map((a) => ({ id: a.id }));
    return t;
  }

  async function fetchReach() {
    const t = buildTargeting();
    setReachLoading(true);
    try {
      const r = await fetch("/api/ads-create/targeting-search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ act, targeting: t, optimizationGoal: draft.optimizationGoal ?? "LINK_CLICKS" }),
      });
      const d = await r.json();
      setReach(d.data ?? null);
    } catch {
      setReach(null);
    } finally {
      setReachLoading(false);
    }
  }

  function updateCountry(code: string, checked: boolean) {
    const next = checked ? [...countries, code] : countries.filter((c: string) => c !== code);
    const t = { ...targeting, geo_locations: { countries: next } };
    patch({ targeting: t });
  }

  function commitTargeting() {
    patch({ targeting: buildTargeting() });
  }

  const addInterest = (i: { id: string; name: string }) => {
    if (!selectedInterests.find((x) => x.id === i.id)) {
      setSelectedInterests((prev) => [...prev, i]);
    }
    setInterestQ("");
    setInterestResults([]);
  };

  const removeInterest = (id: string) => setSelectedInterests((prev) => prev.filter((x) => x.id !== id));

  const toggleAudience = (a: { id: string; name: string }) => {
    setSelectedAudiences((prev) =>
      prev.find((x) => x.id === a.id) ? prev.filter((x) => x.id !== a.id) : [...prev, a]
    );
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl p-5 space-y-4" style={{ background: "#0a0e1a", border: "1px solid rgba(255,255,255,0.07)" }}>
        <Field label="ประเทศ">
          <div className="flex flex-wrap gap-2">
            {COUNTRIES.map((c) => {
              const checked = countries.includes(c.code);
              return (
                <button
                  key={c.code}
                  onClick={() => updateCountry(c.code, !checked)}
                  className="px-3 py-1 rounded-lg text-[12px] font-medium"
                  style={{
                    background: checked ? "rgba(49,196,141,0.18)" : "rgba(255,255,255,0.04)",
                    border: checked ? "1px solid rgba(49,196,141,0.4)" : "1px solid rgba(255,255,255,0.07)",
                    color: checked ? "#31c48d" : "#6a7a9a",
                  }}
                >
                  {c.name}
                </button>
              );
            })}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="อายุต่ำสุด">
            <input
              type="number" min={13} max={65}
              value={ageMin}
              onChange={(e) => patch({ targeting: { ...targeting, age_min: Number(e.target.value) } })}
              style={inputStyle}
            />
          </Field>
          <Field label="อายุสูงสุด">
            <input
              type="number" min={13} max={65}
              value={ageMax}
              onChange={(e) => patch({ targeting: { ...targeting, age_max: Number(e.target.value) } })}
              style={inputStyle}
            />
          </Field>
        </div>

        <Field label="เพศ">
          <div className="flex gap-3">
            {[{ v: [] as number[], label: "ทั้งหมด" }, { v: [1], label: "ชาย" }, { v: [2], label: "หญิง" }].map((g) => {
              const active = JSON.stringify(genders) === JSON.stringify(g.v);
              return (
                <button key={g.label} onClick={() => patch({ targeting: { ...targeting, genders: g.v } })}
                  className="px-3 py-1.5 rounded-lg text-[12px] font-medium"
                  style={{
                    background: active ? "rgba(91,108,255,0.18)" : "rgba(255,255,255,0.04)",
                    border: active ? "1px solid rgba(91,108,255,0.4)" : "1px solid rgba(255,255,255,0.07)",
                    color: active ? "#8a9aff" : "#6a7a9a",
                  }}>
                  {g.label}
                </button>
              );
            })}
          </div>
        </Field>
      </div>

      <div className="rounded-xl p-5 space-y-3" style={{ background: "#0a0e1a", border: "1px solid rgba(255,255,255,0.07)" }}>
        <div className="text-[11px] uppercase tracking-wide text-[#3a4a6a] font-semibold">การกำหนดเป้าหมายแบบละเอียด</div>
        <div className="relative">
          <input
            value={interestQ}
            onChange={(e) => setInterestQ(e.target.value)}
            placeholder="ค้นหาความสนใจ พฤติกรรม…"
            style={inputStyle}
          />
          {interestResults.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 rounded-xl overflow-hidden z-10" style={{ background: "#0f1420", border: "1px solid rgba(255,255,255,0.1)" }}>
              {interestResults.slice(0, 8).map((r) => (
                <button key={r.id} onClick={() => addInterest(r)}
                  className="block w-full text-left px-3 py-2 text-[12px] hover:bg-white/5 transition-colors"
                  style={{ color: "#c8d0e0" }}>
                  {r.name}
                </button>
              ))}
            </div>
          )}
        </div>
        {selectedInterests.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {selectedInterests.map((i) => (
              <span key={i.id} className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px]"
                style={{ background: "rgba(91,108,255,0.15)", color: "#8a9aff", border: "1px solid rgba(91,108,255,0.3)" }}>
                {i.name}
                <button onClick={() => removeInterest(i.id)} style={{ color: "#5b6cff", marginLeft: 2 }}>✕</button>
              </span>
            ))}
          </div>
        )}
      </div>

      {audiences.length > 0 && (
        <div className="rounded-xl p-5 space-y-3" style={{ background: "#0a0e1a", border: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="text-[11px] uppercase tracking-wide text-[#3a4a6a] font-semibold">Custom Audience</div>
          <div className="flex flex-wrap gap-2">
            {audiences.slice(0, 20).map((a) => {
              const active = !!selectedAudiences.find((x) => x.id === a.id);
              return (
                <button key={a.id} onClick={() => toggleAudience(a)}
                  className="px-3 py-1 rounded-lg text-[12px]"
                  style={{
                    background: active ? "rgba(167,139,250,0.18)" : "rgba(255,255,255,0.04)",
                    border: active ? "1px solid rgba(167,139,250,0.4)" : "1px solid rgba(255,255,255,0.07)",
                    color: active ? "#a78bfa" : "#6a7a9a",
                  }}>
                  {a.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Reach estimate */}
      <div className="rounded-xl p-5" style={{ background: "#0a0e1a", border: "1px solid rgba(255,255,255,0.07)" }}>
        <div className="flex items-center justify-between">
          <div className="text-[11px] uppercase tracking-wide text-[#3a4a6a] font-semibold">ประมาณการเข้าถึง</div>
          <button onClick={() => { commitTargeting(); fetchReach(); }}
            disabled={reachLoading}
            className="px-3 py-1 rounded-lg text-[11px] font-medium"
            style={{ background: "rgba(49,196,141,0.12)", color: "#31c48d", border: "1px solid rgba(49,196,141,0.25)" }}>
            {reachLoading ? "กำลังโหลด…" : "ประมาณ"}
          </button>
        </div>
        {reach && (
          <div className="mt-3 text-[13px]" style={{ color: "#e8eaf5" }}>
            {reach.users_lower_bound.toLocaleString()} – {reach.users_upper_bound.toLocaleString()} คน
          </div>
        )}
        {!reach && !reachLoading && (
          <div className="mt-2 text-[11px] text-[#3a4a6a]">กด "ประมาณ" หลังตั้งค่ากลุ่มเป้าหมายแล้ว</div>
        )}
      </div>

      <div className="flex justify-between">
        <button onClick={onBack} className="px-4 py-2.5 rounded-xl text-[13px]" style={{ background: "rgba(255,255,255,0.04)", color: "#8a9aba" }}>
          ← ย้อนกลับ
        </button>
        <button
          onClick={() => { commitTargeting(); onNext(); }}
          className="px-5 py-2.5 rounded-xl text-[13px] font-semibold"
          style={{ background: "linear-gradient(135deg,#5b6cff,#a78bfa)", color: "#fff" }}
        >
          ถัดไป: Creative →
        </button>
      </div>
    </div>
  );
}
