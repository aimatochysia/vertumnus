const http = require('http');
const path = require('path');
const express = require('express');
const presetsHandler = require('./api/presets');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '12mb' }));
  app.use((err, req, res, next) => {
    if (!err) return next();
    if (err.type === 'entity.too.large' || err.status === 413) {
      res.status(413).json({ error: 'Image is too large' });
      return;
    }
    if (err.type === 'entity.parse.failed' || err instanceof SyntaxError) {
      res.status(400).json({ error: 'Malformed JSON' });
      return;
    }
    next(err);
  });
  app.all('/api/trace', (req, res) => {
    let traceHandler;
    try {
      traceHandler = require('./api/trace');
    } catch (err) {
      console.error(err);
      if (!res.headersSent) res.status(500).json({ error: 'Trace failed to start' });
      return;
    }
    Promise.resolve(traceHandler(req, res)).catch((err) => {
      console.error(err);
      if (!res.headersSent) res.status(500).json({ error: 'Trace failed' });
    });
  });
  app.all('/api/presets', presetsHandler);
  app.use(express.static(path.join(__dirname, 'public'), { index: 'index.html', maxAge: 0, etag: false }));
  return app;
}

function createServer() {
  return http.createServer(createApp());
}

function shutdown() {
  require('./lib/runner').shutdown();
}

function createAppSafe() {
  try {
    return createApp();
  } catch (err) {
    console.error(err);
    const fallback = express();
    fallback.use((req, res) => {
      res.status(500).type('text/plain; charset=utf-8');
      res.end(err && err.stack ? err.stack : String(err));
    });
    return fallback;
  }
}

const app = createAppSafe();

// Vercel treats this file as a function. Export the Express handler directly.
function handler(req, res) {
  app(req, res);
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  const server = http.createServer(app);
  server.listen(port, '0.0.0.0', () => {
    console.log(`Vertumnus at http://localhost:${port}`);
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      shutdown();
      server.close(() => process.exit(0));
    });
  }
}

module.exports = handler;
module.exports.createApp = createApp;
module.exports.createServer = createServer;
module.exports.shutdown = shutdown;
