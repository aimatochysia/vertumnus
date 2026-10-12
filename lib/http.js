function applyCors(res) {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type');
  res.setHeader('access-control-expose-headers', 'x-trace-ms, x-path-count, x-width, x-height');
}

function sendJson(res, status, body) {
  if (!res || res.writableEnded || res.destroyed) return;
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}

function sendText(res, status, body, headers) {
  if (!res || res.writableEnded || res.destroyed) return;
  res.statusCode = status;
  Object.entries(headers || {}).forEach(([key, value]) => {
    res.setHeader(key, value);
  });
  res.end(body);
}

async function readJson(req) {
  if (typeof req.body === 'string') {
    if (!req.body) return {};
    try {
      return JSON.parse(req.body);
    } catch (err) {
      const error = new Error('Malformed JSON');
      error.status = 400;
      throw error;
    }
  }
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body;
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 12 * 1024 * 1024) {
      const error = new Error('Image is too large');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (err) {
    const error = new Error('Malformed JSON');
    error.status = 400;
    throw error;
  }
}

function decodeImage(input) {
  if (typeof input !== 'string' || !input.trim()) {
    const error = new Error('Missing image');
    error.status = 400;
    throw error;
  }
  let b64 = input.trim();
  const match = b64.match(/^data:[^;]+;base64,([\s\S]+)$/i);
  if (match) b64 = match[1];
  b64 = b64.replace(/\s/g, '');
  if (!/^[a-z0-9+/]+=*$/i.test(b64)) {
    const error = new Error('Image must be base64');
    error.status = 400;
    throw error;
  }
  const buffer = Buffer.from(b64, 'base64');
  if (buffer.length < 16) {
    const error = new Error('Image payload was empty');
    error.status = 400;
    throw error;
  }
  return buffer;
}

module.exports = {
  applyCors,
  sendJson,
  sendText,
  readJson,
  decodeImage,
};
