#!/usr/bin/env node

import http from 'node:http';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const host = '127.0.0.1';
const port = Number(process.env.PORT || 4173);
const publicFiles = new Map([
  ['/', 'index.html'],
  ['/index.html', 'index.html'],
  ['/app.js', 'app.js'],
  ['/styles.css', 'styles.css'],
  ['/generated-data.js', 'generated-data.js']
]);
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8'
};
let updating = false;

const sendJson = (response, status, payload) => {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  response.end(JSON.stringify(payload));
};

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || `${host}:${port}`}`);

  if (request.method === 'POST' && url.pathname === '/api/update') {
    if (updating) return sendJson(response, 409, { error: '已有更新正在进行' });
    updating = true;
    try {
      const { stdout } = await execFileAsync(process.execPath, [path.join(projectRoot, 'scripts/update-review-data.mjs')], {
        cwd: projectRoot,
        timeout: 120000
      });
      return sendJson(response, 200, { ok: true, message: stdout.trim() });
    } catch (error) {
      return sendJson(response, 500, { error: error.stderr?.trim() || error.message });
    } finally {
      updating = false;
    }
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD, POST' });
    return response.end();
  }

  const relativeFile = publicFiles.get(url.pathname);
  if (!relativeFile) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return response.end('Not found');
  }

  try {
    const file = await fs.readFile(path.join(projectRoot, relativeFile));
    response.writeHead(200, {
      'Content-Type': contentTypes[path.extname(relativeFile)] || 'application/octet-stream',
      'Cache-Control': relativeFile === 'generated-data.js' ? 'no-store' : 'no-cache'
    });
    response.end(request.method === 'HEAD' ? undefined : file);
  } catch {
    response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Unable to read file');
  }
});

server.listen(port, host, () => {
  console.log(`任务观察员已启动：http://${host}:${port}`);
  console.log('按 Ctrl+C 停止。');
});
