import { LeadsInbox } from "@/components/leads/leads-inbox";
import { getAccounts } from "@/lib/fb";

// Server Component: pre-fetch the account list so the client mounts already knowing
// which account to show — mirrors app/page.tsx pattern.
export const dynamic = "force-dynamic";

export default async function Page() {
  let initialAccounts: { id: string; name: string; active: boolean }[] = [];
  try {
    initialAccounts = await getAccounts();
  } catch {
    // Server fetch failed — client will fetch accounts itself on mount
  }
  return <LeadsInbox initialAccounts={initialAccounts} />;
}
