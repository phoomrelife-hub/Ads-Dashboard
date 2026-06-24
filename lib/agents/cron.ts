// Cron engine for Pixel Agents automation rules.
// Evaluates due rules: structured conditions (via getLevel) and/or a natural-language
// instruction (via runAgentTurn). Honors per-rule dry-run. Writes outcomes to the log.
import { getRules, getAgentWithKey, addLog, addRuleRun, saveRule } from "./store";
import { getLevel, getAccounts } from "@/lib/fb";
import { executeAction, rawApply } from "./actions";
import { runAgentTurn } from "./providers";
import type { RuleOp, RuleRunItem } from "./types";

function compare(a: number, op: RuleOp, b: number): boolean {
  switch (op) {
    case ">": return a > b;
    case ">=": return a >= b;
    case "<": return a < b;
    case "<=": return a <= b;
    case "==": return a === b;
  }
}

function mapAction(action: any, id: string): { tool: string; args: Record<string, any>; label: string } {
  if (action.type === "activate") return { tool: "set_status", args: { id, status: "ACTIVE" }, label: "Activated" };
  if (action.type === "set_budget") return { tool: "set_budget", args: { id, dailyBudget: action.dailyBudget }, label: `Set budget ฿${action.dailyBudget}` };
  return { tool: "set_status", args: { id, status: "PAUSED" }, label: "Paused" };
}

// Parse schedule/condition/action from stored string or object
function parseField(v: any) {
  if (typeof v === 'object') return v;
  try { return JSON.parse(v) } catch { return v }
}

export function isDue(rule: any, now: number): boolean {
  if (!rule.enabled) return false;
  const schedule = parseField(rule.schedule);
  if (!schedule || typeof schedule !== 'object') return false;
  if (schedule.kind === "interval") {
    const ms = (schedule.everyMinutes || 60) * 60000;
    return !rule.lastRunAt || now - rule.lastRunAt >= ms;
  }
  // daily at HH:MM (server local time)
  const [h, mn] = (schedule.time || "00:00").split(":").map(Number);
  const target = new Date(now);
  target.setHours(h || 0, mn || 0, 0, 0);
  const tMs = target.getTime();
  return now >= tMs && (!rule.lastRunAt || rule.lastRunAt < tMs);
}

// Adapt db-store agent shape to the Agent type expected by providers.ts
function toProviderAgent(a: any) {
  const scopeArr = Array.isArray(a.scope) ? a.scope : [];
  const accountId = scopeArr[0] || a.scope?.accountId || "";
  return {
    ...a,
    apiKey: a.apiKey || "",
    spriteId: 0,
    color: "#5b6cff",
    deskId: null,
    pos: { x: a.posX ?? 0, y: a.posY ?? 0 },
    systemPrompt: a.systemPrompt || "",
    scope: { accountId },
    createdAt: a.createdAt ? new Date(a.createdAt).getTime() : Date.now(),
  };
}

// Run a single rule by agentId and ruleId. Returns a human-readable summary; records a structured run.
export async function runRule(agentId: string, ruleId: string, trigger: "schedule" | "manual" = "schedule"): Promise<string> {
  const rules = await getRules(agentId);
  const ruleRow = rules.find((r: any) => r.id === ruleId);
  if (!ruleRow) return "rule not found";

  const rule = {
    ...ruleRow,
    schedule: parseField(ruleRow.schedule),
    condition: parseField(ruleRow.condition),
    action: parseField(ruleRow.action),
  };

  // agent is OPTIONAL — only needed for the AI instruction.
  const agentRow = agentId ? await getAgentWithKey(agentId) : undefined;
  const agent = agentRow ? toProviderAgent(agentRow) : undefined;
  const targetAccount = rule.accountId || agent?.scope?.accountId || "";

  const items: RuleRunItem[] = [];
  let dryRun = rule.dryRun ?? false;
  try {
    // structured condition (iterate every account when the target is "all")
    if (rule.condition && typeof rule.condition === 'object') {
      const { metric, op, value } = rule.condition;
      const accountIds = targetAccount === "all"
        ? (await getAccounts()).map((a: any) => a.id)
        : [targetAccount];
      let matched = false;
      for (const acct of accountIds) {
        const { rows } = await getLevel(acct, rule.level || 'ad', rule.datePreset || 'today');
        const matches = rows.filter((r: any) => compare(Number(r[metric]) || 0, op as RuleOp, value));
        for (const m of matches) {
          matched = true;
          const mv = Number((Number(m[metric]) || 0).toFixed(2));
          const { tool, args, label } = mapAction(rule.action, String(m.id));
          const base = { entityId: String(m.id), entityName: String(m.name || m.id), level: rule.level, metric, value: mv, action: label };
          if (dryRun) items.push({ ...base, status: "dry-run" });
          else {
            try { await rawApply(tool, args); items.push({ ...base, status: "applied" }); }
            catch (e: any) { items.push({ ...base, status: "error", note: e.message }); }
          }
        }
      }
      if (!matched) items.push({ entityName: `No ${rule.level || 'ad'}s matched ${metric} ${op} ${value}`, action: "check", status: "info" });
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
          if (dryRun) items.push({ ...base, status: "dry-run" });
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

  await addRuleRun(ruleId, { status: dryRun ? "dry-run" : "applied", summary }).catch(() => {});
  await addLog(agentId || "system", { type: "rule", message: `[${rule.name || ruleId}] ${summary}` }).catch(() => {});

  // stamp lastRunAt on the rule
  await saveRule(agentId, {
    ...ruleRow,
    lastRunAt: Date.now(),
    lastResult: summary.slice(0, 300),
  }).catch(() => {});

  return summary;
}

// Run all due rules for a given agent (or force by ruleId).
export async function runDueRules(agentId: string, forceId?: string): Promise<{ id: string; name: string; summary: string }[]> {
  const rules = await getRules(agentId);
  const now = Date.now();
  const due = rules.filter((r: any) => forceId ? r.id === forceId : isDue(r, now));
  const out: { id: string; name: string; summary: string }[] = [];
  for (const r of due) {
    const summary = await runRule(agentId, r.id, forceId ? "manual" : "schedule");
    out.push({ id: r.id, name: r.agentId || r.id, summary });
  }
  return out;
}
