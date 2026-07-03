// Hover-prefetch: warms the server-side FB response cache before the user navigates.
// The server's respCache (lib/fb.ts) is the real cache — hitting an API route a few
// hundred ms before navigation means the page's own fetch returns from cache (<10ms)
// instead of waiting for a fresh FB round-trip (1-3s).
//
// Rate-limit safety: no extra FB calls. The same requests pages fire on mount happen
// here instead — just earlier. `fired` prevents duplicate warming within the session.

const fired = new Set<string>();

// Each entry: route href → function that returns the API URLs to warm for that page.
// Only routes that hit the FB API need warming; Supabase-only pages (agents, ads-auto,
// briefing) are fast enough without prefetching.
const ROUTES: Record<string, (id: string) => string[]> = {
  "/": (id) => [
    `/api/insights?act=${id}&level=campaign&preset=last_30d`,
    `/api/pages?act=${id}`,
  ],
  "/report-ads": (id) => [
    `/api/report-ads?act=${id}&preset=last_30d`,
    `/api/account-breakdown?preset=last_30d`,
  ],
  "/audience-insight": (id) => [
    `/api/breakdown?act=${id}&dim=gender&preset=last_30d`,
    `/api/breakdown?act=${id}&dim=age&preset=last_30d`,
    `/api/breakdown?act=${id}&dim=region&preset=last_30d`,
  ],
  "/creative-performance": (id) => [
    `/api/creative-timeline?act=${id}&preset=last_30d`,
  ],
};

export function prefetchRoute(href: string, actId: string) {
  if (!actId || actId === "all") return;
  const buildUrls = ROUTES[href];
  if (!buildUrls) return;
  for (const url of buildUrls(actId)) {
    if (fired.has(url)) continue;
    fired.add(url);
    fetch(url).catch(() => {});
  }
}

// Fire all routes at once. Called from ads-layout after the first account is known.
// Runs 3s after mount so it doesn't compete with the current page's critical fetches.
export function prefetchAll(actId: string) {
  if (!actId || actId === "all") return;
  for (const href of Object.keys(ROUTES)) {
    prefetchRoute(href, actId);
  }
}
