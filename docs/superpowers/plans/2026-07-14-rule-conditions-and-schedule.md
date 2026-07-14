# Multi-condition rules + time-window scheduling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a Pixel Agents automation rule combine multiple metric conditions (AND/OR) and restrict interval/daily schedules to a time-of-day + day-of-week window, matching how AdwinAI/ADSkit rules are actually used, without any DB migration.

**Architecture:** New pure, DB/env-free helpers in `lib/agents/rule-eval.ts` (`normalizeConditions`, `evalConditions`, `withinTimeWindow`, `conditionsMetricKind`, `isValidTimeWindow`) are unit tested in isolation, then wired into `lib/agents/cron.ts` (evaluation), `app/api/agents/rules/route.ts` (save-time validation), and `components/agents/rule-modal.tsx` (authoring UI). The richer data lives inside the *existing* `condition` and `schedule` JSON columns — no new columns, fully backward compatible with rows that still hold the old bare-`{metric,op,value}` shape.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (`text` columns storing JSON), Node's built-in test runner (`node --test`, via `tsx`) for unit tests — this repo does not use Vitest.

## Global Constraints

- No DB schema change — `rules.condition` and `rules.schedule` stay `text` columns (`supabase/schema.sql`).
- Existing rules with a single legacy `condition` object (no `items` key) and no `timeWindow` must keep evaluating exactly as before (regression-tested).
- All conditions within one rule must be either all `true_roas`/`true_cac`/`real_cvr` (true-metrics) or all other FB metrics — never mixed (they come from different data sources: `computeTrueRoas` vs `getLevel`).
- Test command for new pure-logic files: `npm test` → `node --import tsx --test "lib/**/*.test.ts"`.
- Typecheck command: `npx tsc --noEmit` (must exit 0; this repo has no separate `typecheck` script).

---

### Task 1: Type changes for condition groups + time windows

**Files:**
- Modify: `lib/agents/types.ts:71-92`

**Interfaces:**
- Produces: `RuleCondition` (unchanged shape: `{metric: RuleMetric; op: RuleOp; value: number}`), new `RuleConditionGroup { items: RuleCondition[]; logic?: "AND" | "OR" }`, new `RuleTimeWindow { start: string; end: string; days?: number[] }`, `RuleSchedule.timeWindow?: RuleTimeWindow`, `Rule.condition?: RuleCondition | RuleConditionGroup`.

- [ ] **Step 1: Edit the types**

Replace lines 66-92 of `lib/agents/types.ts` (the `RuleSchedule` through `Rule` interfaces) with:

```ts
export interface RuleTimeWindow {
  start: string;          // "HH:MM", 24h, server-local time
  end: string;             // "HH:MM"; if end < start, the window crosses midnight
  days?: number[];         // 0=Sun..6=Sat; omitted or empty = every day
}
export interface RuleSchedule {
  kind: "daily" | "interval";
  time?: string;           // "HH:MM" (24h) for daily
  everyMinutes?: number;   // for interval
  timeWindow?: RuleTimeWindow; // optional gate on top of kind's own trigger logic
}
export interface RuleCondition {
  metric: RuleMetric;
  op: RuleOp;
  value: number;
}
// New shape stored in the `condition` column going forward. Old rows still hold a bare
// RuleCondition (no `items` key) — lib/agents/rule-eval.ts#normalizeConditions reads both.
export interface RuleConditionGroup {
  items: RuleCondition[];
  logic?: "AND" | "OR"; // default "AND"
}
export interface Rule {
  id: string;
  accountId: string;             // target ad account (act_...) or "all" — no agent needed
  agentId?: string;              // only required for the optional AI instruction
  name: string;
  enabled: boolean;
  dryRun: boolean;
  level: RuleLevel;
  datePreset: string;            // metric window, e.g. "today", "last_7d"
  condition?: RuleCondition | RuleConditionGroup; // structured trigger (optional); either shape
  instruction?: string;          // natural-language trigger run by the agent (optional)
  action: { type: RuleActionType; dailyBudget?: number };
  schedule: RuleSchedule;
  lastRunAt?: number;
  lastResult?: string;
  createdAt: number;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: fails now, listing every call site that reads `rule.condition.metric` directly (they no longer type-check against the union). That's expected — Tasks 3, 5, and 6 fix each site. Note the file list from the error output before moving on.

- [ ] **Step 3: Commit**

```bash
git add lib/agents/types.ts
git commit -m "feat(agents): widen Rule.condition to support condition groups + time windows"
```

---

### Task 2: Pure rule-evaluation helpers (TDD)

**Files:**
- Create: `lib/agents/rule-eval.ts`
- Test: `lib/agents/rule-eval.test.ts`

**Interfaces:**
- Consumes: `RuleCondition`, `RuleConditionGroup`, `RuleOp`, `RuleTimeWindow`, `RuleMetric` from `./types` (Task 1).
- Produces: `TRUE_METRICS: Set<string>`, `compare(a: number, op: RuleOp, b: number): boolean`, `normalizeConditions(condition: RuleCondition | RuleConditionGroup | null | undefined): { items: RuleCondition[]; logic: "AND" | "OR" }`, `conditionsMetricKind(items: RuleCondition[]): "true" | "fb" | "mixed" | "none"`, `evalConditions<T>(row: T, items: RuleCondition[], logic: "AND" | "OR", getVal: (row: T, metric: string) => number | null): boolean`, `isValidTimeWindow(tw: RuleTimeWindow): boolean`, `withinTimeWindow(tw: RuleTimeWindow | undefined, now: number): boolean`. Tasks 3, 4, 5, 6 all import from this file.

- [ ] **Step 1: Write the failing tests**

Create `lib/agents/rule-eval.test.ts`:

```ts
// Unit tests for the pure rule-evaluation helpers in rule-eval.ts.
// No DB/env/network deps — safe to run anywhere.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compare, normalizeConditions, conditionsMetricKind, evalConditions,
  isValidTimeWindow, withinTimeWindow,
} from './rule-eval';

