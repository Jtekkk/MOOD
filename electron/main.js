// Electron entry point — wraps MOOD in a desktop window so it can ship as a
// Windows .exe (or macOS/Linux build). The game is ES-module + streams MP3s,
// so instead of file:// we start the project's own static server on a private
// ephemeral port and point the window at it. Build with: npm run dist:win.
import { app, BrowserWindow, Menu } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { startServer } from '../server.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
let win = null;
let httpServer = null;

async function createWindow() {
  // 127.0.0.1:0 → a free port nobody else can reach; serves the packaged files.
  const { server, port } = await startServer(0);
  httpServer = server;

  win = new BrowserWindow({
    width: 1024,
    height: 660,
    minWidth: 640,
    minHeight: 400,
    backgroundColor: '#0a0a0c',
    title: 'MOOD',
    icon: join(__dirname, 'icon.png'),   // optional; ignored if absent
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });

  Menu.setApplicationMenu(null);          // no menu bar — it's a game
  await win.loadURL(`http://127.0.0.1:${port}/`);
  win.on('closed', () => { win = null; });
}

app.whenReady().then(createWindow);

app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

app.on('window-all-closed', () => {
  if (httpServer) httpServer.close();
  if (process.platform !== 'darwin') app.quit();
});
