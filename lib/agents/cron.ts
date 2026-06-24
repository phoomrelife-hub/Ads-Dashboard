// Cron engine for Pixel Agents automation rules.
// Evaluates due rules: structured conditions (via getLevel) and/or a natural-language
// instruction (via runAgentTurn). Honors per-rule dry-run. Writes outcomes to the log.
import { readStore, writeStore, appendLog, appendRuleRun } from "./store";
import { getLevel, getAccounts } from "@/lib/fb";
import { executeAction, rawApply } from "./actions";
import { runAgentTurn } from "./providers";
import type { Rule, RuleOp, RuleRunItem } from "./types";

function compare(a: number, op: RuleOp, b: number): boolean {
  switch (op) {
    case ">": return a > b;
    case ">=": return a >= b;
    case "<": return a < b;
    case "<=": return a <= b;
    case "==": return a === b;
  }
}

function mapAction(action: Rule["action"], id: string): { tool: string; args: Record<string, any>; label: string } {
  if (action.type === "activate") return { tool: "set_status", args: { id, status: "ACTIVE" }, label: "Activated" };
  if (action.type === "set_budget") return { tool: "set_budget", args: { id, dailyBudget: action.dailyBudget }, label: `Set budget ฿${action.dailyBudget}` };
  return { tool: "set_status", args: { id, status: "PAUSED" }, label: "Paused" };
}

export function isDue(rule: Rule, now: number): boolean {
  if (!rule.enabled) return false;
  if (rule.schedule.kind === "interval") {
    const ms = (rule.schedule.everyMinutes || 60) * 60000;
    return !rule.lastRunAt || now - rule.lastRunAt >= ms;
  }
  // daily at HH:MM (server local time)
  const [h, mn] = (rule.schedule.time || "00:00").split(":").map(Number);
  const target = new Date(now);
  target.setHours(h || 0, mn || 0, 0, 0);
  const tMs = target.getTime();
  return now >= tMs && (!rule.lastRunAt || rule.lastRunAt < tMs);
}

// Run a single rule by id. Returns a human-readable summary; records a structured run.
export async function runRule(ruleId: string, trigger: "schedule" | "manual" = "schedule"): Promise<string> {
  const store = readStore();
  const rule = store.rules.find((r) => r.id === ruleId);
  if (!rule) return "rule not found";
  // agent is OPTIONAL — only needed for the AI instruction. Structured rules
  // target an account directly and use the global Facebook token.
  const agent = rule.agentId ? store.agents.find((a) => a.id === rule.agentId) : undefined;
  const targetAccount = rule.accountId || agent?.scope.accountId || "";

  const items: RuleRunItem[] = [];
  try {
    // structured condition (iterate every account when the target is "all")
    if (rule.condition) {
      const { metric, op, value } = rule.condition;
      const accountIds = targetAccount === "all"
        ? (await getAccounts()).map((a: any) => a.id)
        : [targetAccount];
      let matched = false;
      for (const acct of accountIds) {
        const { rows } = await getLevel(acct, rule.level, rule.datePreset);
        const matches = rows.filter((r) => compare(Number(r[metric]) || 0, op, value));
        for (const m of matches) {
          matched = true;
          const mv = Number((Number(m[metric]) || 0).toFixed(2));
          const { tool, args, label } = mapAction(rule.action, String(m.id));
          const base = { entityId: String(m.id), entityName: String(m.name || m.id), level: rule.level, metric, value: mv, action: label };
          if (rule.dryRun) items.push({ ...base, status: "dry-run" });
          else {
            try { await rawApply(tool, args); items.push({ ...base, status: "applied" }); } // id trusted — from this account's rows
            catch (e: any) { items.push({ ...base, status: "error", note: e.message }); }
          }
        }
      }
      if (!matched) items.push({ entityName: `No ${rule.level}s matched ${metric} ${op} ${value}`, action: "check", status: "info" });
    }
    // natural-language instruction (needs an agent — it's the AI brain)
    if (rule.instruction) {
      if (!agent) {
        items.push({ entityName: "AI instruction skipped", action: "ai", status: "error", note: "no agent assigned" });
      } else {
        const { proposals } = await runAgentTurn(agent, [{ role: "user", content: rule.instruction }]);
        if (proposals.length === 0) items.push({ entityName: "AI reviewed — no action needed", action: "ai", status: "info" });
        for (const p of proposals) {
          const base = { entityId: String(p.args?.id || ""), entityName: p.summary, action: p.tool, note: p.summary };
          if (rule.dryRun) items.push({ ...base, status: "dry-run" });
          else {
            try { await executeAction(agent, p.tool, p.args); items.push({ ...base, status: "applied" }); }
            catch (e: any) { items.push({ entityName: p.summary, action: p.tool, status: "error", note: e.message }); }
          }
        }
      }
    }
  } catch (e: any) {
    items.push({ entityName: "Run error", action: "error", status: "error", note: e.message });
  }

  const acted = items.filter((i) => i.status === "applied" || i.status === "dry-run");
  const summary = acted.length
    ? acted.map((i) => `${i.status === "dry-run" ? "[dry] " : ""}${i.action} "${i.entityName}"${i.metric ? ` (${i.metric} ${i.value})` : ""}`).join(" · ")
    : (items[0]?.entityName || "nothing to do");

  appendRuleRun({ ruleId, ts: Date.now(), dryRun: rule.dryRun, account: targetAccount || "all", trigger, summary, items });
  appendLog(rule.agentId || "system", "rule", `[${rule.name}] ${summary}`);

  // stamp lastRun (re-read because appendLog wrote the store)
  const s2 = readStore();
  const r2 = s2.rules.find((r) => r.id === ruleId);
  if (r2) { r2.lastRunAt = Date.now(); r2.lastResult = summary.slice(0, 300); }
  writeStore(s2);

  return summary;
}

// Run all due rules (or a single rule when forceId is given, ignoring schedule).
export async function runDueRules(forceId?: string): Promise<{ id: string; name: string; summary: string }[]> {
  const store = readStore();
  const now = Date.now();
  const due = store.rules.filter((r) => (forceId ? r.id === forceId : isDue(r, now)));
  const out: { id: string; name: string; summary: string }[] = [];
  for (const r of due) {
    const summary = await runRule(r.id, forceId ? "manual" : "schedule");
    out.push({ id: r.id, name: r.name, summary });
  }
  return out;
}
