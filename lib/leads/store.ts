// Server-only: transitively server-only because it imports lib/supabase.ts
// (which has `import 'server-only'`). No explicit guard needed here.
import { supabase } from '@/lib/supabase';
import type { Lead, LeadStatus, LeadEvent, LeadEventKind } from './types';
import { normalizePhone } from './phone';
import { decideUpsert } from './upsert-decision';

// Re-export so callers can import decideUpsert from this module.
export { decideUpsert } from './upsert-decision';

// ── Row → domain mappers ──────────────────────────────────────────────────────

function rowToLead(row: Record<string, unknown>): Lead {
  return {
    id: row.id as string,
    accountId: row.account_id as string,
    phone: row.phone as string,
    name: (row.name as string | null) ?? null,
    campaignId: (row.campaign_id as string | null) ?? null,
    adsetId: (row.adset_id as string | null) ?? null,
    adId: (row.ad_id as string | null) ?? null,
    campaignName: (row.campaign_name as string | null) ?? null,
    adName: (row.ad_name as string | null) ?? null,
    source: row.source as Lead['source'],
    status: row.status as LeadStatus,
    saleAmount: (row.sale_amount as number | null) ?? null,
    product: (row.product as string | null) ?? null,
    lostReason: (row.lost_reason as string | null) ?? null,
    fbLeadId: (row.fb_lead_id as string | null) ?? null,
    contactedAt: (row.contacted_at as string | null) ?? null,
    wonAt: (row.won_at as string | null) ?? null,
    lostAt: (row.lost_at as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function rowToEvent(row: Record<string, unknown>): LeadEvent {
  return {
    id: row.id as string,
    leadId: row.lead_id as string,
    ts: row.ts as string,
    kind: row.kind as LeadEvent['kind'],
    note: (row.note as string | null) ?? null,
    agent: (row.agent as string | null) ?? null,
  };
}

// ── Queries ───────────────────────────────────────────────────────────────────

export async function listLeads(
  accountId: string,
  opts?: { status?: LeadStatus | 'all'; search?: string },
): Promise<Lead[]> {
  let q = supabase
    .from('leads')
    .select('*')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false });

  if (opts?.status && opts.status !== 'all') {
    q = q.eq('status', opts.status);
  }
  if (opts?.search) {
    const s = opts.search.trim();
    q = q.or(`phone.ilike.%${s}%,name.ilike.%${s}%`);
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToLead);
}

export async function leadCounts(
  accountId: string,
): Promise<{ new: number; contacted: number; won: number; lost: number }> {
  const { data, error } = await supabase
    .from('leads')
    .select('status')
    .eq('account_id', accountId);
  if (error) throw new Error(error.message);
  const counts = { new: 0, contacted: 0, won: 0, lost: 0 };
  for (const row of data ?? []) {
    const s = (row as { status: string }).status as LeadStatus;
    if (s in counts) counts[s]++;
  }
  return counts;
}

export async function getLead(id: string): Promise<Lead | null> {
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('id', id)
    .limit(1);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return null;
  return rowToLead(data[0] as Record<string, unknown>);
}

export async function getLeadEvents(leadId: string): Promise<LeadEvent[]> {
  const { data, error } = await supabase
    .from('lead_events')
    .select('*')
    .eq('lead_id', leadId)
    .order('ts', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => rowToEvent(r as Record<string, unknown>));
}

// ── Writes ────────────────────────────────────────────────────────────────────

export interface AddLeadInput {
  accountId: string;
  phone: string;
  name?: string;
  campaignId?: string;
  adsetId?: string;
  adId?: string;
  campaignName?: string;
  adName?: string;
  source?: 'lead_form' | 'click_to_message' | 'manual';
  fbLeadId?: string;
}

/** Create a lead row and write a 'created' audit event. Used by manual-add and ingestion. */
export async function addLead(input: AddLeadInput): Promise<Lead> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const phone = normalizePhone(input.phone);

  const { data, error } = await supabase
    .from('leads')
    .insert({
      id,
      account_id: input.accountId,
      phone,
      name: input.name ?? null,
      campaign_id: input.campaignId ?? null,
      adset_id: input.adsetId ?? null,
      ad_id: input.adId ?? null,
      campaign_name: input.campaignName ?? null,
      ad_name: input.adName ?? null,
      source: input.source ?? 'manual',
      status: 'new',
      fb_lead_id: input.fbLeadId ?? null,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  const lead = rowToLead(data as Record<string, unknown>);
  await addEvent(id, 'created');
  return lead;
}

/** Append an audit event to a lead's history. */
export async function addEvent(
  leadId: string,
  kind: LeadEventKind,
  note?: string,
  agent?: string,
): Promise<void> {
  const { error } = await supabase.from('lead_events').insert({
    lead_id: leadId,
    kind,
    note: note ?? null,
    agent: agent ?? null,
  });
  if (error) throw new Error(error.message);
}

/** Mark a lead as contacted (new → contacted). */
export async function setContacted(id: string, agent?: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('leads')
    .update({ status: 'contacted', contacted_at: now, updated_at: now })
    .eq('id', id);
  if (error) throw new Error(error.message);
  await addEvent(id, 'contacted', undefined, agent);
}

/** Mark a lead as won, recording the sale amount. */
export async function markWon(
  id: string,
  saleAmount: number,
  product?: string,
  agent?: string,
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('leads')
    .update({
      status: 'won',
      sale_amount: saleAmount,
      product: product ?? null,
      won_at: now,
      updated_at: now,
    })
    .eq('id', id);
  if (error) throw new Error(error.message);
  const note = product ? `฿${saleAmount} — ${product}` : `฿${saleAmount}`;
  await addEvent(id, 'won', note, agent);
}

/** Mark a lead as lost with an optional reason. */
export async function markLost(id: string, reason?: string, agent?: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('leads')
    .update({
      status: 'lost',
      lost_reason: reason ?? null,
      lost_at: now,
      updated_at: now,
    })
    .eq('id', id);
  if (error) throw new Error(error.message);
  await addEvent(id, 'lost', reason, agent);
}

/**
 * Reopen a won or lost lead.
 * Sets status back to 'contacted' (not 'new' — telesales has already spoken to them)
 * and clears won/lost fields so the lead can be re-worked.
 */
export async function reopen(id: string, agent?: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('leads')
    .update({
      status: 'contacted',
      sale_amount: null,
      product: null,
      won_at: null,
      lost_at: null,
      lost_reason: null,
      updated_at: now,
    })
    .eq('id', id);
  if (error) throw new Error(error.message);
  await addEvent(id, 'reopened', undefined, agent);
}

// ── Idempotent FB ingestion ───────────────────────────────────────────────────

export interface UpsertFromFbInput {
  fbLeadId: string;
  accountId: string;
  phone: string;
  name?: string;
  campaignId?: string;
  adsetId?: string;
  adId?: string;
  campaignName?: string;
  adName?: string;
}

/**
 * Idempotently ingest a lead from Facebook.
 *
 * Decision matrix (see decideUpsert for the pure logic):
 *   skip        — fbLeadId already in DB → no-op
 *   update-open — no fbLeadId match, open ('new') lead exists for this phone
 *                 → stamp fbLeadId + apply last-touch ad attribution
 *   insert      — no usable match → create fresh lead
 *
 * Never overwrites a lead that telesales has worked (contacted/won/lost).
 * A repeat submission on a closed lead always creates a new row (repeat buyer visible).
 */
export async function upsertFromFb(
  input: UpsertFromFbInput,
): Promise<{ created: boolean }> {
  const phone = normalizePhone(input.phone);

  // Check for existing row with this fbLeadId
  const { data: byFbIdRows } = await supabase
    .from('leads')
    .select('*')
    .eq('fb_lead_id', input.fbLeadId)
    .limit(1);

  // Check for existing rows with this phone in the same account
  const { data: byPhoneRows } = await supabase
    .from('leads')
    .select('*')
    .eq('account_id', input.accountId)
    .eq('phone', phone);

  const existingByPhone = (byPhoneRows ?? []).map((r) => rowToLead(r as Record<string, unknown>));
  const existingByFbId =
    byFbIdRows && byFbIdRows.length > 0
      ? rowToLead(byFbIdRows[0] as Record<string, unknown>)
      : null;

  const decision = decideUpsert(existingByPhone, existingByFbId);

  if (decision === 'skip') {
    return { created: false };
  }

  if (decision === 'update-open') {
    const openLead = existingByPhone.find((l) => l.status === 'new')!;
    const now = new Date().toISOString();
    await supabase
      .from('leads')
      .update({
        fb_lead_id: input.fbLeadId,
        // Last-touch: overwrite ad attribution if the new submission carries it
        ad_id: input.adId ?? openLead.adId,
        adset_id: input.adsetId ?? openLead.adsetId,
        campaign_id: input.campaignId ?? openLead.campaignId,
        campaign_name: input.campaignName ?? openLead.campaignName,
        ad_name: input.adName ?? openLead.adName,
        name: input.name ?? openLead.name,
        updated_at: now,
      })
      .eq('id', openLead.id);
    return { created: false };
  }

  // decision === 'insert'
  await addLead({
    accountId: input.accountId,
    phone: input.phone, // addLead normalizes internally
    name: input.name,
    campaignId: input.campaignId,
    adsetId: input.adsetId,
    adId: input.adId,
    campaignName: input.campaignName,
    adName: input.adName,
    source: 'lead_form',
    fbLeadId: input.fbLeadId,
  });
  return { created: true };
}

// ── ROAS queries ──────────────────────────────────────────────────────────────

/**
 * All leads whose *arrival* (created_at) falls in [since, until], regardless of status
 * or attribution. Used by Phase 3 true-ROAS computation to compute lead count, CVR, and
 * coverage (including unattributed leads).
 *
 * @param since - ISO date string, inclusive lower bound (YYYY-MM-DD or full ISO)
 * @param until - ISO date string, inclusive upper bound (YYYY-MM-DD or YYYY-MM-DDT23:59:59)
 */
export async function leadsInWindow(
  accountId: string,
  since: string,
  until: string,
): Promise<Lead[]> {
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('account_id', accountId)
    .gte('created_at', since)
    .lte('created_at', until)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => rowToLead(r as Record<string, unknown>));
}

/**
 * Won leads whose *arrival* (created_at) falls in [since, until] and have ad attribution.
 * Used by Phase 3 true-ROAS computation: credit the sale to the window the lead arrived,
 * so ROAS lines up with the spend that generated it.
 *
 * @param since - ISO date string, inclusive lower bound
 * @param until - ISO date string, inclusive upper bound
 */
export async function wonLeadsForRoas(
  accountId: string,
  since: string,
  until: string,
): Promise<Lead[]> {
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('account_id', accountId)
    .eq('status', 'won')
    .gte('created_at', since)
    .lte('created_at', until)
    .not('ad_id', 'is', null)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => rowToLead(r as Record<string, unknown>));
}
