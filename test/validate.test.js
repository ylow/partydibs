import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateTitle,
  validateItemName,
  validateItemNote,
  validateClaimerName,
  validatePassword,
} from '../src/validate.js';

test('validateTitle trims, rejects empty and oversized', () => {
  assert.deepEqual(validateTitle('  Birthday  '), { ok: true, value: 'Birthday' });
  assert.equal(validateTitle('').ok, false);
  assert.equal(validateTitle('   ').ok, false);
  assert.equal(validateTitle('x'.repeat(101)).ok, false);
  assert.equal(validateTitle('x'.repeat(100)).ok, true);
});

test('validateItemName trims, rejects empty and oversized', () => {
  assert.deepEqual(validateItemName('Chips'), { ok: true, value: 'Chips' });
  assert.equal(validateItemName('').ok, false);
  assert.equal(validateItemName('x'.repeat(101)).ok, false);
});

test('validateItemNote allows empty (returns null), rejects oversized', () => {
  assert.deepEqual(validateItemNote(''), { ok: true, value: null });
  assert.deepEqual(validateItemNote('   '), { ok: true, value: null });
  assert.deepEqual(validateItemNote('paper plates'), { ok: true, value: 'paper plates' });
  assert.equal(validateItemNote('x'.repeat(501)).ok, false);
});

test('validateClaimerName trims, rejects empty and >60', () => {
  assert.deepEqual(validateClaimerName('  Alice '), { ok: true, value: 'Alice' });
  assert.equal(validateClaimerName('').ok, false);
  assert.equal(validateClaimerName('x'.repeat(61)).ok, false);
});

test('validatePassword rejects empty and >200', () => {
  assert.deepEqual(validatePassword('hunter2'), { ok: true, value: 'hunter2' });
  assert.equal(validatePassword('').ok, false);
  assert.equal(validatePassword('x'.repeat(201)).ok, false);
  assert.equal(validatePassword('x'.repeat(200)).ok, true);
});

test('validators reject non-string inputs', () => {
  assert.equal(validateTitle(undefined).ok, false);
  assert.equal(validateTitle(null).ok, false);
  assert.equal(validateTitle(42).ok, false);
});
