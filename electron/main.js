const { app, BrowserWindow, ipcMain } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');

const tests = [
  { id: 'launch-browser', label: 'Launch Chrome browser', file: 'tests/launch-browser.spec.ts' },
  { id: 'incognito', label: 'Chrome incognito', file: 'tests/incognito-chrome.spec.ts' },
  { id: 'real-incognito', label: 'Real Chrome incognito', file: 'tests/real-chrome-incognito.spec.ts' },
];

let mainWindow;
let activeProcess = null;
let runState = { status: 'idle', output: '' };

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 760,
    minHeight: 560,
    title: 'Playwright Desktop Runner',
    backgroundColor: '#101419',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'public', 'desktop.html'));
}

function publishState() {
  if (!mainWindow?.isDestroyed()) mainWindow.webContents.send('run-state', runState);
}

function getRunnerCommand(testFile) {
  if (!app.isPackaged) {
    return {
      command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
      args: ['playwright', 'test', testFile, '--reporter=line'],
      env: process.env,
      cwd: path.join(__dirname, '..'),
    };
  }

  return {
    command: process.execPath,
    args: [path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', '@playwright', 'test', 'cli.js'), 'test', testFile, '--reporter=line'],
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      ELECTRON_NO_ATTACH_CONSOLE: '1',
      NODE_PATH: path.join(app.getAppPath(), 'node_modules'),
    },
    cwd: path.join(process.resourcesPath, 'app.asar.unpacked'),
  };
}

function startRun(testId) {
  if (activeProcess) return runState;
  const selectedTest = tests.find((test) => test.id === testId);
  if (!selectedTest) throw new Error('Unknown test selected');

  const runner = getRunnerCommand(selectedTest.file);
  runState = {
    status: 'running',
    test: selectedTest,
    output: `Starting ${selectedTest.label}...\n`,
    startedAt: new Date().toISOString(),
  };
  publishState();

  activeProcess = spawn(runner.command, runner.args, {
    cwd: runner.cwd,
    env: { ...runner.env, CI: '1' },
    windowsHide: false,
  });

  const appendOutput = (chunk) => {
    runState.output += chunk.toString();
    if (runState.output.length > 100_000) runState.output = runState.output.slice(-100_000);
    publishState();
  };

  activeProcess.stdout.on('data', appendOutput);
  activeProcess.stderr.on('data', appendOutput);
  activeProcess.on('error', (error) => appendOutput(`${error.message}\n`));
  activeProcess.on('close', (exitCode) => {
    runState.status = exitCode === 0 ? 'passed' : 'failed';
    runState.exitCode = exitCode;
    runState.finishedAt = new Date().toISOString();
    activeProcess = null;
    publishState();
  });

  return runState;
}

function stopRun() {
  if (!activeProcess) return runState;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(activeProcess.pid), '/t', '/f'], { windowsHide: true });
  } else {
    activeProcess.kill('SIGTERM');
  }
  runState.status = 'stopped';
  runState.finishedAt = new Date().toISOString();
  activeProcess = null;
  publishState();
  return runState;
}

app.whenReady().then(() => {
  ipcMain.handle('tests:list', () => tests);
  ipcMain.handle('run:start', (_event, testId) => startRun(testId));
  ipcMain.handle('run:stop', () => stopRun());
  ipcMain.handle('run:state', () => runState);

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
