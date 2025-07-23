const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  // 创建无边框、透明的窗口
  const win = new BrowserWindow({
    width: 400, // 窗口宽度，可根据 Live2D 角色大小调整
    height: 600, // 窗口高度，可根据 Live2D 角色大小调整
    frame: false, // 无边框
    transparent: true, // 透明背景
    alwaysOnTop: true, // 窗口置顶
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // 加载 dist 目录下的 index.html
  win.loadFile(path.join(__dirname, 'dist/index.html'));

  // 设置窗口位置为屏幕右下角
  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
  const winBounds = win.getBounds();
  win.setPosition(screenWidth - winBounds.width, screenHeight - winBounds.height);

  // 禁用窗口的默认交互（可选，防止拖动）
  win.setResizable(false);
  win.setMaximizable(false);
  win.setMinimizable(false);
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});