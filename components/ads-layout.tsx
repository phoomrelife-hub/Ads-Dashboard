"use client";
import { useEffect, useState } from "react";
import { SideNav } from "./side-nav";

export function AdsLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("sidenav-collapsed");
    if (saved !== null) setCollapsed(JSON.parse(saved));
    setMounted(true);
  }, []);

  // Global automation ticker: fire any due rules every 60s while the dashboard
  // is open, on whatever page. (External cron still recommended for true 12am.)
  useEffect(() => {
    const tick = () => fetch("/api/agents/cron/tick", { method: "POST" }).catch(() => {});
    const t = setInterval(tick, 60000);
    return () => clearInterval(t);
  }, []);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("sidenav-collapsed", JSON.stringify(next));
  }

  const navW = collapsed ? 60 : 224;

  return (
    <>
      <SideNav collapsed={collapsed} onToggle={toggle} />
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
