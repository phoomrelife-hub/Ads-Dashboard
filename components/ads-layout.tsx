"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { SideNav } from "./side-nav";
import { prefetchAll } from "@/lib/prefetch-client";

export function AdsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [firstActId, setFirstActId] = useState("");
  const isLoginPage = pathname === "/login";

  useEffect(() => {
    if (isLoginPage) return;
    const saved = localStorage.getItem("sidenav-collapsed");
    if (saved !== null) setCollapsed(JSON.parse(saved));
    setMounted(true);

    // Resolve the default account for hover-prefetch (same logic all pages use).
    // /api/accounts is already cached server-side so this is essentially free.
    let hidden: string[] = [];
    try { hidden = JSON.parse(localStorage.getItem("adsHiddenAccounts") || "[]"); } catch {}
    fetch("/api/accounts")
      .then(r => r.json())
      .then((list: { id: string; name: string; active: boolean }[]) => {
        if (!Array.isArray(list) || !list.length) return;
        const pool = hidden.length ? list.filter(a => !hidden.includes(a.id)) : list;
        const visible = pool.length ? pool : list;
        const first = visible.find(a => a.active) ?? visible[0];
        if (first) {
          setFirstActId(first.id);
          // 3s delay: let the current page's critical fetches complete first,
          // then warm all other pages in the background
          setTimeout(() => prefetchAll(first.id), 3000);
        }
      })
      .catch(() => {});
  }, []);

  // Global automation ticker: fire any due rules every 60s while the dashboard
  // is open, on whatever page. (External cron still recommended for true 12am.)
  useEffect(() => {
    if (isLoginPage) return;
    const tick = () => fetch("/api/agents/cron/tick", { method: "POST" }).catch(() => {});
    const t = setInterval(tick, 60000);
    return () => clearInterval(t);
  }, [isLoginPage]);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("sidenav-collapsed", JSON.stringify(next));
  }

  if (isLoginPage) return <>{children}</>;

  const navW = collapsed ? 60 : 224;

  return (
    <>
      <SideNav collapsed={collapsed} onToggle={toggle} firstActId={firstActId} />
      <div
        style={{
          marginLeft: mounted ? navW : 224,
          transition: "margin-left 0.22s cubic-bezier(0.4,0,0.2,1)",
          minHeight: "100vh",
        }}
      >
        {children}
      </div>
    </>
  );
}
