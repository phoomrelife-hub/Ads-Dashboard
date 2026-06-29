# True ROAS via a Lead → Sale Tracker

**Date:** 2026-06-29
**Status:** Approved design, in implementation
**Branch:** `feature/true-roas-leads`

## Problem

The dashboard trusts Facebook's *reported* ROAS, which over-reports. Because this app
lives inside the Relife ERP, next to real sales, we can compute **true** ROAS by joining
FB spend to actual closed sales — something no off-the-shelf tool can do.

Two facts uncovered during design:
1. **Nothing links a sale back to an ad today** — there is no shared key.
2. **Sales aren't recorded in any queryable form** — they live in chat threads / notes.

So true ROAS is three layers, and the middle one is missing:

| Layer | Status |
|---|---|
| 1. Capture lead + which ad it came from (phone ↔ ad_id) | Buildable — FB hands us this |
| 2. **Capture the sale** (phone bought ฿X, when) | **Missing — the blocker** |
| 3. Match + compute true ROAS / CAC / FB-gap | Trivial once 1 & 2 exist |

## Key idea

Ingest FB leads (each already carrying `phone + ad_id`) into a **leads list**. Telesales
works that list and taps **Won — ฿amount** / **Lost**. That single tap **is** the
sale-capture *and* the attribution — the sale is written onto a lead row that already
knows the ad, so no fuzzy phone-matching is needed. This is also the first real slice of
the placeholder telesales module: one build, two wins.

```
FB ad ──gives──▶ phone + ad_id   (leads table, attribution frozen at ingest)
                      │
                      ▼  telesales taps "Won ฿1,290"
                 sale_amount on the same row
                      │
                      ▼
        real revenue per ad → TRUE ROAS, TRUE CAC, FB gap
```

## Funnel (confirmed)

Entry points: **Lead forms** (FB gives name+phone+ad via Lead Ads API) and
**Click-to-message** (Messenger/IG/LINE; FB passes a hidden `ref`/`ad_id` into the chat).
Both funnel into **telesales**, who close and (now) record the sale. Phone is the bridge
key on both sides. Business is lead-gen / messaging, THB currency.

## Data model

Two new tables in the existing dashboard Supabase (`lib/supabase.ts`), RLS disabled like
the rest (internal tool).

### `leads`
| field | notes |
|---|---|
| `id` | uuid text |
| `account_id` | `act_…`, scopes like everything else |
| `phone` | **normalized** (Thai: strip non-digits, `+66`/`66`→`0`) — join + dedupe key |
| `name` | from FB lead form, optional |
| `campaign_id` / `adset_id` / `ad_id` | attribution — **stamped at ingest, never changes** |
| `campaign_name` / `ad_name` | denormalized snapshot for display (names drift) |
| `source` | `lead_form` \| `click_to_message` \| `manual` |
| `status` | `new` → `contacted` → `won` \| `lost` |
| `sale_amount` | ฿ major units, set when Won |
| `product` | optional, set when Won |
| `lost_reason` | optional, set when Lost |
| `fb_lead_id` | FB's lead id (dedupe ingestion idempotently) |
| `won_at` / `lost_at` / `contacted_at` | timestamps |
| `created_at` | lead arrival = the "ad date" for ROAS windows |

Indexes: `(account_id, status)`, `(account_id, ad_id)`, `(phone)`, unique `(fb_lead_id)` where not null.

### `lead_events` (light audit)
`id`, `lead_id` (fk cascade), `ts`, `kind` (`created`/`contacted`/`won`/`lost`/`reopened`),
`note`, `agent`. Lets us rebuild history and later measure speed-to-contact / per-agent.

### Lifecycle
```
new ──contacted──▶ contacted ──┬─ Won (+฿amount) ─▶ won
 └──────────────────────────────┴─ Lost ──────────▶ lost   (won/lost reopenable)
```
Attribution is frozen at ingest so a sale can never drift off the ad that earned it.

## Ingestion (v1)

Reuse the existing cron tick pattern (`/api/agents/cron/tick`) + FB token in `lib/fb.ts`.

- **A. Lead forms → auto.** Poll Graph API `GET /{ad_id}/leads` (or per form), `since=last_poll`,
  every ~15 min (configurable). Normalize phone, upsert into `leads` keyed on `fb_lead_id`.
  Each lead lands already attributed.
