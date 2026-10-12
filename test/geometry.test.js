const test = require('node:test');
const assert = require('node:assert/strict');
const { fullyInside, normalizeRect } = require('../public/js/geometry');

test('a box fully inside the selection is kept', () => {
  const sel = normalizeRect(0, 0, 100, 100);
  assert.equal(fullyInside({ left: 10, top: 12, right: 40, bottom: 80 }, sel), true);
});

test('a box that crosses the selection is rejected', () => {
  const sel = normalizeRect(0, 0, 100, 100);
  assert.equal(fullyInside({ left: 80, top: 80, right: 120, bottom: 110 }, sel), false);
});

test('touching the edge still counts as inside', () => {
  const sel = normalizeRect(10, 10, 110, 80);
  assert.equal(fullyInside({ left: 10, top: 10, right: 110, bottom: 80 }, sel), true);
});

test('a reversed drag normalizes before the test', () => {
  const sel = normalizeRect(180, 90, 40, 10);
  assert.deepEqual(sel, { left: 40, top: 10, right: 180, bottom: 90 });
  assert.equal(fullyInside({ left: 50, top: 20, right: 70, bottom: 40 }, sel), true);
  assert.equal(fullyInside({ left: 30, top: 20, right: 60, bottom: 40 }, sel), false);
});
