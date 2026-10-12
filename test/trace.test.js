const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { rasterize } = require('../lib/raster');
const { vectorize } = require('../lib/vectorize');
const { resolveOptions } = require('../lib/options');
const { createServer, shutdown } = require('../server');

async function markPng() {
  const svg = `
    <svg width="140" height="90" xmlns="http://www.w3.org/2000/svg">
      <rect width="140" height="90" fill="#ffffff"/>
      <rect x="48" y="24" width="44" height="42" fill="#c43a2a"/>
    </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

function fillsOf(svg) {
  return [...String(svg).matchAll(/fill="rgb\((\d+),(\d+),(\d+)\)"/g)].map((match) => ({
    r: Number(match[1]),
    g: Number(match[2]),
    b: Number(match[3]),
  }));
}

function nearWhite(fill) {
  return fill.r > 230 && fill.g > 230 && fill.b > 230;
}

test('transparent corners do not leave an invisible full-canvas path', async () => {
  const svg = `<svg width="80" height="80" xmlns="http://www.w3.org/2000/svg"><circle cx="40" cy="40" r="18" fill="#c43a2a"/></svg>`;
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  const image = await rasterize(png, 80);
  const resolved = resolveOptions({ preset: 'poster', maxSize: 80 });
  const traced = vectorize(
    { width: image.width, height: image.height, pixels: image.pixels },
    resolved.tracer,
    image.corner,
    false
  );
  assert.match(traced.svg, /<svg/);
  assert.doesNotMatch(traced.svg, /opacity="0"/);
  assert.ok(traced.paths >= 1);
});

test('knockout removes a flat white field and keeps the red mark', async () => {
  const png = await markPng();
  const image = await rasterize(png, 140);
  const resolved = resolveOptions({ preset: 'logo', maxSize: 140 });
  const traced = vectorize(
    { width: image.width, height: image.height, pixels: image.pixels },
    resolved.tracer,
    image.corner,
    resolved.knockout
  );
  const fills = fillsOf(traced.svg);
  assert.ok(fills.length >= 1);
  assert.equal(fills.some(nearWhite), false);
  assert.ok(fills.some((fill) => fill.r > 140 && fill.g < 120 && fill.b < 110));
});

test('the HTTP API traces PNG, JPEG, and WebP and serves presets', async () => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  try {
    const png = await markPng();
    const jpeg = await sharp(png).jpeg().toBuffer();
    const webp = await sharp(png).webp().toBuffer();

    for (const [label, buffer] of [['png', png], ['jpeg', jpeg], ['webp', webp]]) {
      const response = await fetch(`${base}/api/trace`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          image: buffer.toString('base64'),
          preset: 'poster',
          maxSize: 140,
        }),
      });
      assert.equal(response.status, 200, label);
      assert.match(response.headers.get('content-type'), /image\/svg\+xml/);
      const svg = await response.text();
      assert.match(svg, /<path/, label);
      assert.ok(Number(response.headers.get('x-path-count')) >= 1, label);
    }

    const rasterResponse = await fetch(`${base}/api/trace`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        image: `data:image/png;base64,${png.toString('base64')}`,
        preset: 'logo',
        maxSize: 120,
        returnRaster: true,
      }),
    });
    assert.equal(rasterResponse.status, 200);
    const payload = await rasterResponse.json();
    assert.match(payload.svg, /<svg/);
    assert.match(payload.raster, /^data:image\/png;base64,/);
    assert.equal(fillsOf(payload.svg).some(nearWhite), false);

    const presets = await fetch(`${base}/api/presets`);
    const config = await presets.json();
    assert.ok(config.presets.some((preset) => preset.id === 'line'));

    const missing = await fetch(`${base}/api/trace`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ preset: 'poster' }),
    });
    assert.equal(missing.status, 400);

    const unknown = await fetch(`${base}/api/trace`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ image: png.toString('base64'), preset: 'nope' }),
    });
    assert.equal(unknown.status, 400);

    const wrongMethod = await fetch(`${base}/api/trace`);
    assert.equal(wrongMethod.status, 405);

    const page = await fetch(`${base}/`);
    const html = await page.text();
    assert.match(html, /Vertumnus/);
    assert.match(html, /Harvest/);
  } finally {
    shutdown();
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
});
