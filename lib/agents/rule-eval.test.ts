// Unit tests for the pure rule-evaluation helpers in rule-eval.ts.
// No DB/env/network deps — safe to run anywhere.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compare, normalizeConditions, conditionsMetricKind, evalConditions,
  isValidTimeWindow, withinTimeWindow,
} from './rule-eval';

// ── compare ──────────────────────────────────────────────────────────────────
test('compare handles all ops', () => {
  assert.equal(compare(5, '>', 3), true);
  assert.equal(compare(3, '>', 5), false);
  assert.equal(compare(5, '>=', 5), true);
  assert.equal(compare(3, '<', 5), true);
  assert.equal(compare(5, '<=', 5), true);
  assert.equal(compare(5, '==', 5), true);
  assert.equal(compare(5, '==', 5.1), false);
});

// ── normalizeConditions ──────────────────────────────────────────────────────
test('normalizeConditions: undefined/null condition -> empty AND group', () => {
  assert.deepEqual(normalizeConditions(undefined), { items: [], logic: 'AND' });
  assert.deepEqual(normalizeConditions(null), { items: [], logic: 'AND' });
});

test('normalizeConditions: legacy bare condition -> single-item AND group', () => {
  const legacy = { metric: 'roas', op: '>', value: 4 } as const;
  assert.deepEqual(normalizeConditions(legacy), { items: [legacy], logic: 'AND' });
});

test('normalizeConditions: new group shape passes through, defaults logic to AND', () => {
  const items = [{ metric: 'roas', op: '>', value: 4 }, { metric: 'spend', op: '>', value: 300 }] as const;
  assert.deepEqual(normalizeConditions({ items: [...items] }), { items: [...items], logic: 'AND' });
  assert.deepEqual(normalizeConditions({ items: [...items], logic: 'OR' }), { items: [...items], logic: 'OR' });
});

// ── conditionsMetricKind ─────────────────────────────────────────────────────
test('conditionsMetricKind: empty -> none', () => {
  assert.equal(conditionsMetricKind([]), 'none');
});
test('conditionsMetricKind: all FB metrics -> fb', () => {
  assert.equal(conditionsMetricKind([{ metric: 'roas', op: '>', value: 1 }, { metric: 'spend', op: '>', value: 1 }]), 'fb');
});
test('conditionsMetricKind: all true metrics -> true', () => {
  assert.equal(conditionsMetricKind([{ metric: 'true_roas', op: '>', value: 1 }, { metric: 'true_cac', op: '<', value: 100 }]), 'true');
});
test('conditionsMetricKind: mixed -> mixed', () => {
  assert.equal(conditionsMetricKind([{ metric: 'true_roas', op: '>', value: 1 }, { metric: 'spend', op: '>', value: 1 }]), 'mixed');
});

// ── evalConditions ───────────────────────────────────────────────────────────
const getVal = (row: Record<string, number>, metric: string) => (metric in row ? row[metric] : null);

test('evalConditions: AND requires every condition to pass', () => {
  const items = [{ metric: 'roas', op: '>', value: 4 }, { metric: 'spend', op: '>', value: 300 }] as const;
  assert.equal(evalConditions({ roas: 5, spend: 400 }, [...items], 'AND', getVal), true);
  assert.equal(evalConditions({ roas: 5, spend: 200 }, [...items], 'AND', getVal), false);
});

test('evalConditions: OR requires at least one condition to pass', () => {
  const items = [{ metric: 'roas', op: '>', value: 4 }, { metric: 'spend', op: '>', value: 300 }] as const;
  assert.equal(evalConditions({ roas: 1, spend: 400 }, [...items], 'OR', getVal), true);
  assert.equal(evalConditions({ roas: 1, spend: 1 }, [...items], 'OR', getVal), false);
});

test('evalConditions: missing value (getVal returns null) counts as not-matching', () => {
  const items = [{ metric: 'roas', op: '>', value: 4 }] as const;
  assert.equal(evalConditions({}, [...items], 'AND', getVal), false);
});

test('evalConditions: empty items never matches', () => {
  assert.equal(evalConditions({ roas: 100 }, [], 'AND', getVal), false);
});

// ── isValidTimeWindow ────────────────────────────────────────────────────────
test('isValidTimeWindow: valid HH:MM pair and days', () => {
  assert.equal(isValidTimeWindow({ start: '06:00', end: '22:00', days: [1, 2, 3, 4, 5] }), true);
});
test('isValidTimeWindow: rejects malformed time strings', () => {
  assert.equal(isValidTimeWindow({ start: '6:00', end: '22:00' }), false);
  assert.equal(isValidTimeWindow({ start: '06:00', end: '25:00' }), false);
});
test('isValidTimeWindow: rejects out-of-range days', () => {
  assert.equal(isValidTimeWindow({ start: '06:00', end: '22:00', days: [7] }), false);
  assert.equal(isValidTimeWindow({ start: '06:00', end: '22:00', days: [-1] }), false);
});

// ── withinTimeWindow ─────────────────────────────────────────────────────────
test('withinTimeWindow: no window -> always true', () => {
  assert.equal(withinTimeWindow(undefined, Date.now()), true);
});
test('withinTimeWindow: same-day window, inside and outside', () => {
  const tw = { start: '06:00', end: '22:00' };
  const inside = new Date(2026, 0, 5, 12, 0).getTime();  // Mon 12:00
  const outside = new Date(2026, 0, 5, 23, 0).getTime(); // Mon 23:00
  assert.equal(withinTimeWindow(tw, inside), true);
  assert.equal(withinTimeWindow(tw, outside), false);
});
test('withinTimeWindow: window crossing midnight', () => {
  const tw = { start: '22:00', end: '02:00' };
  const lateNight = new Date(2026, 0, 5, 23, 30).getTime();
  const earlyMorning = new Date(2026, 0, 6, 1, 30).getTime();
  const midday = new Date(2026, 0, 5, 12, 0).getTime();
  assert.equal(withinTimeWindow(tw, lateNight), true);
  assert.equal(withinTimeWindow(tw, earlyMorning), true);
  assert.equal(withinTimeWindow(tw, midday), false);
});
test('withinTimeWindow: day-of-week filter (Mon-Fri only)', () => {
  const tw = { start: '00:00', end: '23:59', days: [1, 2, 3, 4, 5] };
  const monday = new Date(2026, 0, 5, 12, 0).getTime();   // 2026-01-05 is a Monday
  const saturday = new Date(2026, 0, 10, 12, 0).getTime(); // Saturday
  assert.equal(withinTimeWindow(tw, monday), true);
  assert.equal(withinTimeWindow(tw, saturday), false);
});
