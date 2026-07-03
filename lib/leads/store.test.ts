// Tests for the status-preserving upsert decision logic.
// Imports from upsert-decision.ts (not store.ts) to avoid the Supabase
// client initialisation at test time (server-only, no env vars in CI).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideUpsert } from './upsert-decision';
import type { Lead } from './types';

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 'test-id',
    accountId: 'act_123',
    phone: '0812345678',
    name: null,
    campaignId: null,
    adsetId: null,
    adId: null,
    campaignName: null,
    adName: null,
    source: 'lead_form',
    status: 'new',
    saleAmount: null,
    product: null,
    lostReason: null,
    fbLeadId: null,
    contactedAt: null,
    wonAt: null,
    lostAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ── skip cases ────────────────────────────────────────────────────────────────

test('skips when fbLeadId already ingested (no phone matches)', () => {
  const existing = makeLead({ fbLeadId: 'fb123' });
  assert.equal(decideUpsert([], existing), 'skip');
});

test('skips when fbLeadId already ingested (even if open phone match exists)', () => {
  const byFbId = makeLead({ fbLeadId: 'fb123', status: 'new' });
  const byPhone = makeLead({ status: 'new' });
  assert.equal(decideUpsert([byPhone], byFbId), 'skip');
});

// ── update-open cases ─────────────────────────────────────────────────────────

test('update-open when an open (new) lead exists for the same phone', () => {
  const openLead = makeLead({ status: 'new' });
  assert.equal(decideUpsert([openLead], null), 'update-open');
});

test('update-open even when other closed leads also exist for the phone', () => {
  const openLead = makeLead({ status: 'new' });
  const wonLead = makeLead({ status: 'won' });
  assert.equal(decideUpsert([wonLead, openLead], null), 'update-open');
});

// ── insert cases ──────────────────────────────────────────────────────────────

test('inserts when there are no matches at all', () => {
  assert.equal(decideUpsert([], null), 'insert');
});

test('inserts when all phone matches are won (status preserved — not overwritten)', () => {
  const wonLead = makeLead({ status: 'won' });
  assert.equal(decideUpsert([wonLead], null), 'insert');
});

test('inserts when all phone matches are lost (status preserved)', () => {
  const lostLead = makeLead({ status: 'lost' });
  assert.equal(decideUpsert([lostLead], null), 'insert');
});

test('inserts when all phone matches are contacted (not open)', () => {
  const contactedLead = makeLead({ status: 'contacted' });
  assert.equal(decideUpsert([contactedLead], null), 'insert');
});

test('inserts when phone matches are all closed (mixed won + lost)', () => {
  const won = makeLead({ status: 'won' });
  const lost = makeLead({ status: 'lost', id: 'test-id-2' });
  assert.equal(decideUpsert([won, lost], null), 'insert');
});
