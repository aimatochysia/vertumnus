const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveOptions, publicConfig } = require('../lib/options');

test('preset values fill missing options and stay inside tracer limits', () => {
  const resolved = resolveOptions({ preset: 'stencil' });
  assert.equal(resolved.preset, 'stencil');
  assert.equal(resolved.knockout, true);
  assert.equal(resolved.tracer.numberofcolors, 2);
  assert.equal(resolved.tracer.viewbox, true);
  assert.equal(resolved.maxSize, 420);
  assert.equal(Object.hasOwn(resolved.tracer, 'knockout'), false);
});

test('explicit options override the preset and clamp wild numbers', () => {
  const resolved = resolveOptions({
    preset: 'detail',
    maxSize: 5000,
    options: { numberofcolors: 999, ltres: -4, linefilter: true },
  });
  assert.equal(resolved.tracer.numberofcolors, 48);
  assert.equal(resolved.tracer.ltres, 0.05);
  assert.equal(resolved.tracer.linefilter, true);
  assert.equal(resolved.maxSize, 800);
  assert.equal(resolved.knockout, false);
});

test('unknown presets are rejected', () => {
  assert.throws(() => resolveOptions({ preset: 'watercolor' }), (err) => err.status === 400);
});

test('the public config lists every preset with its controls', () => {
  const config = publicConfig();
  assert.equal(config.defaultPreset, 'poster');
  assert.equal(config.presets.length, 6);
  assert.ok(config.controls.some((control) => control.key === 'numberofcolors'));
  assert.ok(config.toggles.some((toggle) => toggle.key === 'knockout'));
  const logo = config.presets.find((preset) => preset.id === 'logo');
  assert.equal(logo.options.knockout, true);
  assert.equal(logo.options.numberofcolors, 6);
});
