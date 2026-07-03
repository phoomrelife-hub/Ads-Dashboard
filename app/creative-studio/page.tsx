import { Studio } from "@/components/creative-studio/studio";
import { getAccounts } from "@/lib/fb";

// Server Component: pre-fetch the account list so the client mounts already knowing
// which account to show — mirrors app/leads/page.tsx.
export const dynamic = "force-dynamic";

export default async function CreativeStudioPage() {
  let initialAccounts: { id: string; name: string; active: boolean }[] = [];
  try {
    initialAccounts = await getAccounts();
  } catch {
    // Server fetch failed — client will fetch accounts itself on mount.
  }
  return <Studio initialAccounts={initialAccounts} />;
}
