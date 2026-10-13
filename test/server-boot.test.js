const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');

test('importing the server on Vercel starts listening', async () => {
  const port = 34567;
  const proc = spawn(
    process.execPath,
    ['-e', `process.env.VERCEL='1'; process.env.PORT='${port}'; require('./server.js');`],
    { cwd: path.join(__dirname, '..'), stdio: ['ignore', 'pipe', 'pipe'] }
  );
  let logs = '';
  proc.stdout.on('data', (chunk) => {
    logs += chunk;
  });
  proc.stderr.on('data', (chunk) => {
    logs += chunk;
  });

  try {
    let html = '';
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/`);
        html = await response.text();
        if (response.status === 200 && html.includes('Vertumnus')) break;
      } catch (err) {
        html = '';
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.match(html, /Vertumnus/, logs);

    const presets = await fetch(`http://127.0.0.1:${port}/api/presets`);
    assert.equal(presets.status, 200);
    const config = await presets.json();
    assert.ok(config.presets.length >= 1);
  } finally {
    proc.kill('SIGTERM');
  }
});
