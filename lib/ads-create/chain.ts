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
