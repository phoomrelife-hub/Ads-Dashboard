export default function CreativeStudioPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: "#050810" }}>
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-2"
        style={{ background: "rgba(167,139,250,0.12)", border: "1px solid rgba(167,139,250,0.25)" }}>
        <svg width="24" height="24" viewBox="0 0 16 16" fill="none" stroke="#a78bfa" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2l2 2-7 7-3 1 1-3 7-7z"/>
          <path d="M3.5 12.5C3.5 12.5 2 13 2 14.5S3 16 4 15.5s1-2 1-2"/>
        </svg>
      </div>
      <div className="text-[18px] font-bold text-[#e8eaf5]">Creative Studio</div>
      <div className="text-[13px] text-[#3a4a6a]">เร็ว ๆ นี้ — เครื่องมือสร้าง Creative & เทมเพลต</div>
    </div>
  );
}
