import { Dashboard } from "@/components/dashboard";
import { getAccounts } from "@/lib/fb";

// Server Component: pre-fetch the account list on the server so the client mounts
// already knowing which account to query. This removes the /api/accounts round-trip
// from the critical path — the first /api/insights fetch can fire on mount instead of
// waiting for accounts to resolve first (it was a serial client-side waterfall before).
export const dynamic = "force-dynamic";

export default async function Page() {
  let initialAccounts: { id: string; name: string; active: boolean }[] = [];
  try {
    initialAccounts = await getAccounts();
  } catch {
    // Server fetch failed (e.g. token/rate limit) — fall back to the client fetching
    // accounts itself, exactly as before. Never block the page from rendering.
  }
  return <Dashboard initialAccounts={initialAccounts} />;
}
