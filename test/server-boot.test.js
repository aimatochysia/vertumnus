const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

test('the server module is the request handler Vercel invokes', async () => {
  const handler = require('../server');
  assert.equal(typeof handler, 'function');

  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const page = await fetch(`http://127.0.0.1:${port}/`);
    const html = await page.text();
    assert.equal(page.status, 200);
    assert.match(html, /Vertumnus/);

    const presets = await fetch(`http://127.0.0.1:${port}/api/presets`);
    assert.equal(presets.status, 200);
    const config = await presets.json();
    assert.ok(config.presets.length >= 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
