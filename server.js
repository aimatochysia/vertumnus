const http = require('http');
const path = require('path');
const express = require('express');
const traceHandler = require('./api/trace');
const presetsHandler = require('./api/presets');
const { shutdown } = require('./lib/runner');

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
    Promise.resolve(traceHandler(req, res)).catch((err) => {
      if (!res.headersSent) res.status(500).json({ error: 'Trace failed' });
      console.error(err);
    });
  });
  app.all('/api/presets', presetsHandler);
  app.use(express.static(path.join(__dirname, 'public'), { index: 'index.html', maxAge: 0, etag: false }));
  return app;
}

function createServer() {
  return http.createServer(createApp());
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  const server = createServer();
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

module.exports = { createApp, createServer, shutdown };
