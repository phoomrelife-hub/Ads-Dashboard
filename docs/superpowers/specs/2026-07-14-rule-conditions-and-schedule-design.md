# Rule engine: multi-condition (AND/OR) + time-of-day/day scheduling

Status: approved
Date: 2026-07-14

## Problem

The Pixel Agents automation rule engine (`lib/agents`) currently supports only:
- a single structured condition per rule (`metric op value`)
- schedules that are either "once daily at HH:MM" or "every N minutes, 24/7"

Competitor tools (AdwinAI, ADSkit) that Relife's ads team is evaluating both support
multi-condition rules (e.g. "ROAS > 4 AND Spend > 300 AND Purchases = 0") and interval
rules restricted to a time-of-day/day-of-week window (e.g. "scale budget every hour, but
only 06:00–19:00, Mon–Fri"). Today, replicating that on our rule engine requires several
separate rules and still can't express the time-window restriction on interval schedules
at all.

## Goals

- A rule can have multiple conditions, combined with a single AND or OR across the whole
  list (no nested sub-groups — flat list, matches how these conditions are used in practice).
- A rule's schedule (interval or daily) can optionally be restricted to a time-of-day
  window and a set of allowed weekdays. Outside the window, the rule is simply skipped
  that tick (not disabled).
- Fully backward compatible: existing rules with a single `condition` and no time window
  keep running unchanged, no data migration required.

## Non-goals

- Nested AND/OR sub-groups (rejected as over-engineering for the observed use cases).
- Rule folders/categories, template sharing, trash/undo — separate future work.
- Any change to the Meta connection/token handling (unrelated, handled separately).

## Data model changes (`lib/agents/types.ts`)

`db-store.ts` maps exactly one Postgres column each for `condition` and `schedule`
(both `text`, JSON-encoded — see `supabase/schema.sql`). There is no `conditions` or
`condition_logic` column, so the multi-condition list must live **inside** the existing
`condition` value, not as a sibling `Rule` field (a sibling field would silently be
dropped by `saveRule`, which only forwards known columns to Supabase).

```ts
export interface RuleCondition {
  metric: RuleMetric;
  op: RuleOp;
  value: number;
}

// New shape stored in the `condition` column going forward. Old rows still hold a bare
// RuleCondition ({metric,op,value}, no `items` key) — normalizeConditions() below reads both.
export interface RuleConditionGroup {
  items: RuleCondition[];
  logic?: "AND" | "OR"; // default "AND"
}

export interface RuleTimeWindow {
  start: string;        // "HH:MM", 24h, server-local
  end: string;           // "HH:MM"; if end < start, treated as crossing midnight
  days?: number[];       // 0=Sun..6=Sat; omitted/empty = every day
}

export interface RuleSchedule {
  kind: "daily" | "interval";
  time?: string;          // "HH:MM" (24h) for daily
  everyMinutes?: number;  // for interval
  timeWindow?: RuleTimeWindow; // optional gate on top of kind's own trigger logic, lives inside the `schedule` column
}

export interface Rule {
  // ...unchanged fields...
  condition?: RuleCondition | RuleConditionGroup; // either shape; normalizeConditions() disambiguates
  // ...
}
```

No DB schema change: both new pieces (`RuleConditionGroup`, `RuleTimeWindow`) are just
richer JSON shapes inside the two existing `text` columns.

## Evaluation changes (`lib/agents/cron.ts`)

**Condition matching.** New pure helpers in `lib/agents/rule-eval.ts` (no DB/env deps, unit
testable in isolation, following the existing `briefing-classify.ts` pattern):

```ts
function normalizeConditions(condition: RuleCondition | RuleConditionGroup | undefined): { items: RuleCondition[]; logic: "AND" | "OR" } {
  if (!condition) return { items: [], logic: "AND" };
  if ("items" in condition) return { items: condition.items, logic: condition.logic || "AND" };
  return { items: [condition], logic: "AND" }; // legacy single-condition row
}

function evalConditions<T>(row: T, items: RuleCondition[], logic: "AND" | "OR", getVal: (row: T, metric: string) => number | null): boolean {
  if (items.length === 0) return false;
  const results = items.map(c => { const v = getVal(row, c.metric); return v != null && compare(v, c.op, c.value); });
  return logic === "OR" ? results.some(Boolean) : results.every(Boolean);
}
```

Both the FB-metric branch and the true-metric branch in `runRule()` switch from reading
`rule.condition.metric` directly to `const { items, logic } = normalizeConditions(rule.condition)`,
then loop `getLevel`/`computeTrueRoas` results and test each row with `evalConditions`.
Because different conditions in the same rule can reference different metrics (e.g. ROAS
AND spend), and true-metrics vs FB-metrics come from different data sources, **all
conditions in a single rule must be either all true-metrics or all FB-metrics** — mixing
is rejected at save time (validated in the API route, not the UI, to keep the UI simple).

**Time window gating.** `isDue()` gets an added check after the existing kind-based logic:

```ts
function withinTimeWindow(tw: RuleTimeWindow | undefined, now: number): boolean {
  if (!tw) return true;
  const d = new Date(now);
  if (tw.days?.length && !tw.days.includes(d.getDay())) return false;
  const mins = d.getHours() * 60 + d.getMinutes();
  const [sh, sm] = tw.start.split(":").map(Number);
  const [eh, em] = tw.end.split(":").map(Number);
  const startMins = sh * 60 + sm, endMins = eh * 60 + em;
  return startMins <= endMins
    ? mins >= startMins && mins < endMins
    : mins >= startMins || mins < endMins; // crosses midnight
}
```

`isDue()` returns `false` when `withinTimeWindow` fails, same as any other "not due yet"
case — `lastRunAt` is untouched, so the rule fires on the next in-window tick.

## UI changes (`components/agents/rule-modal.tsx`)

- **Conditions section**: replace the single metric/op/value row with a repeatable list
  of `{metric, op, value}` rows, each with a remove (×) button, plus an "+ เพิ่มเงื่อนไข"
  button. Above the list, a 2-way segmented control ("ต้องผ่านทุกข้อ (AND)" / "ผ่านข้อใดข้อหนึ่ง
  (OR)") sets the group's `logic`. Loading an existing rule: run `rule.condition` through
  `normalizeConditions()` (imported from `lib/agents/rule-eval.ts`, safe to use client-side —
  no server deps) so both legacy single-condition rows and new group rows populate the
  same list UI.
- **Time window section**: new collapsible block under the existing "เมื่อไหร่" schedule
  field, off by default (preserves current always-on behavior). When enabled: start/end
  `<input type="time">` pair + 7 day-toggle chips (Sun–Sat, all selected by default when
  first enabled = every day). Shown for both `daily` and `interval` schedule kinds.
- Save payload sends `condition: { items: [...], logic }` (the new `RuleConditionGroup`
  shape) in place of the old bare `{metric, op, value}` — same JSON column, richer shape.
  `schedule` gains a nested `timeWindow` key when the toggle is on.

## Validation

API route (`app/api/agents/rules/route.ts`) POST/PUT: if `conditions` provided, reject
(400) when it mixes true-metrics (`true_roas`/`true_cac`/`real_cvr`) with FB-metrics in
the same array, and when `timeWindow.start`/`end` aren't valid `HH:MM`.

## Testing

- Unit-level: `evalConditions` truth table (AND/OR × 1-3 conditions), `withinTimeWindow`
  (same-day window, midnight-crossing window, day-of-week filter, no window = always true).
- Manual: create a rule with 2 AND conditions + a 06:00–22:00 Mon–Fri window in dry-run,
  confirm `/api/agents/cron/tick` only produces dry-run items inside the window and none
  outside it or on a weekend (can fake `now` by calling `runRule` directly in a scratch
  script since `isDue`/tick uses wall-clock time).
- Confirm an existing rule row with only the legacy `condition` field still evaluates and
  runs exactly as before (regression check).
