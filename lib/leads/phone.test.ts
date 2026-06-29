import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone } from './phone';

const CANONICAL = '0812345678';

test('normalizes international +66 with spaces', () => {
  assert.equal(normalizePhone('+66 81 234 5678'), CANONICAL);
});

test('normalizes dashed local format with leading 0', () => {
  assert.equal(normalizePhone('081-234-5678'), CANONICAL);
});

test('leaves canonical 10-digit local number unchanged', () => {
  assert.equal(normalizePhone('0812345678'), CANONICAL);
});

test('normalizes 66 prefix without plus sign', () => {
  assert.equal(normalizePhone('66812345678'), CANONICAL);
});

test('normalizes 9-digit number missing leading 0', () => {
  assert.equal(normalizePhone('81-234-5678'), CANONICAL);
});

test('all five input variants produce the same canonical form', () => {
  const variants = [
    '+66 81 234 5678',
    '081-234-5678',
    '0812345678',
    '66812345678',
    '81-234-5678',
  ];
  for (const v of variants) {
    assert.equal(normalizePhone(v), CANONICAL, `"${v}" should normalize to "${CANONICAL}"`);
  }
});

test('returns empty string for empty input', () => {
  assert.equal(normalizePhone(''), '');
});

test('returns empty string for garbage input (letters only)', () => {
  assert.equal(normalizePhone('abc xyz'), '');
});

test('returns empty string for whitespace-only input', () => {
  assert.equal(normalizePhone('   '), '');
});