// ── compare ──────────────────────────────────────────────────────────────────
test('compare handles all ops', () => {
  assert.equal(compare(5, '>', 3), true);
  assert.equal(compare(3, '>', 5), false);
  assert.equal(compare(5, '>=', 5), true);
  assert.equal(compare(3, '<', 5), true);
  assert.equal(compare(5, '<=', 5), true);
  assert.equal(compare(5, '==', 5), true);
  assert.equal(compare(5, '==', 5.1), false);
});

// ── normalizeConditions ──────────────────────────────────────────────────────
test('normalizeConditions: undefined/null condition -> empty AND group', () => {
  assert.deepEqual(normalizeConditions(undefined), { items: [], logic: 'AND' });
  assert.deepEqual(normalizeConditions(null), { items: [], logic: 'AND' });
});

test('normalizeConditions: legacy bare condition -> single-item AND group', () => {
  const legacy = { metric: 'roas', op: '>', value: 4 } as const;
  assert.deepEqual(normalizeConditions(legacy), { items: [legacy], logic: 'AND' });
});

test('normalizeConditions: new group shape passes through, defaults logic to AND', () => {
  const items = [{ metric: 'roas', op: '>', value: 4 }, { metric: 'spend', op: '>', value: 300 }] as const;
  assert.deepEqual(normalizeConditions({ items: [...items] }), { items: [...items], logic: 'AND' });
  assert.deepEqual(normalizeConditions({ items: [...items], logic: 'OR' }), { items: [...items], logic: 'OR' });
});

// ── conditionsMetricKind ─────────────────────────────────────────────────────
test('conditionsMetricKind: empty -> none', () => {
  assert.equal(conditionsMetricKind([]), 'none');
});
test('conditionsMetricKind: all FB metrics -> fb', () => {
  assert.equal(conditionsMetricKind([{ metric: 'roas', op: '>', value: 1 }, { metric: 'spend', op: '>', value: 1 }]), 'fb');
});
test('conditionsMetricKind: all true metrics -> true', () => {
  assert.equal(conditionsMetricKind([{ metric: 'true_roas', op: '>', value: 1 }, { metric: 'true_cac', op: '<', value: 100 }]), 'true');
});
test('conditionsMetricKind: mixed -> mixed', () => {
  assert.equal(conditionsMetricKind([{ metric: 'true_roas', op: '>', value: 1 }, { metric: 'spend', op: '>', value: 1 }]), 'mixed');
});

// ── evalConditions ───────────────────────────────────────────────────────────
const getVal = (row: Record<string, number>, metric: string) => (metric in row ? row[metric] : null);

test('evalConditions: AND requires every condition to pass', () => {
  const items = [{ metric: 'roas', op: '>', value: 4 }, { metric: 'spend', op: '>', value: 300 }] as const;
  assert.equal(evalConditions({ roas: 5, spend: 400 }, [...items], 'AND', getVal), true);
  assert.equal(evalConditions({ roas: 5, spend: 200 }, [...items], 'AND', getVal), false);
});

test('evalConditions: OR requires at least one condition to pass', () => {
  const items = [{ metric: 'roas', op: '>', value: 4 }, { metric: 'spend', op: '>', value: 300 }] as const;
  assert.equal(evalConditions({ roas: 1, spend: 400 }, [...items], 'OR', getVal), true);
  assert.equal(evalConditions({ roas: 1, spend: 1 }, [...items], 'OR', getVal), false);
});

test('evalConditions: missing value (getVal returns null) counts as not-matching', () => {
  const items = [{ metric: 'roas', op: '>', value: 4 }] as const;
  assert.equal(evalConditions({}, [...items], 'AND', getVal), false);
});

test('evalConditions: empty items never matches', () => {
  assert.equal(evalConditions({ roas: 100 }, [], 'AND', getVal), false);
});

// ── isValidTimeWindow ────────────────────────────────────────────────────────
test('isValidTimeWindow: valid HH:MM pair and days', () => {
  assert.equal(isValidTimeWindow({ start: '06:00', end: '22:00', days: [1, 2, 3, 4, 5] }), true);
});
test('isValidTimeWindow: rejects malformed time strings', () => {
  assert.equal(isValidTimeWindow({ start: '6:00', end: '22:00' }), false);
  assert.equal(isValidTimeWindow({ start: '06:00', end: '25:00' }), false);
});
test('isValidTimeWindow: rejects out-of-range days', () => {
  assert.equal(isValidTimeWindow({ start: '06:00', end: '22:00', days: [7] }), false);
  assert.equal(isValidTimeWindow({ start: '06:00', end: '22:00', days: [-1] }), false);
});

