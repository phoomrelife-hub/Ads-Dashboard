# Ads Campaign Creation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full "create a new Facebook campaign from scratch" flow (campaign → adset → creative → ad) to `ads-dashboard`, launched always-PAUSED, with a 5-step wizard UI.

**Architecture:** Mirror the existing pattern — pure logic in small modules, transport via the existing `lib/fb.ts` Graph client (`API`/`authParams`/`fbPost`), thin Next.js API routes under `app/api/ads-create/`, and a client wizard that holds one `draft` object and only writes to Facebook on the final step. The 4-step create chain is atomic: on any failure it deletes what it created in reverse order.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript 5, Tailwind v4, Facebook Marketing API v21.0. Tests via Node's built-in `node:test` runner executed through `tsx`.

## Global Constraints

- **Graph API version:** `v21.0` — reuse the existing `API` constant in `lib/fb.ts`. Do not hardcode the version elsewhere.
- **Auth:** every Graph call MUST go through `authParams()` in `lib/fb.ts` so `access_token` + `appsecret_proof` are attached. Never build auth query strings by hand.
- **Always PAUSED:** `status: "PAUSED"` is hard-coded inside the create helpers at campaign, adset, and ad level. It is NOT a parameter and NOT a form field.
- **Money safety:** the orchestrator validates the target account is owned by the token before any write, and validates the budget floor before calling Facebook.
- **Token scope:** writes require the token to have `ads_management`. Reads use `ads_read`.
- **Git:** this directory is not yet a git repo. Run `git init` once before Task 1 if you want the commit steps to work; otherwise skip the `git commit` step in each task (the rest of the task still applies).
- **No new runtime deps:** only `tsx` may be added, and only as a devDependency for tests.
- **Currency unit:** Facebook budgets are in minor units (cents). The UI collects major units (e.g. dollars/baht); helpers convert with `Math.round(amount * 100)`.

---

## File Structure

- `lib/ads-create/spec.ts` (new) — pure, dependency-free logic: objective list, valid optimization goals per objective, budget-floor validation, `normalizeFbError`. Unit-tested.
- `lib/ads-create/spec.test.ts` (new) — tests for the above.
- `lib/ads-create/chain.ts` (new) — `createCampaignChain` orchestrator with dependency injection for testability, plus the typed `CampaignDraft` shape.
- `lib/ads-create/chain.test.ts` (new) — rollback-ordering tests with mocked step deps.
- `lib/fb.ts` (modify) — add transport: `fbDelete`, multipart `fbPostMultipart`, richer error preservation, and the create/media/picker helpers (or re-export them). Reuses existing private `API`/`authParams`.
- `app/api/ads-create/campaign/route.ts` (new) — orchestrator route.
- `app/api/ads-create/pickers/route.ts` (new) — pages/posts/creatives/audiences/pixels reads.
- `app/api/ads-create/targeting-search/route.ts` (new) — detailed-targeting search + reach estimate.
- `app/ads-auto/create/page.tsx` (new) — the 5-step wizard.
- `app/ads-auto/create/steps/*.tsx` (new) — one component per wizard step.
- `package.json` (modify) — add `tsx` devDep + `test` script.

---

## Task 0: Test tooling

**Files:**
- Modify: `package.json:5-10` (scripts), `package.json:26-36` (devDependencies)

**Interfaces:**
- Produces: `npm test` runs `node --import tsx --test "lib/**/*.test.ts"`.

- [ ] **Step 1: Add tsx devDependency**

Run: `npm install --save-dev tsx`
Expected: `tsx` appears under `devDependencies` in `package.json`.

- [ ] **Step 2: Add the test script**

In `package.json`, add to `"scripts"`:

```json
    "test": "node --import tsx --test \"lib/**/*.test.ts\""
```

- [ ] **Step 3: Verify the runner works with a throwaway test**

Create `lib/ads-create/smoke.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";

test("runner works", () => {
  assert.equal(1 + 1, 2);
});
```

Run: `npm test`
Expected: `pass 1` in output.

- [ ] **Step 4: Delete the throwaway test**

Run: `rm lib/ads-create/smoke.test.ts`

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add tsx test runner for ads-create"
```

---

## Task 1: Pure spec helpers

**Files:**
- Create: `lib/ads-create/spec.ts`
- Test: `lib/ads-create/spec.test.ts`

**Interfaces:**
- Produces:
  - `type Objective = "OUTCOME_LEADS" | "OUTCOME_SALES" | "OUTCOME_TRAFFIC" | "OUTCOME_ENGAGEMENT" | "OUTCOME_AWARENESS"`
  - `OBJECTIVES: { value: Objective; label: string }[]`
  - `optimizationGoalsFor(objective: Objective): string[]`
  - `billingEventFor(optimizationGoal: string): string`
  - `validateBudgetFloor(amountMajor: number, currency: string): string | null` — returns an error message or `null` if OK.
  - `normalizeFbError(err: unknown): { message: string; hint?: string }`

- [ ] **Step 1: Write the failing test**

Create `lib/ads-create/spec.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  OBJECTIVES,
  optimizationGoalsFor,
  billingEventFor,
  validateBudgetFloor,
  normalizeFbError,
} from "./spec";

