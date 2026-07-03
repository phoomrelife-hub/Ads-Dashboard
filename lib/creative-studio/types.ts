// Pure types for Creative Studio. Reuses CreativeDraft from the campaign-create chain
// so a saved draft can be published through the same lib/fb.ts createCreative path.
import type { CreativeDraft } from "@/lib/ads-create/chain";

export type StudioDraftStatus = "draft" | "published";

/** Lightweight info for rendering a draft in lists / preview without re-deriving from FB. */
export interface StudioPreview {
  thumbUrl?: string;   // object URL or FB thumbnail (best-effort; may be absent)
  pageName?: string;
  headline?: string;
  message?: string;
}

export interface StudioDraft {
  id: string;
  accountId: string;
  name: string;
  creative: CreativeDraft;
  preview: StudioPreview | null;
  status: StudioDraftStatus;
  fbCreativeId: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Copy skeleton stored on a template; applied to the builder's upload-mode fields. */
export interface TemplateCopy {
  message: string;
  headline: string;
  description?: string;
  cta: string;
}

export interface StudioTemplate {
  id: string;
  name: string;
  category: string | null;
  copy: TemplateCopy;
  createdAt: string;
}

/** Body accepted by POST /api/creative-studio/drafts (id present → update). */
export interface SaveDraftInput {
  id?: string;
  accountId: string;
  name: string;
  creative: CreativeDraft;
  preview?: StudioPreview | null;
}