// ── withinTimeWindow ─────────────────────────────────────────────────────────
test('withinTimeWindow: no window -> always true', () => {
  assert.equal(withinTimeWindow(undefined, Date.now()), true);
});
test('withinTimeWindow: same-day window, inside and outside', () => {
  const tw = { start: '06:00', end: '22:00' };
  const inside = new Date(2026, 0, 5, 12, 0).getTime();  // Mon 12:00
  const outside = new Date(2026, 0, 5, 23, 0).getTime(); // Mon 23:00
  assert.equal(withinTimeWindow(tw, inside), true);
  assert.equal(withinTimeWindow(tw, outside), false);
});
test('withinTimeWindow: window crossing midnight', () => {
  const tw = { start: '22:00', end: '02:00' };
  const lateNight = new Date(2026, 0, 5, 23, 30).getTime();
  const earlyMorning = new Date(2026, 0, 6, 1, 30).getTime();
  const midday = new Date(2026, 0, 5, 12, 0).getTime();
  assert.equal(withinTimeWindow(tw, lateNight), true);
  assert.equal(withinTimeWindow(tw, earlyMorning), true);
  assert.equal(withinTimeWindow(tw, midday), false);
});
test('withinTimeWindow: day-of-week filter (Mon-Fri only)', () => {
  const tw = { start: '00:00', end: '23:59', days: [1, 2, 3, 4, 5] };
  const monday = new Date(2026, 0, 5, 12, 0).getTime();   // 2026-01-05 is a Monday
  const saturday = new Date(2026, 0, 10, 12, 0).getTime(); // Saturday
  assert.equal(withinTimeWindow(tw, monday), true);
  assert.equal(withinTimeWindow(tw, saturday), false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module './rule-eval'` (file doesn't exist yet).

- [ ] **Step 3: Implement `lib/agents/rule-eval.ts`**

```ts
// Pure, DB/env-free rule-evaluation helpers for the Pixel Agents automation engine.
// Kept separate from cron.ts so they're unit-testable without live Meta/Supabase access
// (same pattern as briefing-classify.ts).
import type { RuleCondition, RuleConditionGroup, RuleOp, RuleTimeWindow } from "./types";

export const TRUE_METRICS = new Set(["true_roas", "true_cac", "real_cvr"]);

export function compare(a: number, op: RuleOp, b: number): boolean {
  switch (op) {
    case ">": return a > b;
    case ">=": return a >= b;
    case "<": return a < b;
    case "<=": return a <= b;
    case "==": return a === b;
  }
}

// Reads either the legacy bare-condition shape or the new {items, logic} group shape —
// both are stored in the same `condition` DB column (see docs/superpowers/specs/
// 2026-07-14-rule-conditions-and-schedule-design.md). Always returns the group shape.
export function normalizeConditions(
  condition: RuleCondition | RuleConditionGroup | null | undefined
): { items: RuleCondition[]; logic: "AND" | "OR" } {
  if (!condition) return { items: [], logic: "AND" };
  if ("items" in condition && Array.isArray(condition.items)) {
    return { items: condition.items, logic: condition.logic || "AND" };
  }
  if ("metric" in condition) return { items: [condition], logic: "AND" };
  return { items: [], logic: "AND" };
}

export function conditionsMetricKind(items: RuleCondition[]): "true" | "fb" | "mixed" | "none" {
  if (items.length === 0) return "none";
  const kinds = new Set(items.map((c) => (TRUE_METRICS.has(c.metric) ? "true" : "fb")));
  if (kinds.size > 1) return "mixed";
  return kinds.has("true") ? "true" : "fb";
}

export function evalConditions<T>(
  row: T,
  items: RuleCondition[],
  logic: "AND" | "OR",
  getVal: (row: T, metric: string) => number | null
): boolean {
  if (items.length === 0) return false;
  const results = items.map((c) => {
    const v = getVal(row, c.metric);
    return v != null && compare(v, c.op, c.value);
  });
  return logic === "OR" ? results.some(Boolean) : results.every(Boolean);
}

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTimeWindow(tw: RuleTimeWindow): boolean {
  if (!TIME_RE.test(tw.start) || !TIME_RE.test(tw.end)) return false;
  if (tw.days && tw.days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) return false;
  return true;
}

export function withinTimeWindow(tw: RuleTimeWindow | undefined, now: number): boolean {
  if (!tw) return true;
  const d = new Date(now);
  if (tw.days && tw.days.length > 0 && !tw.days.includes(d.getDay())) return false;
  const mins = d.getHours() * 60 + d.getMinutes();
  const [sh, sm] = tw.start.split(":").map(Number);
  const [eh, em] = tw.end.split(":").map(Number);
  const startMins = sh * 60 + sm;
  const endMins = eh * 60 + em;
  return startMins <= endMins
    ? mins >= startMins && mins < endMins
    : mins >= startMins || mins < endMins; // crosses midnight
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — all `rule-eval.test.ts` tests green, plus the pre-existing `briefing.test.ts`, `chain.test.ts`, `spec.test.ts`, `phone.test.ts`, `store.test.ts` still pass (no shared state touched).

- [ ] **Step 5: Commit**

```bash
git add lib/agents/rule-eval.ts lib/agents/rule-eval.test.ts
git commit -m "feat(agents): add pure rule-condition and time-window evaluation helpers"
```

---

### Task 3: Wire the helpers into the cron engine

**Files:**
- Modify: `lib/agents/cron.ts` (whole file)
- Modify: `lib/agents/lark-report.ts:96`

**Interfaces:**
- Consumes: everything exported from `./rule-eval` (Task 2).
- Produces: `isDue(rule, now)` and `runRule(agentId, ruleId, trigger)` keep their existing exported signatures — no callers outside this file change (`app/api/agents/cron/tick/route.ts`, `app/api/agents/rules/runs/route.ts` call `runDueRules`/`runRule` unchanged).

- [ ] **Step 1: Replace `lib/agents/cron.ts` in full**

```ts
// Cron engine for Pixel Agents automation rules.
// Evaluates due rules: structured conditions (via getLevel) and/or a natural-language
// instruction (via runAgentTurn). Honors per-rule dry-run. Writes outcomes to the log.
import { getRules, getAgentWithKey, addLog, addRuleRun, saveRule, toProviderAgent } from "./store";
import { getLevel, getAccounts } from "@/lib/fb";
import { executeAction, rawApply } from "./actions";
import { runAgentTurn } from "./providers";
import { computeTrueRoas, type TrueRoasRow } from "@/lib/leads/roas";
import { sendRuleAlert } from "./lark-report";
import { normalizeConditions, conditionsMetricKind, evalConditions, withinTimeWindow } from "./rule-eval";
import type { RuleRunItem } from "./types";

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
  if (!withinTimeWindow(schedule.timeWindow, now)) return false;
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
    // structured condition(s) — one or more, combined with AND/OR (iterate every account
    // when the target is "all"). `metric` on each RuleRunItem below is a joined label
    // ("roas > 4 and spend > 300") rather than the matched entity's live value — a
    // deliberate simplification to support multi-metric conditions without a per-entity
    // value map; see the design spec for the trade-off.
    const { items: conds, logic } = normalizeConditions(rule.condition);
    if (conds.length > 0) {
      const isTrueMetric = conditionsMetricKind(conds) === "true";
      const metricLabel = conds.map((c) => `${c.metric} ${c.op} ${c.value}`).join(logic === "OR" ? " หรือ " : " และ ");
      const accountIds = targetAccount === "all"
        ? (await getAccounts()).map((a: any) => a.id)
        : [targetAccount];
      let matched = false;
      for (const acct of accountIds) {
        if (isTrueMetric) {
          // True-metric branch: compare against tracked real-sales data.
          const trueLevel: 'campaign' | 'ad' = rule.level === 'campaign' ? 'campaign' : 'ad';
          const trueResult = await computeTrueRoas(acct, trueLevel, rule.datePreset || 'today');

          // Coverage guard: refuse to act when attribution is too thin.
          if (trueResult.coverage == null || trueResult.coverage < 0.5) {
            const covPct = trueResult.coverage != null ? Math.round(trueResult.coverage * 100) + '%' : '0%';
            items.push({
              entityName: `Account ${acct}`,
              action: "skip",
              status: "info",
              note: `Insufficient attribution coverage (${covPct}) — skipped`,
            });
            continue;
          }

          const getTrueVal = (row: TrueRoasRow, metric: string): number | null => {
            if (metric === 'true_roas') return row.trueRoas;
            if (metric === 'true_cac') return row.trueCac;
            if (metric === 'real_cvr') return row.cvr;
            return null;
          };

          for (const trueRow of trueResult.rows) {
            if (!evalConditions(trueRow, conds, logic, getTrueVal)) continue;
            matched = true;
            const { tool, args, label } = mapAction(rule.action, trueRow.id);
            const base: Omit<RuleRunItem, "status"> = { entityId: trueRow.id, entityName: trueRow.name, level: rule.level, metric: metricLabel, action: label };
            if (dryRun) items.push({ ...base, status: "dry-run" });
            else {
              try { await rawApply(tool, args); items.push({ ...base, status: "applied" }); }
              catch (e: any) { items.push({ ...base, status: "error", note: e.message }); }
            }
          }
        } else {
          // FB-metric branch.
          const { rows } = await getLevel(acct, rule.level || 'ad', rule.datePreset || 'today');
          const getFbVal = (row: any, metric: string): number => Number(row[metric]) || 0;
          const matches = rows.filter((r: any) => evalConditions(r, conds, logic, getFbVal));
          for (const m of matches) {
            matched = true;
            const { tool, args, label } = mapAction(rule.action, String(m.id));
            const base: Omit<RuleRunItem, "status"> = { entityId: String(m.id), entityName: String(m.name || m.id), level: rule.level, metric: metricLabel, action: label };
            if (dryRun) items.push({ ...base, status: "dry-run" });
            else {
              try { await rawApply(tool, args); items.push({ ...base, status: "applied" }); }
              catch (e: any) { items.push({ ...base, status: "error", note: e.message }); }
            }
          }
        }
      }
      if (!matched) items.push({ entityName: `No ${rule.level || 'ad'}s matched ${metricLabel}`, action: "check", status: "info" });
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
    ? acted.map((i) => `${i.status === "dry-run" ? "[dry] " : ""}${i.action} "${i.entityName}"${i.metric ? ` (${i.metric})` : ""}`).join(" · ")
    : (items[0]?.entityName || "nothing to do");

  await addRuleRun(ruleId, { status: dryRun ? "dry-run" : "applied", summary }).catch(() => {});
  await addLog(agentId || "system", { type: "rule", message: `[${rule.name || ruleId}] ${summary}` }).catch(() => {});

  // Live Lark alert — only when real actions were applied (never on dry-run). No-op if
  // LARK_WEBHOOK_URL is unset; wrapped so a Lark failure never affects rule execution.
  if (!dryRun) {
    const applied = items.filter((i) => i.status === "applied");
    if (applied.length) {
      await sendRuleAlert(rule.name || ruleId, targetAccount, applied.map((i) => ({
        entityName: i.entityName, action: i.action, metric: i.metric, value: i.value,
      }))).catch(() => {});
    }
  }

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
    out.push({ id: r.id, name: r.name || r.id, summary });
  }
  return out;
}
```

- [ ] **Step 2: Fix the now-stale `value` interpolation in `lark-report.ts`**

`items.value` is always `undefined` now (Task 3 no longer sets a numeric `value` on `RuleRunItem`, since `metric` is already a full label like `"roas > 4 and spend > 300"`). Edit `lib/agents/lark-report.ts:96`:

```ts
// before:
    .map((i) => `• ${i.action} **${i.entityName}**${i.metric ? ` (${i.metric} ${i.value})` : ""}`)
// after:
    .map((i) => `• ${i.action} **${i.entityName}**${i.metric ? ` (${i.metric})` : ""}`)
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors from `cron.ts` or `lark-report.ts`. Remaining errors (if any) should only be in `rule-modal.tsx` and `app/ads-auto/page.tsx` — fixed in Tasks 5 and 6.

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: PASS, same set as Task 2 (cron.ts has no direct tests — it's covered indirectly via rule-eval.test.ts plus the manual verification in Task 7).

- [ ] **Step 5: Commit**

```bash
git add lib/agents/cron.ts lib/agents/lark-report.ts
git commit -m "feat(agents): evaluate multi-condition rules and time-window schedules in cron"
```

---

### Task 4: Save-time validation in the rules API route

**Files:**
- Modify: `app/api/agents/rules/route.ts`

**Interfaces:**
- Consumes: `conditionsMetricKind`, `isValidTimeWindow` from `@/lib/agents/rule-eval` (Task 2).

- [ ] **Step 1: Add a validation helper and call it from POST and PUT**

Add near the top of `app/api/agents/rules/route.ts` (after the existing imports):

```ts
import { conditionsMetricKind, isValidTimeWindow } from "@/lib/agents/rule-eval";

// Shared save-time check for POST (new rule) and PUT (patch). Operates on the raw request
// body/patch before it's merged into the stored rule shape.
function validateRuleInput(b: any): string | null {
  const condition = b.condition;
  if (condition && typeof condition === "object" && Array.isArray(condition.items)) {
    if (conditionsMetricKind(condition.items) === "mixed") {
      return "เงื่อนไขในกฎเดียวกันต้องเป็นเมตริก Facebook ทั้งหมด หรือ TRUE metric ทั้งหมด ห้ามผสมกัน";
    }
  }
  const tw = typeof b.schedule === "object" && b.schedule ? b.schedule.timeWindow : undefined;
  if (tw && !isValidTimeWindow(tw)) {
    return "ช่วงเวลาทำงาน (timeWindow) ต้องเป็นรูปแบบ HH:MM และวันในสัปดาห์ 0-6";
  }
  return null;
}
```

In `POST`, right after `const b = await req.json()`:

```ts
    const validationError = validateRuleInput(b);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
```

In `PUT`, right after `const { id, agentId, patch } = await req.json()`:

```ts
    const validationError = validateRuleInput(patch);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors in `route.ts`.

- [ ] **Step 3: Manual check with the dev server**

Run: `npm run dev`, then in a second terminal:

```bash
curl -s -X POST http://localhost:3000/api/agents/rules \
  -H "content-type: application/json" \
  -d '{"agentId":"","accountId":"all","name":"test-mixed","condition":{"items":[{"metric":"true_roas","op":">","value":1},{"metric":"spend","op":">","value":1}]}}'
```

Expected: HTTP 400 with `{"error":"เงื่อนไขในกฎเดียวกันต้องเป็นเมตริก..."}`. (Port may differ — check the `next dev` startup log.)

- [ ] **Step 4: Commit**

```bash
git add app/api/agents/rules/route.ts
git commit -m "feat(agents): validate condition-kind mixing and time-window format on save"
```

---

### Task 5: Rule authoring UI — multi-condition list + time window

**Files:**
- Modify: `components/agents/rule-modal.tsx` (whole file)

**Interfaces:**
- Consumes: `normalizeConditions` from `@/lib/agents/rule-eval` (Task 2), `RuleConditionGroup`, `RuleTimeWindow` from `@/lib/agents/types` (Task 1).

- [ ] **Step 1: Replace `components/agents/rule-modal.tsx` in full**

```tsx
"use client";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Rule, RuleMetric, RuleOp, RuleActionType, RuleLevel, PublicAgent, RuleConditionGroup } from "@/lib/agents/types";
import { normalizeConditions } from "@/lib/agents/rule-eval";

const METRICS: [RuleMetric, string][] = [
  ["roas", "ROAS"], ["spend", "ค่าโฆษณา (฿)"], ["cpl", "ต้นทุน / ลีด"], ["cpc", "CPC"],
  ["ctr", "CTR %"], ["leads", "ลีด"], ["purchases", "ยอดซื้อ"], ["messaging", "ข้อความ"],
  ["frequency", "ความถี่"], ["cpm", "CPM"],
  ["true_roas", "TRUE ROAS (จริง)"], ["true_cac", "TRUE CAC (ต้นทุน/ลูกค้าจริง)"], ["real_cvr", "CVR จริง (%)"],
];
const OPS: RuleOp[] = [">", ">=", "<", "<=", "=="];
const LEVELS: [RuleLevel, string][] = [["ad", "โฆษณา"], ["adset", "ชุดโฆษณา"], ["campaign", "แคมเปญ"]];
const PRESETS = ["today", "yesterday", "last_7d", "last_30d", "this_month"];
const ACTIONS: [RuleActionType, string][] = [["pause", "หยุดชั่วคราว (ปิด)"], ["activate", "เปิดใช้งาน (เปิด)"], ["set_budget", "ตั้งงบรายวัน"]];
const DAY_LABELS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

type ConditionRow = { metric: RuleMetric; op: RuleOp; value: number };

export function RuleModal({ open, agents, accounts, rule, defaultAccountId, onClose, onSaved }: {
  open: boolean; agents: PublicAgent[]; accounts: { id: string; name: string }[]; rule: Rule | null; defaultAccountId?: string; onClose: () => void; onSaved: () => void;
}) {
  const [accountId, setAccountId] = useState("all");
  const [agentId, setAgentId] = useState("");
  const [name, setName] = useState("");
  const [scheduleKind, setScheduleKind] = useState<"daily" | "interval">("daily");
  const [time, setTime] = useState("00:00");
  const [everyMinutes, setEveryMinutes] = useState(60);
  const [level, setLevel] = useState<RuleLevel>("ad");
  const [datePreset, setDatePreset] = useState("today");
  const [useCondition, setUseCondition] = useState(true);
  const [conditions, setConditions] = useState<ConditionRow[]>([{ metric: "roas", op: ">", value: 2 }]);
  const [conditionLogic, setConditionLogic] = useState<"AND" | "OR">("AND");
  const [timeWindowEnabled, setTimeWindowEnabled] = useState(false);
  const [twStart, setTwStart] = useState("06:00");
  const [twEnd, setTwEnd] = useState("22:00");
  const [twDays, setTwDays] = useState<number[]>(ALL_DAYS);
  const [instruction, setInstruction] = useState("");
  const [actionType, setActionType] = useState<RuleActionType>("pause");
  const [dailyBudget, setDailyBudget] = useState(500);
  const [dryRun, setDryRun] = useState(true);
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAccountId(rule?.accountId || defaultAccountId || "all");
    setAgentId(rule?.agentId || "");
    if (rule) {
      setName(rule.name);
      setScheduleKind(rule.schedule.kind);
      setTime(rule.schedule.time || "00:00");
      setEveryMinutes(rule.schedule.everyMinutes || 60);
      setLevel(rule.level); setDatePreset(rule.datePreset);
      const { items, logic } = normalizeConditions(rule.condition);
      setUseCondition(items.length > 0);
      setConditions(items.length > 0 ? items.map((c) => ({ ...c })) : [{ metric: "roas", op: ">", value: 2 }]);
      setConditionLogic(logic);
      const tw = rule.schedule.timeWindow;
      setTimeWindowEnabled(!!tw);
      setTwStart(tw?.start || "06:00");
      setTwEnd(tw?.end || "22:00");
      setTwDays(tw?.days && tw.days.length > 0 ? tw.days : ALL_DAYS);
      setInstruction(rule.instruction || "");
      setActionType(rule.action.type); setDailyBudget(rule.action.dailyBudget || 500);
      setDryRun(rule.dryRun); setEnabled(rule.enabled);
    } else {
      setName(""); setScheduleKind("daily"); setTime("00:00"); setEveryMinutes(60);
      setLevel("ad"); setDatePreset("today"); setUseCondition(true);
      setConditions([{ metric: "roas", op: ">", value: 2 }]); setConditionLogic("AND");
      setTimeWindowEnabled(false); setTwStart("06:00"); setTwEnd("22:00"); setTwDays(ALL_DAYS);
      setInstruction("");
      setActionType("pause"); setDailyBudget(500); setDryRun(true); setEnabled(true);
    }
  }, [open, rule]);

  function addCondition() {
    setConditions((cs) => [...cs, { metric: "roas", op: ">", value: 2 }]);
  }
  function removeCondition(i: number) {
    setConditions((cs) => cs.filter((_, idx) => idx !== i));
  }
  function updateCondition(i: number, patch: Partial<ConditionRow>) {
    setConditions((cs) => cs.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }
  function toggleDay(d: number) {
    setTwDays((ds) => (ds.includes(d) ? ds.filter((x) => x !== d) : [...ds, d].sort()));
  }

  async function save() {
    setSaving(true);
    try {
      const condition: RuleConditionGroup | undefined = useCondition && conditions.length > 0
        ? { items: conditions.map((c) => ({ metric: c.metric, op: c.op, value: Number(c.value) })), logic: conditionLogic }
        : undefined;
      const schedule: any = scheduleKind === "daily" ? { kind: "daily", time } : { kind: "interval", everyMinutes: Number(everyMinutes) };
      if (timeWindowEnabled) {
        schedule.timeWindow = { start: twStart, end: twEnd, days: twDays.length > 0 && twDays.length < 7 ? twDays : undefined };
      }
      const body: any = {
        accountId,
        agentId: instruction.trim() ? agentId : undefined,
        name, enabled, dryRun, level, datePreset,
        condition,
        instruction: instruction.trim() || undefined,
        action: { type: actionType, ...(actionType === "set_budget" ? { dailyBudget: Number(dailyBudget) } : {}) },
        schedule,
      };
      if (rule) {
        await fetch("/api/agents/rules", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: rule.id, patch: body }) });
      } else {
        await fetch("/api/agents/rules", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      }
      onSaved(); onClose();
    } finally { setSaving(false); }
  }

  const canSave = accountId && name.trim()
    && ((useCondition && conditions.length > 0) || instruction.trim())
    && (!instruction.trim() || agentId)
    && (!timeWindowEnabled || (twStart && twEnd))
    && !saving;

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[110] flex items-center justify-center p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          style={{ background: "rgba(2,4,10,0.7)", backdropFilter: "blur(4px)" }} onClick={onClose}>
          <motion.div initial={{ scale: 0.94, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, y: 16 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }} onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl overflow-hidden"
            style={{ background: "#0a0e1a", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 20px 70px rgba(0,0,0,0.6)" }}>
            <div className="px-5 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
              <div className="text-[15px] font-bold text-[#e8eaf5]">{rule ? "แก้ไขกฎ" : "กฎอัตโนมัติใหม่"}</div>
              <div className="text-[11px] text-[#3a4a6a] mt-0.5">เมื่อถึงเวลา เอเจนต์จะตรวจสอบและดำเนินการ</div>
            </div>

            <div className="px-5 py-4 space-y-4 max-h-[68vh] overflow-y-auto">
              <Field label="รันบน (บัญชี)">
                <select value={accountId} onChange={(e) => setAccountId(e.target.value)} style={inp}>
                  <option value="all">🌐 ทุกบัญชี</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  {accountId !== "all" && !accounts.some((a) => a.id === accountId) && <option value={accountId}>{accountId}</option>}
                </select>
              </Field>

              <Field label="ชื่อกฎ">
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น หยุดโฆษณาที่ชนะตอนเที่ยงคืน" style={inp} />
              </Field>

              {/* schedule */}
              <Field label="เมื่อไหร่">
                <div className="flex gap-2">
                  <select value={scheduleKind} onChange={(e) => setScheduleKind(e.target.value as any)} style={{ ...inp, width: 130 }}>
                    <option value="daily">ทุกวันเวลา</option>
                    <option value="interval">ทุก ๆ</option>
                  </select>
                  {scheduleKind === "daily"
                    ? <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={inp} />
                    : <div className="flex items-center gap-2 flex-1">
                        <input type="number" min={1} value={everyMinutes} onChange={(e) => setEveryMinutes(+e.target.value)} style={inp} />
                        <span className="text-[12px] text-[#6a7a9a]">นาที</span>
                      </div>}
                </div>
              </Field>

              {/* time window */}
              <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <label className="flex items-center gap-2 mb-2 cursor-pointer">
                  <input type="checkbox" checked={timeWindowEnabled} onChange={(e) => setTimeWindowEnabled(e.target.checked)} />
                  <span className="text-[12px] font-semibold text-[#c8d0e0]">จำกัดช่วงเวลาทำงาน (เช่น 06:00-22:00)</span>
                </label>
                {timeWindowEnabled && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <input type="time" value={twStart} onChange={(e) => setTwStart(e.target.value)} style={inp} />
                      <span className="text-[12px] text-[#6a7a9a]">ถึง</span>
                      <input type="time" value={twEnd} onChange={(e) => setTwEnd(e.target.value)} style={inp} />
                    </div>
                    <div className="flex gap-1">
                      {DAY_LABELS.map((label, d) => (
                        <button key={d} type="button" onClick={() => toggleDay(d)}
                          className="w-8 h-8 rounded-lg text-[11px] font-semibold"
                          style={twDays.includes(d)
                            ? { background: "rgba(91,108,255,0.18)", color: "#8b9bff", border: "1px solid rgba(91,108,255,0.4)" }
                            : { background: "rgba(255,255,255,0.03)", color: "#4a5a7a", border: "1px solid transparent" }}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* scope */}
              <div className="grid grid-cols-2 gap-3">
                <Field label="ตรวจสอบ"><select value={level} onChange={(e) => setLevel(e.target.value as RuleLevel)} style={inp}>{LEVELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
                <Field label="ช่วงเวลาตัวชี้วัด"><select value={datePreset} onChange={(e) => setDatePreset(e.target.value)} style={inp}>{PRESETS.map((p) => <option key={p} value={p}>{p}</option>)}</select></Field>
              </div>

              {/* conditions */}
              <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <label className="flex items-center gap-2 mb-2 cursor-pointer">
                  <input type="checkbox" checked={useCondition} onChange={(e) => setUseCondition(e.target.checked)} />
                  <span className="text-[12px] font-semibold text-[#c8d0e0]">เงื่อนไข (ถ้า...)</span>
                </label>
                {useCondition && (
                  <div className="space-y-2">
                    {conditions.length > 1 && (
                      <div className="flex gap-1.5">
                        {(["AND", "OR"] as const).map((lg) => (
                          <button key={lg} type="button" onClick={() => setConditionLogic(lg)}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-semibold"
                            style={conditionLogic === lg
                              ? { background: "rgba(91,108,255,0.18)", color: "#8b9bff", border: "1px solid rgba(91,108,255,0.4)" }
                              : { background: "rgba(255,255,255,0.03)", color: "#4a5a7a", border: "1px solid transparent" }}>
                            {lg === "AND" ? "ต้องผ่านทุกข้อ (AND)" : "ผ่านข้อใดข้อหนึ่ง (OR)"}
                          </button>
                        ))}
                      </div>
                    )}
                    {conditions.map((c, i) => (
                      <div key={i} className="flex gap-2 items-center">
                        <select value={c.metric} onChange={(e) => updateCondition(i, { metric: e.target.value as RuleMetric })} style={{ ...inp, flex: 2 }}>{METRICS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                        <select value={c.op} onChange={(e) => updateCondition(i, { op: e.target.value as RuleOp })} style={{ ...inp, width: 64 }}>{OPS.map((o) => <option key={o} value={o}>{o}</option>)}</select>
                        <input type="number" step="any" value={c.value} onChange={(e) => updateCondition(i, { value: +e.target.value })} style={{ ...inp, width: 80 }} />
                        {conditions.length > 1 && (
                          <button type="button" onClick={() => removeCondition(i)} className="w-6 h-6 flex-shrink-0 rounded text-[13px]" style={{ color: "#ff6b6b" }}>×</button>
                        )}
                      </div>
                    ))}
                    <button type="button" onClick={addCondition} className="text-[11.5px] font-medium" style={{ color: "#5b6cff" }}>+ เพิ่มเงื่อนไข</button>
                  </div>
                )}
              </div>

              {/* action */}
              <Field label="แล้วทำ (การกระทำ)">
                <div className="flex gap-2">
                  <select value={actionType} onChange={(e) => setActionType(e.target.value as RuleActionType)} style={inp}>{ACTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                  {actionType === "set_budget" && <input type="number" value={dailyBudget} onChange={(e) => setDailyBudget(+e.target.value)} style={{ ...inp, width: 100 }} placeholder="฿/day" />}
                </div>
              </Field>

              {/* NL instruction (needs an agent) */}
              <Field label="คำสั่ง AI (ไม่บังคับ)">
                <textarea value={instruction} onChange={(e) => setInstruction(e.target.value)} rows={2}
                  placeholder="ไม่บังคับ: ให้เอเจนต์ตัดสิน เช่น 'หยุดโฆษณาที่ ROAS ต่ำและใช้งบสูง'" className="resize-none" style={inp} />
                {instruction.trim() && (
                  <select value={agentId} onChange={(e) => setAgentId(e.target.value)} style={{ ...inp, marginTop: 8 }}>
                    <option value="">เลือกเอเจนต์สำหรับรัน AI…</option>
                    {agents.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.provider})</option>)}
                  </select>
                )}
                {instruction.trim() && !agentId && <div className="text-[11px] mt-1" style={{ color: "#ff6b6b" }}>คำสั่ง AI ต้องการเอเจนต์ (สำหรับโมเดลและ API key)</div>}
              </Field>

              {/* toggles */}
              <div className="flex gap-2">
                <Toggle label="Dry-run (บันทึกเท่านั้น)" on={dryRun} onClick={() => setDryRun((v) => !v)} color="#f5b14c" />
                <Toggle label="เปิดใช้งาน" on={enabled} onClick={() => setEnabled((v) => !v)} color="#31c48d" />
              </div>
              {!dryRun && <div className="text-[11px]" style={{ color: "#ff6b6b" }}>⚠ โหมด Live — จะเปลี่ยนโฆษณาจริงโดยอัตโนมัติ</div>}
            </div>

            <div className="px-5 py-4 flex justify-end gap-2" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
              <button onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] text-[#8a9aba]" style={{ background: "rgba(255,255,255,0.04)" }}>ยกเลิก</button>
              <button onClick={save} disabled={!canSave} className="px-4 py-2 rounded-lg text-[13px] font-semibold"
                style={{ background: canSave ? "linear-gradient(135deg,#5b6cff,#a78bfa)" : "rgba(255,255,255,0.06)", color: canSave ? "#fff" : "#3a4a6a" }}>
                {saving ? "กำลังบันทึก…" : rule ? "บันทึกกฎ" : "สร้างกฎ"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><div className="text-[11px] uppercase tracking-wide text-[#3a4a6a] font-semibold mb-1.5">{label}</div>{children}</label>;
}
function Toggle({ label, on, onClick, color }: { label: string; on: boolean; onClick: () => void; color: string }) {
  return (
    <button onClick={onClick} className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] font-medium"
      style={{ background: on ? `${color}1a` : "rgba(255,255,255,0.04)", color: on ? color : "#6a7a9a", border: `1px solid ${on ? color + "55" : "transparent"}` }}>
      <span className="w-3.5 h-3.5 rounded flex items-center justify-center" style={{ background: on ? color : "rgba(255,255,255,0.1)" }}>
        {on && <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="#03130c" strokeWidth="2.5"><path d="M2.5 6l2.5 2.5 4.5-5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
      </span>
      {label}
    </button>
  );
}

const inp: React.CSSProperties = {
  background: "#070b14", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8,
  padding: "8px 10px", color: "#e8eaf5", fontSize: 13, outline: "none", width: "100%",
};
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors from `rule-modal.tsx`.

- [ ] **Step 3: Commit**

```bash
git add components/agents/rule-modal.tsx
git commit -m "feat(agents): rule modal supports multiple AND/OR conditions and a time window"
```

---

### Task 6: Update rule list summary and run-history display

**Files:**
- Modify: `app/ads-auto/page.tsx:1-15`
- Modify: `components/agents/rule-history-modal.tsx:69`

**Interfaces:**
- Consumes: `normalizeConditions` from `@/lib/agents/rule-eval` (Task 2).

- [ ] **Step 1: Update the label helpers in `app/ads-auto/page.tsx`**

Replace lines 1-15 with:

```tsx
"use client";
import { useCallback, useEffect, useState } from "react";
import { RuleModal } from "@/components/agents/rule-modal";
import { RuleHistoryModal } from "@/components/agents/rule-history-modal";
import type { PublicAgent, Rule } from "@/lib/agents/types";
import { normalizeConditions } from "@/lib/agents/rule-eval";
import { useAccountRanking } from "@/components/account-ranking";

const DAY_LABELS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

function scheduleLabel(r: Rule) {
  const base = r.schedule.kind === "daily" ? `ทุกวัน ${r.schedule.time}` : `ทุก ${r.schedule.everyMinutes}นาที`;
  const tw = r.schedule.timeWindow;
  if (!tw) return base;
  const days = tw.days && tw.days.length > 0 && tw.days.length < 7
    ? ` (${tw.days.map((d) => DAY_LABELS[d]).join("")})`
    : "";
  return `${base} · ${tw.start}-${tw.end}${days}`;
}
function ruleLabel(r: Rule) {
  const { items, logic } = normalizeConditions(r.condition);
  const cond = items.length > 0
    ? `ถ้า ${items.map((c) => `${c.metric} ${c.op} ${c.value}`).join(logic === "OR" ? " หรือ " : " และ ")}`
    : "AI";
  const act = r.action.type === "set_budget" ? `ตั้งงบ ฿${r.action.dailyBudget}` : r.action.type;
  return `${cond} → ${act}`;
}
function ago(ts?: number) {
  if (!ts) return "ไม่เคยรัน";
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}วินาทีที่แล้ว`;
  if (s < 3600) return `${Math.floor(s / 60)}นาทีที่แล้ว`;
  if (s < 86400) return `${Math.floor(s / 3600)}ชั่วโมงที่แล้ว`;
  return `${Math.floor(s / 86400)}วันที่แล้ว`;
}
```

- [ ] **Step 2: Fix the run-history metric badge in `components/agents/rule-history-modal.tsx`**

`RuleRunItem.metric` is now a full label string (e.g. `"roas > 4 and spend > 300"`) and `.value` is no longer set by `runRule`, so the old `it.value != null` guard would hide the badge for every run, not just multi-condition ones. Replace line 69:

```tsx
// before:
                              {it.metric != null && it.value != null && <span className="text-[#6a7a9a]"> · {it.metric} {it.value}</span>}
// after:
                              {it.metric != null && <span className="text-[#6a7a9a]"> · {it.metric}{it.value != null ? ` ${it.value}` : ""}</span>}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0, no errors anywhere in the project (this is the final typecheck for the whole feature).

- [ ] **Step 4: Commit**

```bash
git add app/ads-auto/page.tsx components/agents/rule-history-modal.tsx
git commit -m "feat(agents): show multi-condition summaries and time windows in the rule list"
```

---

### Task 7: Manual end-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full automated suite one more time**

Run: `npm test && npx tsc --noEmit`
Expected: both exit 0.

- [ ] **Step 2: Regression-check a legacy single-condition rule**

Run `npm run dev`, open `/ads-auto`, and either use an existing rule (if one has a single old-shape `condition`) or create one with exactly one condition and save. Confirm:
- The rule list row shows `ถ้า <metric> <op> <value> → <action>` (unchanged format for a single condition).
- Editing it re-opens the modal with that one condition row pre-filled and the AND/OR toggle hidden (only shows when there are 2+ conditions).
- Click "รันเดี๋ยวนี้" (Run now) with dry-run on — confirm a `dry-run` entry appears in "ประวัติ" (history) with a readable metric badge.

- [ ] **Step 3: Create a multi-condition AND rule and verify it dry-runs correctly**

In the UI: new rule, add 2 conditions (e.g. `spend > 1` AND `purchases == 0`), level = `ad`, dry-run on, schedule = interval every 15 min, no time window. Save, then click "รันเดี๋ยวนี้". Confirm the history entry's summary lists items only when *both* conditions are true for a given ad (cross-check against the raw `/api/agents/cron/tick?agentId=&forceId=<ruleId>` response or the `/dashboard` ad-level table for the same account/date preset).

- [ ] **Step 4: Create a time-windowed rule and verify the window gate**

New rule: interval every 1 minute (temporarily, for a fast manual test), no condition needed (use a trivial always-true one like `spend >= 0`), time window enabled with `start`/`end` set to a 2-minute range a few minutes in the future (e.g. current time +2 to +4 minutes), all days. Save with dry-run on. Hit the tick endpoint (or wait) before the window opens — confirm no run is recorded (`lastRunAt` stays unset and no new "ประวัติ" entry). Once inside the window, hit tick again — confirm a dry-run entry now appears. After manually verifying, delete this test rule (or disable it) so it doesn't keep firing.

- [ ] **Step 5: Verify mixed-metric rejection end-to-end**

Repeat the `curl` check from Task 4 Step 3 against the running dev server; confirm HTTP 400.

- [ ] **Step 6: Final commit (if any manual-test cleanup changed tracked files)**

```bash
git status
```
Expected: clean (the manual test rule created in Step 4 lives in Supabase, not in the repo — no files to commit here). If `git status` shows changes, review them before deciding whether to commit or revert.
