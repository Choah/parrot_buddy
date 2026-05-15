const http = require('node:http');

const DEFAULT_PORT = 17872;
const MAX_BODY_SIZE = 1024 * 1024;

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY_SIZE) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });

    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function createApiServer({ store, onTaskFinished, port = DEFAULT_PORT }) {
  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url === '/health') {
        sendJson(res, 200, { ok: true, port });
        return;
      }

      if (req.method === 'GET' && req.url === '/tasks') {
        sendJson(res, 200, store.snapshot());
        return;
      }

      if (req.method === 'POST' && req.url === '/task/start') {
        const payload = await readJson(req);
        const task = store.startTask({
          ...payload,
          source: payload.source || 'cli'
        });
        sendJson(res, 200, { ok: true, task });
        return;
      }

      if (req.method === 'POST' && req.url === '/task/finish') {
        const payload = await readJson(req);
        if (!payload.id) {
          sendJson(res, 400, { ok: false, error: 'Missing task id' });
          return;
        }

        const task = store.finishTask(payload.id, payload);
        onTaskFinished?.(task);
        sendJson(res, 200, { ok: true, task });
        return;
      }

      sendJson(res, 404, { ok: false, error: 'Not found' });
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error.message });
    }
  });

  return {
    server,
    port,
    start() {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', () => {
          server.off('error', reject);
          resolve();
        });
      });
    },
    stop() {
      return new Promise((resolve) => server.close(resolve));
    }
  };
}

module.exports = {
  DEFAULT_PORT,
  createApiServer
};

