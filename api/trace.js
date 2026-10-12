const { traceBuffer } = require('../lib/trace');
const { applyCors, sendJson, sendText, readJson, decodeImage } = require('../lib/http');

async function handler(req, res) {
  applyCors(res);
  if (req.method === 'OPTIONS') {
    sendText(res, 204, '', { 'cache-control': 'no-store' });
    return;
  }
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Use POST with a JSON body: { image, preset, maxSize, options }' });
    return;
  }

  try {
    const body = await readJson(req);
    const buffer = decodeImage(body && body.image);
    const result = await traceBuffer(buffer, body);
    console.log(`trace ${result.stats.width}x${result.stats.height} ${result.stats.paths} paths ${result.stats.ms}ms`);
    if (body && body.returnRaster) {
      sendJson(res, 200, {
        svg: result.svg,
        raster: result.raster,
        width: result.stats.width,
        height: result.stats.height,
        paths: result.stats.paths,
        ms: result.stats.ms,
      });
      return;
    }
    sendText(res, 200, result.svg, {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': 'no-store',
      'x-trace-ms': String(result.stats.ms),
      'x-path-count': String(result.stats.paths),
      'x-width': String(result.stats.width),
      'x-height': String(result.stats.height),
    });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    sendJson(res, status, {
      error: status >= 500 && status !== 409 ? 'Trace failed' : err.message,
    });
  }
}

module.exports = handler;
