import { TrueRoasTable } from "@/components/true-roas/true-roas-table";
import { getAccounts } from "@/lib/fb";

// Server Component: pre-fetch the account list so the client mounts already knowing
// which account to query — mirrors app/page.tsx pattern.
export const dynamic = "force-dynamic";

export default async function TrueRoasPage() {
  let initialAccounts: { id: string; name: string; active: boolean }[] = [];
  try {
    initialAccounts = await getAccounts();
  } catch {
    // Fall back gracefully — the client component will show an empty state.
  }
  return <TrueRoasTable initialAccounts={initialAccounts} />;
}
