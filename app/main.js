import { app, BrowserWindow, Menu } from 'electron';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SMOKE = process.argv.includes('--smoke');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4',
};

// A tiny loopback server instead of file://: the pages are ES-module documents
// with an importmap, and http is the only origin where they behave exactly as
// they do in a browser (module resolution, iframe same-origin, no CORS edge cases).
function serve() {
  const server = http.createServer((req, res) => {
    let rel = decodeURIComponent(req.url.split('?')[0]);
    if (rel === '/') rel = '/shell/index.html';
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(buf);
    });
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

let win = null;

async function createWindow() {
  const server = await serve();
  const origin = `http://127.0.0.1:${server.address().port}`;

  win = new BrowserWindow({
    width: 1512,
    height: 982,
    minWidth: 1040,
    minHeight: 680,
    backgroundColor: '#05060b',
    title: '3D交互模型库',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(origin)) e.preventDefault();
  });

  const menu = Menu.buildFromTemplate([
    { label: '视图', submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }] },
    { label: '窗口', submenu: [{ role: 'minimize' }, { role: 'togglefullscreen' }, { role: 'close' }] },
  ]);
  Menu.setApplicationMenu(menu);

  await win.loadURL(origin + '/shell/index.html');

  if (SMOKE) {
    const shotDir = fs.mkdtempSync(path.join(os.tmpdir(), 'i3d-smoke-'));
    const shot = async name => {
      const img = await win.webContents.capturePage();
      const file = path.join(shotDir, name);
      fs.writeFileSync(file, img.toPNG());
      console.log('smoke →', file);
    };
    await new Promise(r => setTimeout(r, 2500));
    await shot('smoke-01-initial.png');

    // search by a body part, not the model title
    await win.webContents.executeJavaScript(`
      const q = document.querySelector('#q');
      q.value = '耳蜗'; q.dispatchEvent(new Event('input', { bubbles: true })); true;
    `).catch(() => {});
    await new Promise(r => setTimeout(r, 900));
    await shot('smoke-02-search.png');

    await win.webContents.executeJavaScript(`
      document.querySelector('#list .item')?.click(); true;
    `).catch(() => {});
    await new Promise(r => setTimeout(r, 7000));
    await shot('smoke-03-model.png');

    await win.webContents.executeJavaScript(`document.querySelector('#collapse').click(); true`).catch(() => {});
    await new Promise(r => setTimeout(r, 1400));
    await shot('smoke-04-collapsed.png');

    app.quit();
  }
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
