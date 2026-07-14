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

```ts
export interface RuleCondition {
  metric: RuleMetric;
  op: RuleOp;
  value: number;
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
  timeWindow?: RuleTimeWindow; // optional gate on top of kind's own trigger logic
}

export interface Rule {
  // ...unchanged fields...
  condition?: RuleCondition;      // DEPRECATED: kept only for reading old rows
  conditions?: RuleCondition[];   // new: replaces `condition` going forward
  conditionLogic?: "AND" | "OR";  // how conditions[] combine; default "AND"
  // ...
}
```

No DB schema change: `rules.condition` and `rules.schedule` are `text` columns storing
JSON (see `supabase/schema.sql`); the new fields just add keys to that JSON blob.

## Evaluation changes (`lib/agents/cron.ts`)

**Condition matching.** Replace the single `compare(a, op, b)` call site with:

```ts
function evalConditions(row: any, conditions: RuleCondition[], logic: "AND" | "OR", getVal: (c: RuleCondition) => number): boolean {
  const results = conditions.map(c => compare(getVal(c), c.op, c.value));
  return logic === "OR" ? results.some(Boolean) : results.every(Boolean);
}
```

Both the FB-metric branch and the true-metric branch in `runRule()` switch from reading
`rule.condition` to a normalized list: `const conds = rule.conditions?.length ? rule.conditions : (rule.condition ? [rule.condition] : [])`,
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
  (`conditions: {metric, op, value}[]`) rendered as stacked rows, each with a remove (×)
  button, plus an "+ เพิ่มเงื่อนไข" button. Above the list, a 2-way segmented control
  ("ต้องผ่านทุกข้อ (AND)" / "ผ่านข้อใดข้อหนึ่ง (OR)") sets `conditionLogic`. Loading an
  existing rule: if `conditions` is present use it, else seed the list from the legacy
  `condition` field (one row) so old rules edit cleanly and re-save in the new shape.
- **Time window section**: new collapsible block under the existing "เมื่อไหร่" schedule
  field, off by default (preserves current always-on behavior). When enabled: start/end
  `<input type="time">` pair + 7 day-toggle chips (Sun–Sat, all selected by default when
  first enabled = every day). Shown for both `daily` and `interval` schedule kinds.
- Save payload adds `conditions`, `conditionLogic`, and nests `timeWindow` inside the
  `schedule` object exactly as the type defines; `condition` (singular) is no longer sent
  from the UI for new/edited rules (server keeps accepting it on read for old rows only).

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
