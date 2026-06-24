# Ads Agent — Next Steps Plan

_Last updated: 2026-06-19. Pickup plan for the AI ads-optimizer work on `ads-dashboard`._

## Where we are (DONE)

- **Tier 1 — Agent can see everything.** `lib/agents/tools.ts`: `get_insights` returns the full
  metric set + `compare:true` (period-over-period % deltas); new `get_breakdown` tool
  (placement/platform/device/age/gender/region/day). Date math in `lib/agents/dates.ts`.
- **Tier 2 — Daily Briefing.** Deterministic signal engine `lib/agents/briefing.ts`
  (wasting / declining / underperforming / fatigue / scaling; ROAS- or CPL-based per account).
  Routes `GET /api/agents/briefing` + `POST /api/agents/briefing/apply` (account-scoped).
  UI `/briefing` page + `components/agents/daily-briefing.tsx` + side-nav entry.
- **Sessions / chat memory.** Per-session resumable threads (no cross-session memory by choice).
  `sessions[]` in store, `app/api/agents/sessions/route.ts`, resume+autosave in `agent-chat.tsx`,
  "Sessions" list replaced "Recent activity" in `agent-profile.tsx`.

All three: `tsc --noEmit` clean + `next build` passes. **Not yet run against live FB/LLM data.**

## Do FIRST next session — live smoke tests (no code, just verify)

1. Start dev (`npm run dev`), open an agent, ask: _"compare last 7 days vs the previous week and
   break ROAS down by placement — what should I cut?"_ → confirm it calls `get_insights{compare}`
   + `get_breakdown` and returns a real recommendation.
2. Open `/briefing`, pick an account → confirm cards render with real numbers; test one **Apply**
   (use a low-stakes ad — it changes live spend).
3. New Chat → send a message → close → confirm it appears under **Sessions** and resumes correctly.
4. If anything breaks, that's the priority before new features.

## Tier 3 — Targets + Pacing (recommended next build)

Goal: upgrade the briefing from "vs account average" to "vs YOUR goals", and add budget pacing.

- **Data:** per-account targets in the store, e.g. `targets: { [accountId]: { roas?, cpl?, cpa?,
  monthlyBudget? } }`. New `lib/agents/targets.ts` read/write + `app/api/agents/targets/route.ts`
  (GET/PUT). Small settings UI (on `/briefing` or a new `/settings`).
- **Briefing engine:** when a target exists, judge against it instead of account avg
  (underperforming = below target ROAS / above target CPL; scaling = beating target).
  Add a **pacing** signal: month-to-date spend vs `monthlyBudget` prorated by day-of-month →
  flag "over/under pace by X%".
- **Agent:** add a `get_targets` read tool + mention targets in the system prompt
  (`lib/agents/providers.ts` already says "judge against targets when given" — wire it for real).

## Tier 4 — More agent actions

Behind the existing confirm-card / proposal flow. Higher risk, so keep dry-run friendly.

- `duplicate_ad` / `duplicate_adset` (scale winners) — FB `/copies` edge.
- `shift_budget` (move daily budget from a loser to a winner in one step).
- `exclude_placement` (turn off Audience Network etc. on an adset).
- Each: add tool schema in `tools.ts`, executor in `actions.ts` (with scope guard), wire into
  `briefing` proposals where relevant.

## Tier 5 — Agent memory (curated, NOT transcripts)

- A small per-agent/per-account **facts store** ("lead-gen acct, target CPL ฿120, AN always bad").
- Injected into the system prompt. Agent can propose adding a fact ("remember that…").
- This is the safe form of cross-session memory we deliberately deferred.

## Nice-to-haves / backlog

- Schedule the daily briefing via the existing cron engine + surface/notify (email or push).
- Optional LLM narrative summary on top of the deterministic briefing items.
- Briefing thresholds are constants at the top of `briefing.ts` — expose as per-account settings.

## Housekeeping reminders

- `agents-store.json` holds a **plaintext API key**; now gitignored. Rotate before going non-local.
- Real layout fonts are **Outfit + JetBrains_Mono** (`app/layout.tsx`), not the Fira Code/DM Sans
  an older note claimed.
- Memory index: `ads-agent-toolkit.md` in the Claude memory dir tracks all of the above.
