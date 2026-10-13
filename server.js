const http = require('http');
const path = require('path');
const express = require('express');
const presetsHandler = require('./api/presets');

// Keep the tracer in the file graph without loading sharp until a trace runs.
require.resolve('./api/trace');

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

// Vercel loads this file as a module and only routes requests if listen()
// runs during that startup. `node server.js` is the local server.
if (require.main === module || process.env.VERCEL) {
  const port = Number(process.env.PORT) || 3000;
  const server = createServer();
  server.listen(port, '0.0.0.0', () => {
    console.log(`Vertumnus at http://localhost:${port}`);
  });
  if (require.main === module) {
    for (const signal of ['SIGINT', 'SIGTERM']) {
      process.on(signal, () => {
        shutdown();
        server.close(() => process.exit(0));
      });
    }
  }
}

module.exports = { createApp, createServer, shutdown };
