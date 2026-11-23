import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import started from 'electron-squirrel-startup';
import { createAgentService } from './agent/agent-service';
import { registerChatIpc } from './main/chat-ipc';
import { loadProviderForChat, registerProviderIpc } from './main/provider-ipc';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

const createWindow = () => {
  const indexPath = path.join(
    __dirname,
    `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`,
  );
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 720,
    minHeight: 580,
    title: 'Chanakya',
    backgroundColor: '#0b0e0d',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, destination) => {
    const allowed = MAIN_WINDOW_VITE_DEV_SERVER_URL
      ? new URL(destination).origin ===
        new URL(MAIN_WINDOW_VITE_DEV_SERVER_URL).origin
      : destination === pathToFileURL(indexPath).href;
    if (!allowed) event.preventDefault();
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(indexPath);
  }
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  const isTrustedRendererSender = (senderId) => {
    const window = BrowserWindow.getAllWindows().find(
      (candidate) => candidate.webContents.id === senderId,
    );
    if (!window) return false;
    const currentUrl = window.webContents.getURL();
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      try {
        return (
          new URL(currentUrl).origin ===
          new URL(MAIN_WINDOW_VITE_DEV_SERVER_URL).origin
        );
      } catch {
        return false;
      }
    }
    return (
      currentUrl ===
      pathToFileURL(
        path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
      ).href
    );
  };
  const agent = createAgentService(loadProviderForChat);
  registerProviderIpc(isTrustedRendererSender);
  registerChatIpc(agent, isTrustedRendererSender);
  createWindow();

  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
