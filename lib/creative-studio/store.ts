// Server-only: transitively server-only via lib/supabase.ts (which imports 'server-only').
import { supabase } from "@/lib/supabase";
import type { CreativeDraft } from "@/lib/ads-create/chain";
import type {
  StudioDraft,
  StudioTemplate,
  StudioPreview,
  TemplateCopy,
  SaveDraftInput,
} from "./types";

// ── Row → domain mappers ──────────────────────────────────────────────────────

function rowToDraft(row: Record<string, unknown>): StudioDraft {
  return {
    id: row.id as string,
    accountId: row.account_id as string,
    name: row.name as string,
    creative: row.creative as CreativeDraft,
    preview: (row.preview as StudioPreview | null) ?? null,
    status: (row.status as StudioDraft["status"]) ?? "draft",
    fbCreativeId: (row.fb_creative_id as string | null) ?? null,
    publishedAt: (row.published_at as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function rowToTemplate(row: Record<string, unknown>): StudioTemplate {
  return {
    id: row.id as string,
    name: row.name as string,
    category: (row.category as string | null) ?? null,
    copy: row.copy as TemplateCopy,
    createdAt: row.created_at as string,
  };
}

// ── Drafts ────────────────────────────────────────────────────────────────────

export async function listDrafts(accountId: string): Promise<StudioDraft[]> {
  const { data, error } = await supabase
    .from("creative_drafts")
    .select("*")
    .eq("account_id", accountId)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => rowToDraft(r as Record<string, unknown>));
}

export async function getDraft(id: string): Promise<StudioDraft | null> {
  const { data, error } = await supabase
    .from("creative_drafts")
    .select("*")
    .eq("id", id)
    .limit(1);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return null;
  return rowToDraft(data[0] as Record<string, unknown>);
}

/** Insert a new draft or update an existing one (when input.id is present). */
export async function saveDraft(input: SaveDraftInput): Promise<StudioDraft> {
  const now = new Date().toISOString();

  if (input.id) {
    const { data, error } = await supabase
      .from("creative_drafts")
      .update({
        name: input.name,
        creative: input.creative,
        preview: input.preview ?? null,
        updated_at: now,
      })
      .eq("id", input.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return rowToDraft(data as Record<string, unknown>);
  }

  const { data, error } = await supabase
    .from("creative_drafts")
    .insert({
      account_id: input.accountId,
      name: input.name,
      creative: input.creative,
      preview: input.preview ?? null,
      status: "draft",
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToDraft(data as Record<string, unknown>);
}

export async function deleteDraft(id: string): Promise<void> {
  const { error } = await supabase.from("creative_drafts").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** Mark a draft as published, recording the FB creative id. */
export async function markPublished(id: string, fbCreativeId: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("creative_drafts")
    .update({
      status: "published",
      fb_creative_id: fbCreativeId,
      published_at: now,
      updated_at: now,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// ── Templates ───────────────────────────────────────────────────────────────────

export async function listTemplates(): Promise<StudioTemplate[]> {
  const { data, error } = await supabase
    .from("creative_templates")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => rowToTemplate(r as Record<string, unknown>));
}