test("OBJECTIVES covers all four asked-for objectives", () => {
  const values = OBJECTIVES.map((o) => o.value);
  assert.ok(values.includes("OUTCOME_LEADS"));
  assert.ok(values.includes("OUTCOME_SALES"));
  assert.ok(values.includes("OUTCOME_TRAFFIC"));
  assert.ok(values.includes("OUTCOME_ENGAGEMENT") || values.includes("OUTCOME_AWARENESS"));
});

test("optimizationGoalsFor returns lead goals for OUTCOME_LEADS", () => {
  const goals = optimizationGoalsFor("OUTCOME_LEADS");
  assert.ok(goals.includes("LEAD_GENERATION") || goals.includes("OFFSITE_CONVERSIONS"));
  assert.ok(goals.length > 0);
});

test("optimizationGoalsFor returns conversion goal for OUTCOME_SALES", () => {
  assert.ok(optimizationGoalsFor("OUTCOME_SALES").includes("OFFSITE_CONVERSIONS"));
});

test("billingEventFor maps a known goal to a valid billing event", () => {
  assert.equal(typeof billingEventFor("LINK_CLICKS"), "string");
  assert.ok(billingEventFor("LINK_CLICKS").length > 0);
});

test("validateBudgetFloor rejects below minimum and accepts above", () => {
  assert.notEqual(validateBudgetFloor(0.1, "USD"), null);
  assert.equal(validateBudgetFloor(50, "USD"), null);
});

test("normalizeFbError extracts error_user_msg when present", () => {
  const e = new Error("Graph fail");
  (e as any).fbError = { message: "raw", error_user_msg: "Budget too low", error_subcode: 1487293 };
  const out = normalizeFbError(e);
  assert.equal(out.message, "Budget too low");
});

