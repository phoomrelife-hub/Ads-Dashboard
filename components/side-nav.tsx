"use client";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { prefetchRoute } from "@/lib/prefetch-client";

const NAV_ITEMS = [
  {
    group: "โฆษณา",
    items: [
      { href: "/agents", label: "เอเจนต์", icon: IconRobot, color: "#5b6cff" },
      { href: "/briefing", label: "รายงานประจำวัน", icon: IconSun, color: "#f5b14c" },
      { href: "/audience-insight", label: "วิเคราะห์กลุ่มเป้าหมาย", icon: IconUsers, color: "#22d3ee" },
      { href: "/", label: "จัดการโฆษณา", icon: IconGrid, color: "#31c48d" },
      { href: "/creative-performance", label: "ประสิทธิภาพ Creative", icon: IconPalette, color: "#f5b14c" },
      { href: "/report-ads", label: "รายงานโฆษณา", icon: IconChart, color: "#5b6cff" },
      { href: "/ads-auto", label: "โฆษณาอัตโนมัติ", icon: IconZap, color: "#ff6b6b" },
      { href: "/create-campaign", label: "สร้างแคมเปญ", icon: IconRocket, color: "#22d3ee" },
      { href: "/creative-studio", label: "Creative Studio", icon: IconBrush, color: "#a78bfa" },
    ],
  },
  {
    group: "ระบบ",
    items: [
      { href: "/settings", label: "ตั้งค่า", icon: IconSettings, color: "#8a9aba" },
    ],
  },
];

export function SideNav({ collapsed, onToggle, firstActId = "" }: { collapsed: boolean; onToggle: () => void; firstActId?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const w = collapsed ? 60 : 224;

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <motion.nav
      animate={{ width: w }}
      transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
      className="fixed left-0 top-0 h-screen z-40 flex flex-col overflow-hidden"
      style={{
        background: "linear-gradient(180deg, #06080f 0%, #040610 100%)",
        borderRight: "1px solid rgba(255,255,255,0.06)",
        width: w,
      }}
    >
      {/* logo area */}
      <div className="flex items-center gap-3 px-4 py-4 flex-shrink-0" style={{ height: 57, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, #5b6cff, #a78bfa)" }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="1" y="1" width="5" height="5" rx="1.5" fill="white" />
            <rect x="8" y="1" width="5" height="5" rx="1.5" fill="white" opacity="0.6" />
            <rect x="1" y="8" width="5" height="5" rx="1.5" fill="white" opacity="0.6" />
            <rect x="8" y="8" width="5" height="5" rx="1.5" fill="white" />
          </svg>
        </div>
        <AnimatePresence>
          {!collapsed && (
            <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.15 }}>
              <div className="font-bold text-[13px] text-[#e8eaf5] whitespace-nowrap leading-none">Relife Ads</div>
              <div className="text-[10px] text-[#3a4a6a] mt-0.5 whitespace-nowrap">โมดูลโฆษณา</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* nav items */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-2">
        {NAV_ITEMS.map(group => (
          <div key={group.group}>
            <AnimatePresence>
              {!collapsed && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.1 }}
                  className="text-[10px] uppercase tracking-[0.1em] text-[#2a3a5a] font-semibold px-2 pt-2 pb-1.5 whitespace-nowrap">
                  {group.group}
                </motion.div>
              )}
            </AnimatePresence>
            {group.items.map(item => {
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <NavItem key={item.href} {...item} active={active} collapsed={collapsed} firstActId={firstActId} />
              );
            })}
          </div>
        ))}
      </div>

      {/* collapse toggle */}
      <div className="flex-shrink-0 px-2 pb-4">
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 12 }}>
          <button onClick={logout}
            className="w-full flex items-center gap-3 px-2.5 py-2 rounded-lg transition-colors cursor-pointer group mb-1"
            style={{ color: "#3a4a6a" }}
            onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
            <div className="flex-shrink-0 w-4 h-4"><IconLogout /></div>
            <AnimatePresence>
              {!collapsed && (
                <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="text-[12px] whitespace-nowrap">ออกจากระบบ</motion.span>
              )}
            </AnimatePresence>
          </button>
          <button onClick={onToggle}
            className="w-full flex items-center gap-3 px-2.5 py-2 rounded-lg transition-colors cursor-pointer group"
            style={{ color: "#3a4a6a" }}
            onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
            <motion.div animate={{ rotate: collapsed ? 180 : 0 }} transition={{ duration: 0.22 }} className="flex-shrink-0">
              <IconChevron />
            </motion.div>
            <AnimatePresence>
              {!collapsed && (
                <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="text-[12px] whitespace-nowrap">ย่อเมนู</motion.span>
              )}
            </AnimatePresence>
          </button>
        </div>
      </div>
    </motion.nav>
  );
}

