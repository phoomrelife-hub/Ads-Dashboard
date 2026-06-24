// Instant loading skeleton for the home dashboard (จัดการโฆษณา).
//
// The page is a dynamic Server Component that awaits getAccounts() (a Facebook
// Graph call) before rendering. Without this file the App Router holds the
// previous page on screen for the whole 5–10s fetch. A segment-level loading.tsx
// gives Next an automatic Suspense boundary, so the skeleton paints immediately
// on click and the real dashboard streams in when the server fetch resolves.
//
// The shell mirrors components/dashboard.tsx (top bar + page header + cards +
// table) so the transition into the live page is seamless.

function Box({ w, h, className = "" }: { w?: string; h?: string; className?: string }) {
  return <div className={`skeleton rounded ${className}`} style={{ width: w, height: h }} />;
}

export default function Loading() {
  return (
    <div style={{ background: "#060a12", minHeight: "100vh" }}>
      {/* ── Top Bar ── */}
      <div
        className="flex items-center justify-between gap-3 flex-wrap px-6 py-3 border-b border-white/[0.06] sticky top-0 z-30"
        style={{ background: "rgba(6,10,18,0.92)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}
      >
        {/* title */}
        <div className="flex items-center gap-2.5">
          <div className="w-2 h-2 rounded-full bg-[#31c48d] shadow-[0_0_10px_2px_rgba(49,196,141,0.5)]" />
          <span className="font-semibold text-[14px] text-[#e8eaf5] tracking-[-0.01em]">จัดการโฆษณา</span>
        </div>
        {/* controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <Box w="220px" h="38px" className="rounded-xl" />
          <Box w="120px" h="38px" className="rounded-xl" />
          <Box w="96px" h="38px" className="rounded-xl" />
        </div>
      </div>

      {/* ── Page content ── */}
      <div className="p-6">
        {/* page header */}
        <div className="mb-5">
          <h1 className="text-[17px] font-bold text-[#e8eaf5] tracking-[-0.02em] mb-1">ภาพรวมโฆษณา</h1>
          <p className="text-[#3d4f6a] text-[13px]">กำลังโหลดข้อมูล...</p>
        </div>

        {/* tabs */}
        <div className="flex gap-4 mb-5 pb-2.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Box key={i} w="64px" h="14px" />
          ))}
        </div>

        {/* summary cards */}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3.5 mb-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-2xl p-4 border border-white/[0.06]" style={{ background: "#0c1220" }}>
              <Box w="60px" h="11px" className="mb-3" />
              <Box w="90px" h="26px" />
            </div>
          ))}
        </div>

        {/* table panel */}
        <div className="rounded-2xl overflow-hidden" style={{ background: "#0c1220", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center gap-3 px-[18px] py-3.5 border-b border-white/[0.05]">
            <Box w="120px" h="13px" />
          </div>
          <div className="divide-y divide-white/[0.04]">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-[18px] py-3.5">
                <Box w="36px" h="20px" className="rounded-full flex-shrink-0" />
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Box w="44px" h="44px" className="rounded-lg flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <Box w={`${60 + (i % 4) * 10}%`} h="13px" className="mb-2" />
                    <Box w={`${30 + (i % 3) * 8}%`} h="10px" />
                  </div>
                </div>
                <Box w="60px" h="20px" className="rounded-full" />
                {Array.from({ length: 5 }).map((_, j) => (
                  <Box key={j} w="64px" h="13px" className="hidden sm:block" />
                ))}
              </div>
            ))}
          </div>
          <div className="flex items-center justify-end gap-3 px-[18px] py-3.5 border-t border-white/[0.05]">
            <Box w="80px" h="13px" />
            <Box w="88px" h="34px" className="rounded-lg" />
            <Box w="76px" h="34px" className="rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  );
}
