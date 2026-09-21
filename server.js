const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const port = Number(process.env.PORT || 3000);
const publicDirectory = path.join(__dirname, 'public');
const allowedTests = new Set([
  'tests/incognito-chrome.spec.ts',
  'tests/real-chrome-incognito.spec.ts',
]);

let activeRun = null;
let nextRunId = 1;

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(payload));
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 10_000) reject(new Error('Request body is too large'));
    });
    request.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch {
        reject(new Error('Request body must be valid JSON'));
      }
    });
    request.on('error', reject);
  });
}

function startTest(testFile) {
  const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const child = spawn(command, ['playwright', 'test', testFile, '--reporter=line'], {
    cwd: __dirname,
    env: { ...process.env, DISPLAY: process.env.DISPLAY || ':99' },
    shell: process.platform === 'win32',
  });

  const run = {
    id: nextRunId++,
    testFile,
    status: 'running',
    output: '',
    startedAt: new Date().toISOString(),
  };
  activeRun = run;

  const appendOutput = (chunk) => {
    run.output += chunk.toString();
    if (run.output.length > 50_000) run.output = run.output.slice(-50_000);
  };
  child.stdout.on('data', appendOutput);
  child.stderr.on('data', appendOutput);
  child.on('error', (error) => appendOutput(`${error.message}\n`));
  child.on('close', (exitCode) => {
    run.status = exitCode === 0 ? 'passed' : 'failed';
    run.exitCode = exitCode;
    run.finishedAt = new Date().toISOString();
  });

  return run;
}

function serveStatic(request, response) {
  const requestedPath = request.url === '/' ? '/index.html' : request.url;
  const filePath = path.normalize(path.join(publicDirectory, requestedPath));
  if (!filePath.startsWith(publicDirectory)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }
    const contentType = filePath.endsWith('.html') ? 'text/html' : 'text/plain';
    response.writeHead(200, { 'Content-Type': contentType });
    response.end(content);
  });
}

const server = http.createServer(async (request, response) => {
  try {
    if (request.method === 'GET' && request.url === '/api/status') {
      sendJson(response, 200, activeRun || { status: 'idle' });
      return;
    }

    if (request.method === 'POST' && request.url === '/api/run') {
      if (activeRun?.status === 'running') {
        sendJson(response, 409, { error: 'A test is already running', run: activeRun });
        return;
      }
      const { testFile } = await readRequestBody(request);
      if (!allowedTests.has(testFile)) {
        sendJson(response, 400, { error: 'Unknown test file' });
        return;
      }
      sendJson(response, 202, startTest(testFile));
      return;
    }

    if (request.method === 'GET') {
      serveStatic(request, response);
      return;
    }

    response.writeHead(405);
    response.end('Method not allowed');
  } catch (error) {
    sendJson(response, 400, { error: error.message });
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Playwright dashboard listening on http://localhost:${port}`);
});