function NavItem({ href, label, icon: Icon, color, active, collapsed, firstActId }: {
  href: string; label: string; icon: React.FC; color: string; active: boolean; collapsed: boolean; firstActId: string;
}) {
  return (
    <Link href={href} className="block mb-0.5">
      <div className="relative flex items-center gap-3 px-2.5 py-2 rounded-lg transition-all cursor-pointer"
        style={{
          background: active ? `${color}12` : "transparent",
          color: active ? color : "#4a5a7a",
        }}
        onMouseEnter={e => {
          if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.04)";
          e.currentTarget.style.color = active ? color : "#8a9aba";
          if (!active && firstActId) prefetchRoute(href, firstActId);
        }}
        onMouseLeave={e => { e.currentTarget.style.background = active ? `${color}12` : "transparent"; e.currentTarget.style.color = active ? color : "#4a5a7a"; }}>

        {/* active left bar */}
        {active && (
          <motion.div layoutId="active-bar"
            className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-full"
            style={{ background: color }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }} />
        )}

        {/* icon */}
        <div className="flex-shrink-0 w-4 h-4">
          <Icon />
        </div>

        {/* label */}
        <AnimatePresence>
          {!collapsed && (
            <motion.span initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -6 }}
              transition={{ duration: 0.15 }}
              className="text-[13px] font-medium whitespace-nowrap truncate">
              {label}
            </motion.span>
          )}
        </AnimatePresence>

        {/* tooltip when collapsed */}
        {collapsed && (
          <div className="absolute left-full ml-3 px-2.5 py-1.5 rounded-lg text-[12px] font-medium whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 z-50"
            style={{ background: "#0f1424", border: "1px solid rgba(255,255,255,0.1)", color: "#e8eaf5", boxShadow: "0 4px 20px rgba(0,0,0,0.5)" }}>
            {label}
          </div>
        )}
      </div>
    </Link>
  );
}

/* ── inline SVG icons ── */
function IconRobot() {
  return <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <rect x="3" y="5" width="10" height="8" rx="2" /><path d="M8 5V2.5" /><circle cx="8" cy="2" r="0.8" fill="currentColor" stroke="none" />
    <circle cx="6" cy="9" r="1" fill="currentColor" stroke="none" /><circle cx="10" cy="9" r="1" fill="currentColor" stroke="none" />
    <path d="M1.5 8v2M14.5 8v2" />
  </svg>;
}
function IconSun() {
  return <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <circle cx="8" cy="8" r="3" /><path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3 3l1 1M12 12l1 1M13 3l-1 1M4 12l-1 1" />
  </svg>;
}
function IconGrid() {
  return <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
    <rect x="1" y="1" width="6" height="6" rx="1.5" /><rect x="9" y="1" width="6" height="6" rx="1.5" />
    <rect x="1" y="9" width="6" height="6" rx="1.5" /><rect x="9" y="9" width="6" height="6" rx="1.5" />
  </svg>;
}
function IconPalette() {
  return <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <path d="M8 1a7 7 0 1 0 4 12.7" /><circle cx="5" cy="6" r="1" fill="currentColor" stroke="none" />
    <circle cx="9" cy="4" r="1" fill="currentColor" stroke="none" /><circle cx="11" cy="8" r="1" fill="currentColor" stroke="none" />
    <path d="M11.5 11a2.5 2.5 0 0 1 2.5 2.5 1.5 1.5 0 0 1-3 0v-1a1 1 0 0 0-1-1h-1" />
  </svg>;
}
function IconChart() {
  return <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <line x1="1" y1="14" x2="15" y2="14" /><rect x="2" y="8" width="2.5" height="6" rx="0.5" />
    <rect x="6.75" y="5" width="2.5" height="9" rx="0.5" /><rect x="11.5" y="2" width="2.5" height="12" rx="0.5" />
  </svg>;
}
function IconZap() {
  return <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
    <path d="M9.5 1L2 9.5h5.5L6 15l8.5-9H9L9.5 1z" />
  </svg>;
}
function IconRocket() {
  return <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <path d="M6 10c-1.5 0-3 .5-3.5 3 2.5-.5 3-2 3-3z" /><path d="M6 10l-1.5-1.5M6 10c0-3 1.5-6.5 5.5-8.5C13 4 11 7.5 8 8" />
    <path d="M8 8L6.5 6.5" /><circle cx="9.5" cy="4.5" r="1" fill="currentColor" stroke="none" />
  </svg>;
}
function IconBrush() {
  return <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <path d="M12 2l2 2-7 7-3 1 1-3 7-7z" /><path d="M3.5 12.5C3.5 12.5 2 13 2 14.5S3 16 4 15.5s1-2 1-2" />
  </svg>;
}
function IconSettings() {
  return <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <circle cx="8" cy="8" r="2.2" />
    <path d="M8 1v1.6M8 13.4V15M1 8h1.6M13.4 8H15M3.1 3.1l1.1 1.1M11.8 11.8l1.1 1.1M3.1 12.9l1.1-1.1M11.8 4.2l1.1-1.1" />
  </svg>;
}
function IconUsers() {
  return <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <circle cx="6" cy="5" r="2.5" />
    <path d="M1 13c0-2.5 2-4 5-4s5 1.5 5 4" />
    <path d="M11 2.5a2.5 2.5 0 0 1 0 5M15 13c0-2.2-1.5-3.5-4-3.8" />
  </svg>;
}
function IconLogout() {
  return <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <path d="M6 14H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h3" /><path d="M11 11l3-3-3-3" /><path d="M14 8H6" />
  </svg>;
}
function IconChevron() {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <path d="M10 4L6 8l4 4" />
  </svg>;
}
