// Types for the lead → sale tracker (Phase 1 data foundation).

export type LeadStatus = 'new' | 'contacted' | 'won' | 'lost';
export type LeadSource = 'lead_form' | 'click_to_message' | 'manual';
export type LeadEventKind = 'created' | 'contacted' | 'won' | 'lost' | 'reopened';

export interface Lead {
  id: string;
  accountId: string;
  phone: string;
  name: string | null;
  campaignId: string | null;
  adsetId: string | null;
  adId: string | null;
  campaignName: string | null;
  adName: string | null;
  source: LeadSource;
  status: LeadStatus;
  saleAmount: number | null;
  product: string | null;
  lostReason: string | null;
  fbLeadId: string | null;
  contactedAt: string | null;
  wonAt: string | null;
  lostAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LeadEvent {
  id: string;
  leadId: string;
  ts: string;
  kind: LeadEventKind;
  note: string | null;
  agent: string | null;
}
