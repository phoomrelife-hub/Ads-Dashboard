# Ads Dashboard — Campaign Creation Design

**Date:** 2026-06-23
**Status:** Approved design, ready for implementation
**Scope:** Add full "create a new Facebook campaign from scratch" capability to `ads-dashboard`, without leaving the dashboard.

## Goal

Today `ads-dashboard` is read + optimize only. Write actions in `lib/agents/actions.ts` are limited to `set_status` (pause/activate) and `set_budget` on **existing** items. This design adds the ability to build and launch a complete new campaign via the Marketing API.

## Requirements (from brainstorming)

- **Full new campaign** from scratch (campaign → adset → creative → ad).
- **Creative:** support BOTH uploading new image/video AND picking existing Page posts / existing ad creatives.
- **Objectives:** all four — Leads (`OUTCOME_LEADS`), Sales (`OUTCOME_SALES`), Traffic (`OUTCOME_TRAFFIC`), Engagement/Awareness (`OUTCOME_ENGAGEMENT` / `OUTCOME_AWARENESS`).
- **Targeting:** full detailed targeting — geo, age, gender, placements, detailed-targeting search (interests/behaviors/demographics), saved/custom/lookalike audiences, exclusions, live reach estimate.
- **Launch safety:** always create **PAUSED** at all levels. Nothing spends until a human reviews and flips it ACTIVE via the existing `set_status`.

## Architecture

Mirrors the existing pattern: thin API routes → helpers in `lib/fb.ts` → guarded by account scope. The read path is unchanged.

### New backend (in `lib/fb.ts`, reusing `fbPost`/`fbGet`)

**Create chain — 4 sequential POSTs, each id feeds the next:**

1. `createCampaign(act, {objective, name, special_ad_categories})` → `POST /act_<id>/campaigns`
2. `createAdSet(act, {campaign_id, budget, billing_event, optimization_goal, targeting, promoted_object, schedule})` → `POST /act_<id>/adsets`
3. `createCreative(act, {...})` → `POST /act_<id>/adcreatives`
4. `createAd(act, {adset_id, creative})` → `POST /act_<id>/ads`

All four pass `status: "PAUSED"` — hard-coded in the helpers, not a form field.

**Media pipeline:**
- `uploadAdImage(act, file)` → `POST /act_<id>/adimages` → returns `image_hash`
- `uploadAdVideo(act, file)` → `POST /act_<id>/advideos` → returns `video_id`

**Pickers / reads:**
- `getPages()`, `getPagePosts(pageId)`
- `getExistingCreatives(act)`
- `getSavedAudiences(act)`, `getCustomAudiences(act)` (incl. lookalikes)
- `getPixels(act)`
- `searchTargeting(query, type)` → `GET /search`
- `getReachEstimate(act, targeting)` → reach estimate endpoint

### New API routes — `app/api/ads-create/`

- `campaign/route.ts` — the orchestrator (runs all 4 steps + rollback).
- `pickers/*` — lightweight reads the wizard calls while the form is filled (pages, posts, creatives, audiences, pixels).
- `targeting-search/route.ts` — debounced detailed-targeting search + reach estimate.

## UI — multi-step wizard

New route `app/ads-auto/create/page.tsx` (or modal from dashboard). One `draft` object in React state; nothing hits Facebook until the final step. Persistent summary rail.

1. **Account + Objective** — pick scoped account, objective, and `special_ad_categories` (housing/credit/employment/none, required by FB). Objective locks in first; drives valid downstream options.
2. **Budget + Optimization** — name, daily or lifetime budget, schedule, bid strategy, `optimization_goal` + `billing_event` (dropdown filtered to goals valid for the objective). For Leads/Sales: pick pixel + conversion event (`promoted_object`).
3. **Targeting** — geo, age, gender, placements (auto/manual), detailed-targeting search (debounced), saved/custom/lookalike audiences, exclusions. Live reach estimate.
4. **Creative** — toggle Upload new (image/video → media pipeline) vs Use existing (Page post or existing creative). Ad copy: primary text, headline, description, CTA button, destination link.
5. **Review + Launch** — full summary, "Create (Paused)" button → orchestrator → deep-link to new campaign.

## Orchestrator, error handling & rollback

`POST /api/ads-create/campaign` is the only route that writes the chain. Runs the 4 steps sequentially. Media is pre-uploaded in Step 4, so the orchestrator already holds `image_hash` / `video_id` — the atomic chain stays short.

**Rollback:** track created ids; on any failure, delete in reverse order (`DELETE /<id>`) before returning the error. Result is either a complete paused campaign or nothing.

```js
const created = [];
try {
  const c  = await createCampaign(...);                 created.push(c.id);
  const as = await createAdSet({campaign_id: c.id, ...}); created.push(as.id);
  const cr = await createCreative(...);                 // creative_id
  const ad = await createAd({adset_id: as.id, creative: {creative_id: cr.id}}); created.push(ad.id);
  return { ok: true, campaignId: c.id };
} catch (e) {
  for (const id of created.reverse()) await fbDelete(`/${id}`).catch(() => {});
  return { ok: false, error: normalizeFbError(e) };
}
```

**Error surfacing:** `normalizeFbError` extracts `error_user_msg` / `error_subcode` and maps common cases (budget below minimum, missing pixel permission, targeting too narrow, special-ad-category mismatch) to friendly inline messages on the relevant wizard step.

## Guardrails & permissions

- **Account scope:** orchestrator validates target `act_<id>` is owned by the token (reuse `getAccounts()`), consistent with `idBelongsToAccount`.
- **Always PAUSED:** hard-coded at all levels; going live stays a deliberate second action via `set_status`.
- **Budget floor:** validate daily budget ≥ FB minimum for the account currency before calling the API.
- **Token scopes:** writes require `ads_management` (reads need `ads_read`). Add a check in `/api/status` so UI can disable "Create" with a clear reason if missing.

## Testing

- **Unit:** `normalizeFbError` mapping; objective→valid-optimization-goal matrix; budget-floor validation; rollback ordering (mock `fbPost` to throw at each step, assert reverse-delete).
- **Integration (sandbox):** Facebook sandbox ad account (no real spend) — run full chain, confirm paused campaign appears.
- **Manual smoke:** create one real campaign PAUSED in a live account, verify in Ads Manager, delete.

## Build order

1. Pickers + read helpers (low risk).
2. Media pipeline.
3. Create chain + rollback orchestrator.
4. Wizard UI.
