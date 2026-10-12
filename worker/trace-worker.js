const { parentPort } = require('worker_threads');
const { vectorize } = require('../lib/vectorize');

parentPort.on('message', (message) => {
  try {
    const pixels = new Uint8ClampedArray(message.buffer);
    const result = vectorize(
      { width: message.width, height: message.height, pixels },
      message.options,
      message.corner,
      message.knockout
    );
    parentPort.postMessage({
      token: message.token,
      ok: true,
      svg: result.svg,
      paths: result.paths,
    });
  } catch (err) {
    parentPort.postMessage({
      token: message.token,
      ok: false,
      error: err.message || 'Trace failed',
      status: err.status || 500,
    });
  }
});
