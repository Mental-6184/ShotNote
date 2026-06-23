const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, nativeImage, shell, screen } = require('electron');
const screenshotDesktop = require('screenshot-desktop');
const fs = require('fs');
const path = require('path');

const isMac = process.platform === 'darwin';

let mainWindow = null;
let tray = null;
let captureWindows = [];
let isQuitting = false;
let currentCaptureToken = 0;
let pendingCapturePayload = null;

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function getDataDir() {
  const dir = path.join(app.getPath('userData'), 'history');
  ensureDir(dir);
  return dir;
}

function getHistoryIndexPath() {
  return path.join(getDataDir(), 'history-index.json');
}

function getHistoryRecords() {
  const records = readJson(getHistoryIndexPath(), []);
  return Array.isArray(records) ? records : [];
}

function saveHistoryRecord(record) {
  const records = getHistoryRecords();
  const next = [record, ...records].slice(0, 100);
  writeJson(getHistoryIndexPath(), next);
}

function buildAppIcon() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#fbf7f0"/>
          <stop offset="100%" stop-color="#eee0cf"/>
        </linearGradient>
      </defs>
      <rect x="24" y="28" width="208" height="200" rx="56" fill="url(#g)" stroke="#d6c5b1" stroke-width="10"/>
      <rect x="66" y="70" width="124" height="84" rx="24" fill="#fffdf9" stroke="#cbb79e" stroke-width="8"/>
      <path d="M92 122h72" stroke="#bd8658" stroke-width="14" stroke-linecap="round"/>
      <path d="M144 94l28 28-28 28" fill="none" stroke="#bd8658" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  return nativeImage.createFromDataURL(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
}

function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow;

  mainWindow = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: '#f7f0e7',
    title: 'ShotNote',
    show: false,
    icon: buildAppIcon(),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      devTools: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  mainWindow.webContents.on('did-finish-load', () => {
    if (pendingCapturePayload) {
      const payload = pendingCapturePayload;
      pendingCapturePayload = null;
      mainWindow.webContents.send('capture:open-image', payload);
    }
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

function closeCaptureWindows() {
  for (const win of captureWindows) {
    if (win && !win.isDestroyed()) {
      win.close();
    }
  }
  captureWindows = [];
}

function createTray() {
  if (tray) return tray;
  tray = new Tray(buildAppIcon());
  tray.setToolTip('ShotNote');
  const menu = Menu.buildFromTemplate([
    { label: '新建截图', click: () => startCaptureFlow() },
    { label: '显示主界面', click: () => { const win = createMainWindow(); win.show(); win.focus(); } },
    { label: '打开历史目录', click: () => shell.openPath(getDataDir()) },
    { type: 'separator' },
    { label: '退出', click: () => { isQuitting = true; app.quit(); } }
  ]);
  tray.setContextMenu(menu);
  tray.on('double-click', () => {
    const win = createMainWindow();
    win.show();
    win.focus();
  });
  return tray;
}

function registerShortcuts() {
  globalShortcut.unregisterAll();
  globalShortcut.register('CommandOrControl+Alt+Shift+S', () => {
    startCaptureFlow();
  });
}

function getDisplayWindows() {
  return screen.getAllDisplays();
}

function createCaptureWindowForDisplay(display, token) {
  const win = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    show: false,
    focusable: true,
    alwaysOnTop: true,
    fullscreenable: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    icon: buildAppIcon(),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  win.setMenuBarVisibility(false);
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile(path.join(__dirname, 'src', 'index.html'), {
    query: {
      mode: 'capture',
      displayId: String(display.id),
      token: String(token)
    }
  });

  win.on('closed', () => {
    captureWindows = captureWindows.filter((item) => item !== win);
  });

  return win;
}

function deliverCapturedImage(payload) {
  const win = createMainWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  if (win.webContents.isLoadingMainFrame()) {
    pendingCapturePayload = payload;
    return;
  }
  win.webContents.send('capture:open-image', payload);
}

function startCaptureFlow() {
  const token = ++currentCaptureToken;
  closeCaptureWindows();
  const displays = getDisplayWindows();
  captureWindows = displays.map((display) => createCaptureWindowForDisplay(display, token));
}

async function captureDisplaySnapshot(displayId) {
  const displays = await screenshotDesktop.listDisplays();
  const target = displays.find((item) => String(item.id) === String(displayId)) || displays[0];
  if (!target) {
    throw new Error('No screen display found');
  }

  const buffer = await screenshotDesktop({
    format: 'png',
    screen: target.id
  });

  return `data:image/png;base64,${buffer.toString('base64')}`;
}

function dataUrlToBuffer(dataUrl) {
  const match = /^data:(.*?);base64,(.*)$/.exec(dataUrl || '');
  if (!match) throw new Error('Invalid data URL');
  return Buffer.from(match[2], 'base64');
}

function generateRecordId() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.shotnote.app');
  createMainWindow();
  createTray();
  registerShortcuts();

  app.on('activate', () => {
    const win = createMainWindow();
    win.show();
    win.focus();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (!isMac) {
    isQuitting = true;
    app.quit();
  }
});

ipcMain.handle('app:get-history', async () => {
  return getHistoryRecords();
});

ipcMain.handle('app:save-export', async (_event, payload) => {
  const { dataUrl, meta = {} } = payload || {};
  if (!dataUrl) throw new Error('Missing export data');

  const recordId = generateRecordId();
  const fileName = `${recordId}.png`;
  const jsonName = `${recordId}.json`;
  const pngPath = path.join(getDataDir(), fileName);
  const jsonPath = path.join(getDataDir(), jsonName);

  fs.writeFileSync(pngPath, dataUrlToBuffer(dataUrl));
  const record = {
    id: recordId,
    createdAt: new Date().toISOString(),
    pngPath,
    jsonPath,
    meta
  };
  writeJson(jsonPath, record);
  saveHistoryRecord(record);

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('history:changed', getHistoryRecords());
  }

  return record;
});

ipcMain.handle('app:open-path', async (_event, filePath) => {
  if (!filePath) return false;
  return shell.openPath(filePath);
});

ipcMain.handle('app:show-in-folder', async (_event, filePath) => {
  if (!filePath) return false;
  shell.showItemInFolder(filePath);
  return true;
});

ipcMain.on('app:request-capture', () => {
  startCaptureFlow();
});

ipcMain.on('app:capture-cancelled', (_event, token) => {
  if (Number(token) !== currentCaptureToken) return;
  closeCaptureWindows();
});

ipcMain.handle('app:capture-complete', async (_event, payload) => {
  if (!payload || Number(payload.token) !== currentCaptureToken) return;
  closeCaptureWindows();
  deliverCapturedImage(payload);
  return true;
});

ipcMain.on('app:show-capture-window', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) return;
  win.showInactive();
});

ipcMain.handle('app:get-capture-snapshot', async (_event, displayId) => {
  return captureDisplaySnapshot(displayId);
});

ipcMain.on('app:log', (_event, message) => {
  console.log('[renderer]', message);
});

ipcMain.handle('app:get-data-dir', async () => getDataDir());
