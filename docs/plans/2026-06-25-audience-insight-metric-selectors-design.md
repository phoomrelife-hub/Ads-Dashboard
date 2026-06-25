# Audience Insight — per-box metric selectors + framer-motion transitions

**Date:** 2026-06-25
**Scope:** `app/audience-insight/page.tsx` (+ small local components) and `components/thailand-map.tsx`. No API or `lib/fb.ts` changes.

## Goal

Let each card on the Audience Insight page choose which metric it shows (instead of the
hardcoded spend / CPL / CPA), and animate every metric change smoothly with framer-motion.

## Key facts

- `/api/breakdown` already returns **all** metrics per row (`metrics()` flattens spend, cpl,
  roas, ctr, leads, …). So switching a box's metric is **pure client-side** — no refetch.
- Two visual kinds with different valid metrics:
  - **Composition** (gender pie, age pie): only **additive** metrics (you can't pie-chart a ratio).
  - **Comparison** (age bar, gender cards, Thailand map): **any** metric.

## Metric catalog (curated)

Each metric carries: `key`, `label`, `format` (`baht|int|pct|x`), `additive` (bool),
`polarity` (`cost` = lower better | `good` = higher better | `neutral`).

| key | label | format | additive | polarity |
|---|---|---|---|---|
| spend | ค่าโฆษณา | baht | yes | neutral |
| leads | Leads | int | yes | good |
| purchases | Purchases | int | yes | good |
| messaging | ข้อความ | int | yes | good |
| impressions | Impressions | int | yes | neutral |
| cpl | CPL | baht | no | cost |
| costPerPurchase | CPA | baht | no | cost |
| roas | ROAS | x | no | good |
| ctr | CTR | pct | no | good |
| cpc | CPC | baht | no | cost |
| cpm | CPM | baht | no | cost |

- **Pie option list** = `additive` metrics only.
- **Bar/cards/map option list** = all metrics.

## Formatting & color

- `fmtMetric(value, format)`: baht → existing `fmtBaht`; int → `toLocaleString`; pct → `x.xx%`;
  x → `x.xx×`.
- `barColor(t, polarity)` / map ramp by polarity:
  - cost → dark→red `#26303d→#ff3b3b` (high = bad), bar green→amber→red on `t`.
  - good → dark→green `#26303d→#31c48d` (high = good), bar inverts (`1-t`).
  - neutral → dark→blue `#26303d→#5b6cff`, bar mono blue.
- `ThailandMap` gains optional `colors?: [low, high]` (default current red ramp); legend gradient
  + ต่ำ/สูง labels follow the chosen metric's polarity.

## State (5 independent selectors, persisted)

`genderPieMetric`, `agePieMetric`, `ageBarMetric`, `genderCardMetric`, `mapMetric`.
Defaults: pies → `spend`; bar/cards/map → auto CPA key (`cpaKey()` = cpl|messaging|purchase).
Persist each to `localStorage` (`ai.metric.<box>`).

## Components

- **`MetricSelect`** — styled trigger + `AnimatePresence` popover, item stagger. Takes the
  box's allowed option list. Replaces native `<select>` for the per-box picker.
- **`AnimatedNumber`** — `useMotionValue` + `animate()` spring, formatted per metric. Used by
  gender cards, pie legends, map table.
- Refactor `PieChart` / `CpaBarChart` / `CpaGenderCards` to take `metric` (+ formatter/polarity)
  and animate:
  - Pie: `AnimatePresence` keyed on metric → crossfade + scale; legend numbers count up.
  - Bar: `motion.div` width spring; `layout` reflow on re-sort; `AnimatePresence` enter/exit.
  - Cards: count-up value, animated % bar width, tween border color.
  - Map: CSS `transition-colors` (already present) + side-table `layout` + count-up.

## Cross-cutting

- One transition preset (spring ~stiffness 120 / damping 20).
- Honor `prefers-reduced-motion` → instant.

## Out of scope (YAGNI)

- No new API/data work, no full ~30-metric list, no global selector, no porting to erp unified.