test("normalizeFbError falls back to message string", () => {
  assert.equal(normalizeFbError(new Error("boom")).message, "boom");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot find module `./spec`.

- [ ] **Step 3: Write the implementation**

Create `lib/ads-create/spec.ts`:

```ts
// Pure, dependency-free spec logic for campaign creation. No network, no Node APIs.

export type Objective =
  | "OUTCOME_LEADS"
  | "OUTCOME_SALES"
  | "OUTCOME_TRAFFIC"
  | "OUTCOME_ENGAGEMENT"
  | "OUTCOME_AWARENESS";

export const OBJECTIVES: { value: Objective; label: string }[] = [
  { value: "OUTCOME_LEADS", label: "Leads" },
  { value: "OUTCOME_SALES", label: "Sales" },
  { value: "OUTCOME_TRAFFIC", label: "Traffic" },
  { value: "OUTCOME_ENGAGEMENT", label: "Engagement" },
  { value: "OUTCOME_AWARENESS", label: "Awareness" },
];

// Optimization goals valid for each objective (subset of Meta's enum that the UI exposes).
const GOALS: Record<Objective, string[]> = {
  OUTCOME_LEADS: ["LEAD_GENERATION", "OFFSITE_CONVERSIONS", "QUALITY_LEAD"],
  OUTCOME_SALES: ["OFFSITE_CONVERSIONS", "VALUE"],
  OUTCOME_TRAFFIC: ["LINK_CLICKS", "LANDING_PAGE_VIEWS"],
  OUTCOME_ENGAGEMENT: ["POST_ENGAGEMENT", "PAGE_LIKES", "THRUPLAY"],
  OUTCOME_AWARENESS: ["REACH", "AD_RECALL_LIFT", "IMPRESSIONS"],
};

export function optimizationGoalsFor(objective: Objective): string[] {
  return GOALS[objective] ?? [];
}

// Billing event valid for a given optimization goal. Meta requires the pair to be compatible.
const BILLING: Record<string, string> = {
  LINK_CLICKS: "LINK_CLICKS",
  LANDING_PAGE_VIEWS: "IMPRESSIONS",
  OFFSITE_CONVERSIONS: "IMPRESSIONS",
  VALUE: "IMPRESSIONS",
  LEAD_GENERATION: "IMPRESSIONS",
  QUALITY_LEAD: "IMPRESSIONS",
  POST_ENGAGEMENT: "IMPRESSIONS",
  PAGE_LIKES: "IMPRESSIONS",
  THRUPLAY: "IMPRESSIONS",
  REACH: "IMPRESSIONS",
  AD_RECALL_LIFT: "IMPRESSIONS",
  IMPRESSIONS: "IMPRESSIONS",
};

export function billingEventFor(optimizationGoal: string): string {
  return BILLING[optimizationGoal] ?? "IMPRESSIONS";
}

// Per-currency daily budget minimums in MAJOR units (approximate Meta floors; conservative).
const BUDGET_FLOOR_MAJOR: Record<string, number> = {
  USD: 1, EUR: 1, GBP: 1, THB: 40, JPY: 100, AUD: 1, SGD: 1,
};

export function validateBudgetFloor(amountMajor: number, currency: string): string | null {
  if (!Number.isFinite(amountMajor) || amountMajor <= 0) return "Enter a budget greater than 0.";
  const floor = BUDGET_FLOOR_MAJOR[currency] ?? 1;
  if (amountMajor < floor) return `Daily budget must be at least ${floor} ${currency}.`;
  return null;
}

// Map a thrown Graph error to a human message. fb.ts attaches the raw error object as `.fbError`.
export function normalizeFbError(err: unknown): { message: string; hint?: string } {
  const fb = (err as any)?.fbError;
  if (fb) {
    const msg = fb.error_user_msg || fb.message || "Facebook rejected the request.";
    const hint = fb.error_user_title || undefined;
    return { message: String(msg), hint };
  }
  if (err instanceof Error) return { message: err.message };
  return { message: String(err) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: all spec tests `pass`.

- [ ] **Step 5: Commit**

```bash
git add lib/ads-create/spec.ts lib/ads-create/spec.test.ts
git commit -m "feat: campaign-creation spec helpers (objectives, goals, budget floor, error mapping)"
```

---

## Task 2: Transport helpers in lib/fb.ts

**Files:**
- Modify: `lib/fb.ts` (after the existing `fbPost`, around line 121)

**Interfaces:**
- Consumes: existing private `API`, `authParams`, `respCache` in `lib/fb.ts`.
- Produces:
  - `fbPost` is updated to attach the raw error object as `(error as any).fbError` before throwing (so `normalizeFbError` can read it). Signature unchanged.
  - `fbDelete(p: string): Promise<any>`
  - `fbPostMultipart(p: string, fields: Record<string, string>, file: { name: string; type: string; buffer: Buffer }, fileField: string): Promise<any>`

- [ ] **Step 1: Update fbPost to preserve the raw error**

In `lib/fb.ts`, replace the body of the existing `fbPost` error throw. Change:

```ts
  if (j.error) throw new Error(j.error.message);
```

to:

```ts
  if (j.error) {
    const e = new Error(j.error.message);
    (e as any).fbError = j.error;
    throw e;
  }
```

- [ ] **Step 2: Add fbDelete and fbPostMultipart**

Immediately after `fbPost` (after the closing brace near line 121), add:

```ts
// DELETE a Graph node (used by the create-chain rollback). Mirrors fbPost's error handling.
export async function fbDelete(p: string): Promise<any> {
  const u = new URL(API + p);
  u.search = authParams().toString();
  const j = await (await fetch(u.toString(), { method: "DELETE" })).json();
  if (j.error) {
    const e = new Error(j.error.message);
    (e as any).fbError = j.error;
    throw e;
  }
  respCache.clear();
  return j;
}

// POST multipart/form-data — required for ad image/video uploads. Auth goes in the query string.
export async function fbPostMultipart(
  p: string,
  fields: Record<string, string>,
  file: { name: string; type: string; buffer: Buffer },
  fileField: string,
): Promise<any> {
  const u = new URL(API + p);
  u.search = authParams().toString();
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  form.append(fileField, new Blob([new Uint8Array(file.buffer)], { type: file.type }), file.name);
  const j = await (await fetch(u.toString(), { method: "POST", body: form })).json();
  if (j.error) {
    const e = new Error(j.error.message);
    (e as any).fbError = j.error;
    throw e;
  }
  respCache.clear();
  return j;
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run build`
Expected: build succeeds (no TypeScript errors). If the build attempts to hit the network, instead run `npx tsc --noEmit` and expect no type errors.

- [ ] **Step 4: Commit**

```bash
git add lib/fb.ts
git commit -m "feat: fbDelete + fbPostMultipart transport, preserve raw fb error"
```

---

## Task 3: Create-chain orchestrator (with rollback)

**Files:**
- Create: `lib/ads-create/chain.ts`
- Test: `lib/ads-create/chain.test.ts`

**Interfaces:**
- Consumes: `Objective` from `./spec`.
- Produces:
  - `CampaignDraft` type (see code).
  - `type ChainDeps = { createCampaign; createAdSet; createCreative; createAd; del }` — injectable step functions.
  - `createCampaignChain(act: string, draft: CampaignDraft, deps: ChainDeps): Promise<{ ok: true; campaignId: string } | { ok: false; error: { message: string; hint?: string } }>`
  - Default real deps `realChainDeps(act)` wiring to `lib/fb.ts` create helpers (added in Task 5b below — for now `realChainDeps` lives here and calls the fb.ts helpers once they exist; this task only needs the pure orchestrator + tests).

- [ ] **Step 1: Write the failing test (rollback ordering)**

Create `lib/ads-create/chain.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { createCampaignChain, type CampaignDraft, type ChainDeps } from "./chain";

const draft: CampaignDraft = {
  name: "Test",
  objective: "OUTCOME_TRAFFIC",
  specialAdCategories: [],
  dailyBudgetMajor: 50,
  currency: "USD",
  optimizationGoal: "LINK_CLICKS",
  targeting: { geo_locations: { countries: ["US"] } },
  creative: { mode: "existing_creative", creativeId: "111" },
};

function depsThatSucceed(calls: string[]): ChainDeps {
  return {
    createCampaign: async () => { calls.push("campaign"); return { id: "c1" }; },
    createAdSet: async () => { calls.push("adset"); return { id: "as1" }; },
    createCreative: async () => { calls.push("creative"); return { id: "cr1" }; },
    createAd: async () => { calls.push("ad"); return { id: "ad1" }; },
    del: async (id: string) => { calls.push("del:" + id); },
  };
}

test("happy path returns campaignId and creates nothing extra", async () => {
  const calls: string[] = [];
  const res = await createCampaignChain("act_1", draft, depsThatSucceed(calls));
  assert.deepEqual(res, { ok: true, campaignId: "c1" });
  assert.deepEqual(calls, ["campaign", "adset", "creative", "ad"]);
});

test("failure at creative deletes adset then campaign in reverse order", async () => {
  const calls: string[] = [];
  const deps = depsThatSucceed(calls);
  deps.createCreative = async () => { calls.push("creative"); throw Object.assign(new Error("bad creative"), { fbError: { error_user_msg: "Bad creative" } }); };
  const res = await createCampaignChain("act_1", draft, deps);
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.message, "Bad creative");
  // created campaign + adset, then rolled back adset (as1) before campaign (c1)
  assert.deepEqual(calls, ["campaign", "adset", "creative", "del:as1", "del:c1"]);
});

test("failure at first step rolls back nothing", async () => {
  const calls: string[] = [];
  const deps = depsThatSucceed(calls);
  deps.createCampaign = async () => { calls.push("campaign"); throw new Error("nope"); };
  const res = await createCampaignChain("act_1", draft, deps);
  assert.equal(res.ok, false);
  assert.deepEqual(calls, ["campaign"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot find module `./chain`.

- [ ] **Step 3: Write the implementation**

Create `lib/ads-create/chain.ts`:

```ts
import type { Objective } from "./spec";
import { normalizeFbError } from "./spec";

export type CreativeDraft =
  | { mode: "existing_creative"; creativeId: string }
  | { mode: "existing_post"; pageId: string; postId: string }
  | {
      mode: "upload";
      pageId: string;
      imageHash?: string;
      videoId?: string;
      message: string;
      headline: string;
      description?: string;
      link: string;
      cta: string;
    };

export interface CampaignDraft {
  name: string;
  objective: Objective;
  specialAdCategories: string[];
  dailyBudgetMajor?: number;
  lifetimeBudgetMajor?: number;
  currency: string;
  optimizationGoal: string;
  targeting: Record<string, unknown>;
  promotedObject?: { pixel_id?: string; custom_event_type?: string; page_id?: string };
  schedule?: { start_time?: string; end_time?: string };
  creative: CreativeDraft;
}

export interface ChainDeps {
  createCampaign: (act: string, draft: CampaignDraft) => Promise<{ id: string }>;
  createAdSet: (act: string, draft: CampaignDraft, campaignId: string) => Promise<{ id: string }>;
  createCreative: (act: string, draft: CampaignDraft) => Promise<{ id: string }>;
  createAd: (act: string, draft: CampaignDraft, adsetId: string, creativeId: string) => Promise<{ id: string }>;
  del: (id: string) => Promise<void>;
}

type ChainResult =
  | { ok: true; campaignId: string }
  | { ok: false; error: { message: string; hint?: string } };

// Atomic 4-step create. On any failure, delete created nodes in reverse order.
export async function createCampaignChain(
  act: string,
  draft: CampaignDraft,
  deps: ChainDeps,
): Promise<ChainResult> {
  const created: string[] = [];
  try {
    const c = await deps.createCampaign(act, draft);
    created.push(c.id);
    const as = await deps.createAdSet(act, draft, c.id);
    created.push(as.id);
    const cr = await deps.createCreative(act, draft);
    const ad = await deps.createAd(act, draft, as.id, cr.id);
    created.push(ad.id);
    return { ok: true, campaignId: c.id };
  } catch (e) {
    for (const id of [...created].reverse()) {
      try { await deps.del(id); } catch { /* best-effort rollback */ }
    }
    return { ok: false, error: normalizeFbError(e) };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: the three chain tests `pass`.

- [ ] **Step 5: Commit**

```bash
git add lib/ads-create/chain.ts lib/ads-create/chain.test.ts
git commit -m "feat: atomic campaign create chain with reverse-order rollback"
```

---

## Task 4: Create + media helpers in lib/fb.ts

**Files:**
- Modify: `lib/fb.ts` (append near the other exports)

**Interfaces:**
- Consumes: `fbPost`, `fbPostMultipart`, `fbDelete` (Task 2); `CampaignDraft` from `lib/ads-create/chain`; spec helpers.
- Produces (all hard-code `status: "PAUSED"` where applicable):
  - `createCampaign(act, draft): Promise<{ id: string }>`
  - `createAdSet(act, draft, campaignId): Promise<{ id: string }>`
  - `createCreative(act, draft): Promise<{ id: string }>`
  - `createAd(act, draft, adsetId, creativeId): Promise<{ id: string }>`
  - `uploadAdImage(act, file): Promise<{ image_hash: string }>`
  - `uploadAdVideo(act, file): Promise<{ video_id: string }>`
  - `realChainDeps(): ChainDeps`

- [ ] **Step 1: Write the implementation**

Append to `lib/fb.ts`:

```ts
import type { CampaignDraft, ChainDeps } from "./ads-create/chain";
import { billingEventFor } from "./ads-create/spec";

const toCents = (major: number) => String(Math.round(major * 100));

export async function createCampaign(act: string, d: CampaignDraft): Promise<{ id: string }> {
  const j = await fbPost(`/${act}/campaigns`, {
    name: d.name,
    objective: d.objective,
    status: "PAUSED",
    special_ad_categories: JSON.stringify(d.specialAdCategories ?? []),
  });
  return { id: j.id };
}

export async function createAdSet(act: string, d: CampaignDraft, campaignId: string): Promise<{ id: string }> {
  const params: Record<string, string> = {
    name: `${d.name} — Ad Set`,
    campaign_id: campaignId,
    status: "PAUSED",
    optimization_goal: d.optimizationGoal,
    billing_event: billingEventFor(d.optimizationGoal),
    targeting: JSON.stringify(d.targeting),
  };
  if (d.dailyBudgetMajor != null) params.daily_budget = toCents(d.dailyBudgetMajor);
  if (d.lifetimeBudgetMajor != null) params.lifetime_budget = toCents(d.lifetimeBudgetMajor);
  if (d.schedule?.start_time) params.start_time = d.schedule.start_time;
  if (d.schedule?.end_time) params.end_time = d.schedule.end_time;
  if (d.promotedObject) params.promoted_object = JSON.stringify(d.promotedObject);
  // Lifetime budgets require an end_time; daily budgets don't.
  const j = await fbPost(`/${act}/adsets`, params);
  return { id: j.id };
}

export async function createCreative(act: string, d: CampaignDraft): Promise<{ id: string }> {
  const c = d.creative;
  if (c.mode === "existing_creative") return { id: c.creativeId };

  let object_story_spec: Record<string, unknown>;
  if (c.mode === "existing_post") {
    object_story_spec = { page_id: c.pageId };
    const j = await fbPost(`/${act}/adcreatives`, {
      name: `${d.name} — Creative`,
      object_story_id: `${c.pageId}_${c.postId}`,
    });
    return { id: j.id };
  } else {
    // upload mode — image or video link ad
    const link_data: Record<string, unknown> = {
      message: c.message,
      link: c.link,
      name: c.headline,
      description: c.description,
      call_to_action: { type: c.cta, value: { link: c.link } },
    };
    if (c.imageHash) link_data.image_hash = c.imageHash;
    if (c.videoId) link_data.video_id = c.videoId;
    object_story_spec = { page_id: c.pageId, link_data };
    const j = await fbPost(`/${act}/adcreatives`, {
      name: `${d.name} — Creative`,
      object_story_spec: JSON.stringify(object_story_spec),
    });
    return { id: j.id };
  }
}

export async function createAd(act: string, d: CampaignDraft, adsetId: string, creativeId: string): Promise<{ id: string }> {
  const j = await fbPost(`/${act}/ads`, {
    name: `${d.name} — Ad`,
    adset_id: adsetId,
    status: "PAUSED",
    creative: JSON.stringify({ creative_id: creativeId }),
  });
  return { id: j.id };
}

export async function uploadAdImage(act: string, file: { name: string; type: string; buffer: Buffer }): Promise<{ image_hash: string }> {
  const j = await fbPostMultipart(`/${act}/adimages`, {}, file, "file");
  // Response shape: { images: { <filename>: { hash, url } } }
  const first: any = Object.values(j.images ?? {})[0];
  return { image_hash: first?.hash };
}

export async function uploadAdVideo(act: string, file: { name: string; type: string; buffer: Buffer }): Promise<{ video_id: string }> {
  const j = await fbPostMultipart(`/${act}/advideos`, {}, file, "source");
  return { video_id: j.id };
}

export function realChainDeps(): ChainDeps {
  return {
    createCampaign: (act, d) => createCampaign(act, d),
    createAdSet: (act, d, cid) => createAdSet(act, d, cid),
    createCreative: (act, d) => createCreative(act, d),
    createAd: (act, d, asid, crid) => createAd(act, d, asid, crid),
    del: async (id) => { await fbDelete(`/${id}`); },
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no type errors. Confirm `createCreative`'s unused `object_story_spec` in the `existing_post` branch is removed if `tsc` flags it (it is unused there — delete the `object_story_spec = { page_id: c.pageId };` line in that branch).

- [ ] **Step 3: Commit**

```bash
git add lib/fb.ts
git commit -m "feat: campaign/adset/creative/ad create + media upload helpers (always PAUSED)"
```

---

## Task 5: Picker + targeting read helpers in lib/fb.ts

**Files:**
- Modify: `lib/fb.ts` (append)

**Interfaces:**
- Consumes: `fbGet` (existing).
- Produces:
  - `getPages(): Promise<{ id: string; name: string }[]>`
  - `getPagePosts(pageId: string): Promise<{ id: string; message: string }[]>`
  - `getExistingCreatives(act: string): Promise<{ id: string; name: string }[]>`
  - `getCustomAudiences(act: string): Promise<{ id: string; name: string; type: string }[]>`
  - `getPixels(act: string): Promise<{ id: string; name: string }[]>`
  - `searchTargeting(q: string, type: string): Promise<{ id: string; name: string; type: string }[]>`
  - `getReachEstimate(act: string, targeting: Record<string, unknown>, optimizationGoal: string): Promise<{ users_lower_bound: number; users_upper_bound: number }>`

- [ ] **Step 1: Write the implementation**

Append to `lib/fb.ts`:

```ts
export async function getPages(): Promise<{ id: string; name: string }[]> {
  const j = await fbGet(`/me/accounts`, { fields: "id,name", limit: "100" });
  return (j.data ?? []).map((p: any) => ({ id: p.id, name: p.name }));
}

export async function getPagePosts(pageId: string): Promise<{ id: string; message: string }[]> {
  const j = await fbGet(`/${pageId}/posts`, { fields: "id,message,created_time", limit: "50" });
  return (j.data ?? []).map((p: any) => ({ id: p.id.split("_").pop(), message: p.message ?? "(no text)" }));
}

export async function getExistingCreatives(act: string): Promise<{ id: string; name: string }[]> {
  const j = await fbGet(`/${act}/adcreatives`, { fields: "id,name", limit: "100" });
  return (j.data ?? []).map((c: any) => ({ id: c.id, name: c.name ?? c.id }));
}

export async function getCustomAudiences(act: string): Promise<{ id: string; name: string; type: string }[]> {
  const j = await fbGet(`/${act}/customaudiences`, { fields: "id,name,subtype", limit: "100" });
  return (j.data ?? []).map((a: any) => ({ id: a.id, name: a.name, type: a.subtype ?? "CUSTOM" }));
}

export async function getPixels(act: string): Promise<{ id: string; name: string }[]> {
  const j = await fbGet(`/${act}/adspixels`, { fields: "id,name", limit: "50" });
  return (j.data ?? []).map((p: any) => ({ id: p.id, name: p.name ?? p.id }));
}

export async function searchTargeting(q: string, type: string): Promise<{ id: string; name: string; type: string }[]> {
  const j = await fbGet(`/search`, { type, q, limit: "25" });
  return (j.data ?? []).map((t: any) => ({ id: t.id, name: t.name, type: t.type ?? type }));
}

export async function getReachEstimate(
  act: string,
  targeting: Record<string, unknown>,
  optimizationGoal: string,
): Promise<{ users_lower_bound: number; users_upper_bound: number }> {
  const j = await fbGet(`/${act}/reachestimate`, {
    targeting_spec: JSON.stringify(targeting),
    optimization_goal: optimizationGoal,
  });
  const d = j.data ?? {};
  return { users_lower_bound: d.users_lower_bound ?? 0, users_upper_bound: d.users_upper_bound ?? 0 };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add lib/fb.ts
git commit -m "feat: picker + targeting-search + reach-estimate read helpers"
```

---

## Task 6: Orchestrator API route + account-scope guard

**Files:**
- Create: `app/api/ads-create/campaign/route.ts`

**Interfaces:**
- Consumes: `createCampaignChain`, `realChainDeps`, `getAccounts`, `validateBudgetFloor`.
- Produces: `POST /api/ads-create/campaign` → `{ ok, campaignId } | { ok: false, error }`.

- [ ] **Step 1: Write the route**

Create `app/api/ads-create/campaign/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getAccounts, realChainDeps } from "@/lib/fb";
import { createCampaignChain, type CampaignDraft } from "@/lib/ads-create/chain";
import { validateBudgetFloor } from "@/lib/ads-create/spec";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { act, draft } = (await req.json()) as { act: string; draft: CampaignDraft };
    if (!act || !draft) return NextResponse.json({ ok: false, error: { message: "Missing act or draft" } }, { status: 400 });

    // Guardrail 1: account must belong to this token.
    const accounts = await getAccounts();
    if (!accounts.some((a: any) => String(a.id) === String(act))) {
      return NextResponse.json({ ok: false, error: { message: "Account not in scope for this token" } }, { status: 403 });
    }

    // Guardrail 2: budget floor (daily budgets only; lifetime is validated client-side against the same rule).
    if (draft.dailyBudgetMajor != null) {
      const budErr = validateBudgetFloor(draft.dailyBudgetMajor, draft.currency);
      if (budErr) return NextResponse.json({ ok: false, error: { message: budErr } }, { status: 400 });
    }

    const result = await createCampaignChain(act, draft, realChainDeps());
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: { message: e.message } }, { status: 500 });
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no type errors. (If `getAccounts` returns a typed array, adjust the `.some` predicate to match its element type.)

- [ ] **Step 3: Commit**

```bash
git add app/api/ads-create/campaign/route.ts
git commit -m "feat: campaign orchestrator route with account-scope + budget guards"
```

---

## Task 7: Picker + targeting-search routes

**Files:**
- Create: `app/api/ads-create/pickers/route.ts`
- Create: `app/api/ads-create/targeting-search/route.ts`

**Interfaces:**
- Consumes: picker helpers + `searchTargeting`/`getReachEstimate` from Task 5.
- Produces:
  - `GET /api/ads-create/pickers?kind=pages|posts|creatives|audiences|pixels&act=&pageId=`
  - `GET /api/ads-create/targeting-search?q=&type=adinterest`
  - `POST /api/ads-create/targeting-search` (reach estimate) → `{ act, targeting, optimizationGoal }`

- [ ] **Step 1: Write the pickers route**

Create `app/api/ads-create/pickers/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getPages, getPagePosts, getExistingCreatives, getCustomAudiences, getPixels } from "@/lib/fb";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const kind = sp.get("kind");
  const act = sp.get("act") ?? "";
  const pageId = sp.get("pageId") ?? "";
  try {
    switch (kind) {
      case "pages": return NextResponse.json({ data: await getPages() });
      case "posts": return NextResponse.json({ data: await getPagePosts(pageId) });
      case "creatives": return NextResponse.json({ data: await getExistingCreatives(act) });
      case "audiences": return NextResponse.json({ data: await getCustomAudiences(act) });
      case "pixels": return NextResponse.json({ data: await getPixels(act) });
      default: return NextResponse.json({ error: "unknown kind" }, { status: 400 });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Write the targeting-search route**

Create `app/api/ads-create/targeting-search/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { searchTargeting, getReachEstimate } from "@/lib/fb";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q") ?? "";
  const type = sp.get("type") ?? "adinterest";
  try {
    return NextResponse.json({ data: await searchTargeting(q, type) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { act, targeting, optimizationGoal } = await req.json();
    return NextResponse.json({ data: await getReachEstimate(act, targeting, optimizationGoal) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/ads-create/pickers/route.ts app/api/ads-create/targeting-search/route.ts
git commit -m "feat: picker + targeting-search API routes"
```

---

## Task 8: Wizard UI

**Files:**
- Create: `app/ads-auto/create/page.tsx`
- Create: `app/ads-auto/create/steps/objective.tsx`
- Create: `app/ads-auto/create/steps/budget.tsx`
- Create: `app/ads-auto/create/steps/targeting.tsx`
- Create: `app/ads-auto/create/steps/creative.tsx`
- Create: `app/ads-auto/create/steps/review.tsx`

**Interfaces:**
- Consumes: the API routes from Tasks 6–7; types from `lib/ads-create/chain` and `lib/ads-create/spec`.
- Produces: a client-side wizard managing one `CampaignDraft` in state; only the Review step POSTs to `/api/ads-create/campaign`.

**Note on conventions:** match the existing dashboard component style (look at `components/dashboard.tsx`, `components/agents/agent-create-modal.tsx`, `app/ads-auto/page.tsx`) for layout, Tailwind classes, fonts, and the OLED dark theme before writing markup. Reuse existing UI primitives (`@base-ui/react`, buttons, modals) rather than inventing new ones.

- [ ] **Step 1: Scaffold the wizard shell with step state**

Create `app/ads-auto/create/page.tsx`:

```tsx
"use client";
import { useState } from "react";
import type { CampaignDraft } from "@/lib/ads-create/chain";
import ObjectiveStep from "./steps/objective";
import BudgetStep from "./steps/budget";
import TargetingStep from "./steps/targeting";
import CreativeStep from "./steps/creative";
import ReviewStep from "./steps/review";

const STEPS = ["Account & Objective", "Budget & Optimization", "Targeting", "Creative", "Review"];

const EMPTY: Partial<CampaignDraft> & { act?: string } = {
  specialAdCategories: [],
  currency: "USD",
  targeting: { geo_locations: { countries: ["US"] } },
};

export default function CreateCampaignPage() {
  const [step, setStep] = useState(0);
  const [act, setAct] = useState("");
  const [draft, setDraft] = useState<Partial<CampaignDraft>>(EMPTY);
  const patch = (p: Partial<CampaignDraft>) => setDraft((d) => ({ ...d, ...p }));

  const next = () => setStep((s) => Math.min(STEPS.length - 1, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  return (
    <div className="mx-auto max-w-3xl p-6">
      <ol className="mb-6 flex gap-2 text-xs">
        {STEPS.map((label, i) => (
          <li key={label} className={i === step ? "font-bold" : "opacity-50"}>{i + 1}. {label}</li>
        ))}
      </ol>
      {step === 0 && <ObjectiveStep act={act} setAct={setAct} draft={draft} patch={patch} onNext={next} />}
      {step === 1 && <BudgetStep draft={draft} patch={patch} onNext={next} onBack={back} />}
      {step === 2 && <TargetingStep act={act} draft={draft} patch={patch} onNext={next} onBack={back} />}
      {step === 3 && <CreativeStep act={act} draft={draft} patch={patch} onNext={next} onBack={back} />}
      {step === 4 && <ReviewStep act={act} draft={draft} onBack={back} />}
    </div>
  );
}
```

- [ ] **Step 2: Build the Objective step**

Create `app/ads-auto/create/steps/objective.tsx`. It loads accounts from the existing accounts endpoint (check `app/api/status/route.ts` / how `app/ads-auto/page.tsx` lists accounts and reuse that), renders an account `<select>`, the `OBJECTIVES` radio group, and a `special_ad_categories` multi-select (`NONE`, `HOUSING`, `CREDIT`, `EMPLOYMENT`). On "Next" it calls `patch({ objective, specialAdCategories })` and `onNext()`. Disable Next until an account + objective are chosen.

```tsx
"use client";
import { OBJECTIVES, type Objective } from "@/lib/ads-create/spec";
import type { CampaignDraft } from "@/lib/ads-create/chain";

export default function ObjectiveStep(props: {
  act: string; setAct: (a: string) => void;
  draft: Partial<CampaignDraft>; patch: (p: Partial<CampaignDraft>) => void; onNext: () => void;
}) {
  const { act, setAct, draft, patch, onNext } = props;
  // TODO: fetch accounts via the same endpoint app/ads-auto/page.tsx uses; render <select> bound to setAct.
  return (
    <div className="space-y-4">
      <label className="block">Account
        <input className="ml-2 border" value={act} onChange={(e) => setAct(e.target.value)} placeholder="act_..." />
      </label>
      <fieldset className="space-y-1">
        {OBJECTIVES.map((o) => (
          <label key={o.value} className="block">
            <input type="radio" name="obj" checked={draft.objective === o.value}
              onChange={() => patch({ objective: o.value as Objective })} /> {o.label}
          </label>
        ))}
      </fieldset>
      <button disabled={!act || !draft.objective} onClick={onNext} className="rounded bg-white/10 px-3 py-1 disabled:opacity-40">Next</button>
    </div>
  );
}
```

- [ ] **Step 3: Build the Budget step**

Create `app/ads-auto/create/steps/budget.tsx`: name input, daily/lifetime budget toggle + amount, currency, start/end datetime, optimization-goal `<select>` populated by `optimizationGoalsFor(draft.objective)`, and (when objective is `OUTCOME_LEADS`/`OUTCOME_SALES`) a pixel `<select>` loaded from `/api/ads-create/pickers?kind=pixels&act=` plus a conversion-event input → set `draft.promotedObject`. Validate budget with `validateBudgetFloor` and show the message inline; disable Next until valid.

- [ ] **Step 4: Build the Targeting step**

Create `app/ads-auto/create/steps/targeting.tsx`: country multi-select, age min/max, gender, placements (auto vs manual toggle), a debounced detailed-targeting search box hitting `GET /api/ads-create/targeting-search?q=&type=adinterest` that appends chosen items into `targeting.flexible_spec`, a custom-audience picker from `pickers?kind=audiences`, an exclusions field, and a live reach estimate via `POST /api/ads-create/targeting-search`. Write the assembled spec with `patch({ targeting })`.

- [ ] **Step 5: Build the Creative step**

Create `app/ads-auto/create/steps/creative.tsx`: a mode toggle — "Upload new" vs "Use existing post" vs "Use existing creative". Upload mode: a Page `<select>` (`pickers?kind=pages`), a file input, and copy fields (message, headline, description, link, CTA `<select>`); on file change, POST the file to a small upload route OR send as base64 to the orchestrator (recommended: add an upload step that calls `uploadAdImage`/`uploadAdVideo` and stores the returned hash/id in the draft). Existing-post mode: Page select → posts list (`pickers?kind=posts&pageId=`). Existing-creative mode: `pickers?kind=creatives&act=`. Write `patch({ creative })`.

  - [ ] Sub-step: add `app/api/ads-create/upload/route.ts` that accepts `multipart/form-data` (`act`, `file`) and calls `uploadAdImage`/`uploadAdVideo` based on the file MIME type, returning `{ image_hash }` or `{ video_id }`.

- [ ] **Step 6: Build the Review step**

Create `app/ads-auto/create/steps/review.tsx`: render a full read-only summary of the draft + estimated daily spend, a prominent "This will be created PAUSED" notice, and a "Create (Paused)" button that POSTs `{ act, draft }` to `/api/ads-create/campaign`. On `{ ok: true }`, show success + link to the campaign (deep-link into the dashboard filtered by the new `campaignId`). On `{ ok: false }`, show `error.message` (and `error.hint`) inline and keep the draft intact.

- [ ] **Step 7: Typecheck + lint + manual run**

Run: `npx tsc --noEmit` then `npm run lint`
Expected: no type errors, no lint errors.

Run: `npm run dev`, open `http://localhost:3100/ads-auto/create`, and walk all 5 steps without submitting. Confirm navigation, validation gating, and picker loads work.

- [ ] **Step 8: Commit**

```bash
git add app/ads-auto/create app/api/ads-create/upload/route.ts
git commit -m "feat: 5-step campaign creation wizard UI"
```

---

## Task 9: Token-scope check + end-to-end smoke

**Files:**
- Modify: `app/api/status/route.ts` (add a `canWrite` flag)
- Modify: the Objective step to disable "Next" / show a banner when `canWrite` is false.

**Interfaces:**
- Produces: `/api/status` response includes `canWrite: boolean` derived from token permissions (`GET /me/permissions` → has `ads_management` granted).

- [ ] **Step 1: Add the permission check**

In `app/api/status/route.ts`, call `fbGet("/me/permissions")` and set `canWrite` to whether `ads_management` is present with `status === "granted"`. Add `getTokenCanWrite()` to `lib/fb.ts` if cleaner. Return `canWrite` in the JSON.

- [ ] **Step 2: Gate the UI**

In `app/ads-auto/create/steps/objective.tsx`, fetch `/api/status`; if `canWrite` is false, render a banner ("This token can read but not create campaigns — needs ads_management") and disable the wizard.

- [ ] **Step 3: Sandbox integration test**

Using a Facebook **sandbox ad account** (no real spend), walk the wizard end to end with an existing-creative ad and a minimal targeting spec. Confirm a PAUSED campaign + adset + ad appear in the sandbox account. Then intentionally break the creative step (bad creative id) and confirm the rollback leaves NO orphan campaign/adset.

- [ ] **Step 4: Live smoke (one campaign)**

In a real account, create one campaign as PAUSED with an existing post. Verify in Ads Manager that all three levels are PAUSED, then delete it.

- [ ] **Step 5: Commit**

```bash
git add app/api/status/route.ts lib/fb.ts app/ads-auto/create/steps/objective.tsx
git commit -m "feat: token write-scope check + gate create wizard"
```

---

## Self-Review notes (for the implementer)

- **Spec coverage:** objectives (Task 1), full targeting + search + reach (Tasks 5, 7, 8.4), both creative sources incl. upload (Tasks 4, 8.5), always-PAUSED (Tasks 4, hard-coded), rollback (Task 3), guardrails (Tasks 6, 9). All requirements from the design doc map to a task.
- **Type consistency:** `CampaignDraft`/`ChainDeps` are defined once in `lib/ads-create/chain.ts` and imported everywhere. `realChainDeps()` is the single wiring point between the pure orchestrator and `lib/fb.ts`.
- **Known soft spots to verify against live API:** exact `object_story_id` format for existing posts (`{pageId}_{postId}`), `reachestimate` response shape, and the `/search` `type` values (`adinterest`, `adgeolocation`, `adworkemployer`, etc.). Verify each against a sandbox account during Task 9 and adjust the helper if Meta's v21.0 shape differs.
