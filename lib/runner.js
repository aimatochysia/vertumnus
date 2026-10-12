const { Worker } = require('worker_threads');
const { vectorize } = require('./vectorize');

let worker = null;
let active = null;
let queued = null;
let busy = false;
let seq = 0;
let workersDisabled = false;

function settle(job, message) {
  if (!job || job.settled) return;
  job.settled = true;
  if (message.ok) {
    job.resolve({ svg: message.svg, paths: message.paths });
    return;
  }
  const error = new Error(message.error || 'Trace failed');
  error.status = message.status || 500;
  job.reject(error);
}

function attach(child) {
  child.unref();
  child.on('message', (message) => {
    if (!active || active.worker !== child || active.token !== message.token) return;
    const job = active;
    active = null;
    busy = false;
    settle(job, message);
    pump();
  });
  child.on('error', (err) => {
    if (worker === child) worker = null;
    if (active && active.worker === child) {
      const job = active;
      active = null;
      busy = false;
      settle(job, { ok: false, error: err.message || 'Trace worker failed', status: 500 });
      pump();
    }
  });
  child.on('exit', () => {
    if (worker === child) worker = null;
    if (active && active.worker === child) {
      const job = active;
      active = null;
      busy = false;
      settle(job, { ok: false, error: 'Trace worker stopped', status: 500 });
      pump();
    }
  });
}

function ensureWorker() {
  if (workersDisabled) return null;
  if (worker) return worker;
  try {
    worker = new Worker(require.resolve('../worker/trace-worker.js'));
    attach(worker);
    return worker;
  } catch (err) {
    workersDisabled = true;
    worker = null;
    return null;
  }
}

function pump() {
  if (busy || !queued) return;
  const job = queued;
  queued = null;
  const child = ensureWorker();
  if (!child) {
    try {
      const result = vectorize(
        { width: job.payload.width, height: job.payload.height, pixels: job.payload.pixels },
        job.payload.options,
        job.payload.corner,
        job.payload.knockout
      );
      settle(job, { ok: true, svg: result.svg, paths: result.paths });
    } catch (err) {
      settle(job, { ok: false, error: err.message, status: err.status || 500 });
    }
    pump();
    return;
  }

  busy = true;
  active = job;
  job.worker = child;
  try {
    child.postMessage(
      {
        token: job.token,
        width: job.payload.width,
        height: job.payload.height,
        buffer: job.payload.pixels.buffer,
        options: job.payload.options,
        corner: job.payload.corner,
        knockout: job.payload.knockout,
      },
      [job.payload.pixels.buffer]
    );
  } catch (err) {
    active = null;
    busy = false;
    settle(job, { ok: false, error: err.message || 'Trace failed', status: 500 });
    pump();
  }
}

// One trace runs at a time. A newer request cancels the in-flight job so
// slider changes stay on the latest settings.
function tracePixels(payload) {
  return new Promise((resolve, reject) => {
    const job = {
      token: ++seq,
      payload,
      resolve,
      reject,
      settled: false,
      worker: null,
    };
    if (queued) settle(queued, { ok: false, error: 'superseded', status: 409 });
    if (active) {
      const stale = active;
      active = null;
      busy = false;
      settle(stale, { ok: false, error: 'superseded', status: 409 });
      const child = worker;
      worker = null;
      if (child) child.terminate();
    }
    queued = job;
    pump();
  });
}

function shutdown() {
  queued = null;
  active = null;
  busy = false;
  if (worker) {
    const child = worker;
    worker = null;
    child.removeAllListeners();
    child.terminate();
  }
}

module.exports = { tracePixels, shutdown };