- **B. Click-to-message → manual-add (v1).** A **"+ Add lead"** form: phone + pick
  campaign/ad from live campaigns. `source = click_to_message`. (Messenger webhook for
  auto-capture of `ref`/`ad_id` is **deferred** — needs app review.)
- **C. Manual / walk-in.** Same form, `source = manual`, ad optional → shows as
  "unattributed", never silently folded into true-ROAS.

**Dedupe / guardrails:** upsert on `fb_lead_id` (ingestion) and normalized `phone`.
Ingestion only creates/updates `new` leads — never overwrites a lead telesales has
worked (`contacted`/`won`/`lost`); a repeat submission on a closed lead opens a fresh
one (so repeat buyers are visible). Last-touch on the ad if a `new` lead resubmits.

## Leads Inbox UI — `/leads`

New page; the screen telesales lives in. Boring and fast. Reuses the existing account
switcher, design system (Fira Code / DM Sans, OLED dark), and can ring the in-app bell on
a new lead.

- Status filter (New / Contacted / Won / Lost / All), phone+name search, counts header.
- Rows: phone · name · campaign/ad · age · one-tap **[Contacted] [Won] [Lost]**.
- **Won** → inline popover: amount (฿) + optional product → save (sale-capture).
- **Lost** → optional reason dropdown (price / no answer / not interested / …).
- **Reopen** on won/lost rows.
- Row click → drawer: full `lead_events` history, the ad it came from, click-to-copy phone,
  open-chat deep link.
- Speed cues: new leads glow until contacted; count-up timer on uncontacted; keyboard
  flow (`c`/`w`/`l` on focused row).
- **Shared inbox** for v1 (per-agent claim deferred; `lead_events` already supports it).

## True ROAS — `/true-roas`

Deterministic, **no LLM** (numbers never invented). Per ad / adset / campaign over a window:

```
fb_spend       = getLevel() spend        (existing)
fb_revenue     = FB-reported revenue     (existing)
real_revenue   = Σ sale_amount of won leads attributed to it
real_customers = count of won leads
─────────────────────────────────────────────────────────────
TRUE ROAS = real_revenue / fb_spend
TRUE CAC  = fb_spend / real_customers
FB GAP    = (fb_revenue − real_revenue) / fb_revenue      ← lie detector
CVR       = won / leads
```

Table mirrors the dashboard with extra columns: `FB ROAS | TRUE ROAS | Gap | Leads | Won
| CVR | TRUE CAC`. Sortable by TRUE ROAS / Gap.

- **Window basis:** credit a sale to the window the **lead arrived** (ad-centric), so ROAS
  lines up with the spend that caused it.
- **Attribution coverage** badge per row (e.g. "68% of spend has tracked leads") — never
  trust a TRUE ROAS built on thin coverage. Unattributed/manual leads shown separately.

## Closing the loop

- **Rules engine** (`lib/agents/types.ts` `RuleMetric`): add `true_roas`, `true_cac`,
  `real_cvr` as triggerable metrics → e.g. "pause any ad under TRUE ROAS 1.0 with ≥60%
  coverage". Coverage guard: true-ROAS-based automation refuses to act below threshold.
- **Pixel Agents** (`lib/agents/tools.ts`): extend `get_insights` results with the
  true-ROAS block so the AI reasons on reality.
- **Briefing**: new card kind "real loser / hidden winner".

## Build order (each phase ships value alone)

| Phase | Ships | Standalone value |
|---|---|---|
| **1** | `leads` + `lead_events` tables, types, lib/leads store, lead-form polling in cron | Leads stop falling through cracks |
| **2** | `/leads` inbox + API routes (list, add, status, won, lost, reopen) | Telesales tool; sales captured |
| **3** | `/true-roas` page + computation lib | **The payoff — true ROAS / CAC / gap** |
| **4** | Briefing card + rule metrics + agent tool extension | Reality drives automation |

## YAGNI / deferred

- Messenger webhook auto-capture of click-to-message `ref` (manual-add covers v1).
- Per-agent lead claim/ownership.
- Multiple sales per lead / repeat-buyer LTV rollup (reopen handles the case for now).
- Promo/ref-code attribution path (phone/lead-row attribution is enough).
