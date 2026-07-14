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
