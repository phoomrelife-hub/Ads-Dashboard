// Shared write-action executor for Pixel Agents.
// Used by /api/agents/act (user-confirmed) and the cron engine (rule-driven).
import { fbPost, getLevel, getAccounts } from "@/lib/fb";
import type { Agent } from "./types";

export const ALL_ACCOUNTS = "all";

// Verify the id appears among one account's campaigns/adsets/ads.
export async function idBelongsToAccount(accountId: string, id: string): Promise<boolean> {
  for (const level of ["campaign", "adset", "ad"] as const) {
    try {
      const { rows } = await getLevel(accountId, level, "last_30d");
      if (rows.some((r) => String(r.id) === id)) return true;
    } catch {
      /* try next level */
    }
  }
  return false;
}

// For "all accounts" agents — verify the id belongs to any account the token can see.
async function idBelongsToAnyAccount(id: string): Promise<boolean> {
  const accounts = await getAccounts();
  for (const a of accounts) if (await idBelongsToAccount(a.id, id)) return true;
  return false;
}

// Low-level apply with NO guardrail — only call when the account is already trusted.
export async function rawApply(tool: string, args: Record<string, any>): Promise<unknown> {
  if (tool === "navigate") return { navigate: args };
  if (tool === "set_status") {
    const status = args.status === "ACTIVE" ? "ACTIVE" : "PAUSED";
    await fbPost(`/${args.id}`, { status });
    return { id: args.id, status };
  }
  if (tool === "set_budget") {
    const cents = Math.round(Number(args.dailyBudget) * 100);
    await fbPost(`/${args.id}`, { daily_budget: String(cents) });
    return { id: args.id, dailyBudget: args.dailyBudget };
  }
  throw new Error(`unknown tool: ${tool}`);
}

// Guarded executor: confirms the target belongs to the agent's scope, then applies.
export async function executeAction(agent: Agent, tool: string, args: Record<string, any>): Promise<unknown> {
  if (tool === "navigate") return { navigate: args };
  const accountId = agent.scope.accountId;
  if (!accountId) throw new Error("agent has no scoped account");

  const ok = accountId === ALL_ACCOUNTS
    ? await idBelongsToAnyAccount(String(args.id))
    : await idBelongsToAccount(accountId, String(args.id));
  if (!ok) throw new Error(`id ${args.id} is not in this agent's scope (${accountId})`);

  return rawApply(tool, args);
}
