const { publicConfig } = require('../lib/options');
const { applyCors, sendJson, sendText } = require('../lib/http');

function handler(req, res) {
  applyCors(res);
  if (req.method === 'OPTIONS') {
    sendText(res, 204, '');
    return;
  }
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Use GET' });
    return;
  }
  sendJson(res, 200, publicConfig());
}

module.exports = handler;
