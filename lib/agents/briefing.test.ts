// Unit tests for the classifyTrueMetric pure helper in briefing.ts.
// These do not require a live DB or FB API — no env vars needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyTrueMetric } from './briefing-classify';

// ── real_loser: zero customers ────────────────────────────────────────────────

test('real_loser when realCustomers === 0 regardless of FB ROAS', () => {
  assert.equal(classifyTrueMetric(2.5, 0.0, 0), 'real_loser');
});

test('real_loser when realCustomers === 0 and trueRoas is null (no spend data)', () => {
  assert.equal(classifyTrueMetric(1.8, null, 0), 'real_loser');
});

test('real_loser when realCustomers === 0 and fbRoas is null', () => {
  assert.equal(classifyTrueMetric(null, null, 0), 'real_loser');
});

// ── real_loser: trueRoas < 1 while FB looks decent ───────────────────────────

test('real_loser when trueRoas < 1 and fbRoas >= 1.5', () => {
  assert.equal(classifyTrueMetric(2.0, 0.6, 3), 'real_loser');
});

test('real_loser when trueRoas exactly 0.99 and fbRoas exactly 1.5', () => {
  assert.equal(classifyTrueMetric(1.5, 0.99, 2), 'real_loser');
});

test('NOT real_loser when trueRoas < 1 but fbRoas < 1.5 (FB also looks bad)', () => {
  // Both metrics bad: doesn't qualify as "FB looks decent"
  const result = classifyTrueMetric(1.2, 0.6, 2);
  assert.notEqual(result, 'real_loser');
});

test('NOT real_loser when trueRoas >= 1 and fbRoas >= 1.5 (no problem)', () => {
  assert.equal(classifyTrueMetric(2.0, 1.2, 5), null);
});

// ── hidden_winner ─────────────────────────────────────────────────────────────

test('hidden_winner when trueRoas >= fbRoas * 1.25 with at least 1 customer', () => {
  assert.equal(classifyTrueMetric(2.0, 2.5, 1), 'hidden_winner');
});

test('hidden_winner at exact 1.25x threshold', () => {
  assert.equal(classifyTrueMetric(2.0, 2.5, 3), 'hidden_winner');
});

test('NOT hidden_winner when trueRoas is just below 1.25x fbRoas', () => {
  // trueRoas = 2.49, fbRoas = 2.0 → 2.49 < 2.0 * 1.25 = 2.5
  assert.equal(classifyTrueMetric(2.0, 2.49, 3), null);
});

test('NOT hidden_winner when realCustomers === 0 (already caught as real_loser)', () => {
  // trueRoas >= fbRoas * 1.25 but zero customers → real_loser wins
  assert.equal(classifyTrueMetric(1.0, 1.5, 0), 'real_loser');
});

test('NOT hidden_winner when fbRoas is 0 (would divide by zero)', () => {
  // fbRoas = 0 means the fb > 0 guard fails → return null, not hidden_winner
  assert.equal(classifyTrueMetric(0, 3.0, 5), null);
});

test('NOT hidden_winner when trueRoas is null', () => {
  assert.equal(classifyTrueMetric(2.0, null, 5), null);
});

// ── null: no signal ───────────────────────────────────────────────────────────

test('returns null when everything looks fine (trueRoas reasonable, customers present)', () => {
  // trueRoas ≈ fbRoas, customers present — no anomaly
  assert.equal(classifyTrueMetric(2.0, 2.1, 4), null);
});

test('returns null when trueRoas is null and customers > 0 (not enough data)', () => {
  assert.equal(classifyTrueMetric(2.0, null, 3), null);
});
