const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let inferenceProcess;
const initialSize = { width: 400, height: 700 }; // 初始窗口大小

function createWindow() {
  // Start inference service
  startInferenceService();

  // 创建无边框、透明的窗口 - 增加高度以容纳聊天框
  mainWindow = new BrowserWindow({
    width: initialSize.width,
    height: initialSize.height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    }
  });

  // 加载 dist 目录下的 index.html
  mainWindow.loadFile(path.join(__dirname, 'dist/index.html'));

  // 设置窗口位置为屏幕右下角
  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
  const winBounds = mainWindow.getBounds();
  mainWindow.setPosition(screenWidth - winBounds.width, screenHeight - winBounds.height);

  // 允许窗口调整大小
  mainWindow.setResizable(true);
  mainWindow.setMinimumSize(200, 350); // 设置最小尺寸以防止窗口过小

  // 监听拖拽事件
  let isDragging = false;
  let dragOffset = { x: 0, y: 0 };

  // 处理拖拽开始
  ipcMain.on('drag-start', (event, { x, y }) => {
    isDragging = true;
    const winPos = mainWindow.getPosition();
    dragOffset.x = x - winPos[0];
    dragOffset.y = y - winPos[1];
  });

  // 处理拖拽移动
  ipcMain.on('drag-move', (event, { x, y }) => {
    if (isDragging) {
      mainWindow.setPosition(x - dragOffset.x, y - dragOffset.y);
    }
  });

  // 处理拖拽结束
  ipcMain.on('drag-end', () => {
    isDragging = false;
  });

  // 处理窗口调整大小
  let isResizing = false;
  let resizeOffset = { x: 0, y: 0 };

  ipcMain.on('resize-start', (event, { x, y }) => {
    isResizing = true;
    const winBounds = mainWindow.getBounds();
    resizeOffset.x = x;
    resizeOffset.y = y;
  });

  ipcMain.on('resize-move', (event, { x, y }) => {
    if (isResizing) {
      const winBounds = mainWindow.getBounds();
      const newWidth = winBounds.width + (x - resizeOffset.x);
      const newHeight = winBounds.height + (y - resizeOffset.y);
      mainWindow.setSize(Math.max(200, newWidth), Math.max(350, newHeight));
      resizeOffset.x = x;
      resizeOffset.y = y;
    }
  });

  ipcMain.on('resize-end', () => {
    isResizing = false;
  });

  // 处理窗口大小还原
  ipcMain.on('restore-size', () => {
    mainWindow.setSize(initialSize.width, initialSize.height);
  });

  ipcMain.on('close-app', () => {
    console.log('Close app requested'); // 调试日志
    stopInferenceService();
    app.quit();
  });

  // 处理聊天消息
  ipcMain.handle('send-chat-message', async (event, message) => {
    console.log('Received chat message:', message);
    
    try {
      const pythonPath = process.platform === 'win32'
        ? path.join(__dirname, '.venv', 'Scripts', 'python.exe')
        : path.join(__dirname, '.venv', 'bin', 'python');
      const scriptPath = path.join(__dirname, 'chat_handler.py');
      
      console.log('Calling Python script:', pythonPath, scriptPath);
      
      const pythonProcess = spawn(pythonPath, [scriptPath, message], {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: process.platform === 'win32'
      });
      
      return new Promise((resolve, reject) => {
        let result = '';
        let errorOutput = '';
        
        // 设置超时
        const timeout = setTimeout(() => {
          pythonProcess.kill();
          reject(new Error('Python script timeout'));
        }, 100000); // 10秒超时
        
        pythonProcess.stdout.on('data', (data) => {
          result += data.toString();
        });
        
        pythonProcess.stderr.on('data', (data) => {
          errorOutput += data.toString();
          console.error('Python stderr:', data.toString());
        });
        
        pythonProcess.on('close', (code) => {
          clearTimeout(timeout);
          console.log('Python process closed with code:', code);
          console.log('Python output:', result);
          console.log('Python error output:', errorOutput);
          
          if (code === 0 && result.trim()) {
            resolve(result.trim());
          } else {
            // 如果Python脚本失败，返回备用回复
            console.log('Python script failed, using fallback response');
            resolve(getFallbackResponse(message));
          }
        });
        
        pythonProcess.on('error', (error) => {
          clearTimeout(timeout);
          console.error('Python process error:', error);
          // 如果无法启动Python，使用备用回复
          resolve(getFallbackResponse(message));
        });
      });
    } catch (error) {
      console.error('Failed to call Python script:', error);
      return getFallbackResponse(message);
    }
  });
}

async function startInferenceService() {
  const pythonPath = process.platform === 'win32'
    ? path.join(__dirname, '.venv', 'Scripts', 'python.exe')
    : path.join(__dirname, '.venv', 'bin', 'python');
  const scriptPath = path.join(__dirname, 'inference_service.py');

  console.log('Starting inference service:', pythonPath, scriptPath);

  inferenceProcess = spawn(pythonPath, [scriptPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: process.platform === 'win32'
  });

  inferenceProcess.stdout.on('data', (data) => {
    console.log('Inference service stdout:', data.toString());
  });

  inferenceProcess.stderr.on('data', (data) => {
    console.error('Inference service stderr:', data.toString());
  });

  inferenceProcess.on('close', (code) => {
    console.log('Inference service closed with code:', code);
  });

  inferenceProcess.on('error', (error) => {
    console.error('Inference service error:', error);
  });
}

function stopInferenceService() {
  if (inferenceProcess) {
    console.log('Stopping inference service...');
    inferenceProcess.kill('SIGTERM');
    inferenceProcess = null;
  }
}

// 备用回复函数
function getFallbackResponse(message) {
  const responses = [
    "你好！很高兴和你聊天～",
    "我明白你的意思了！",
    "这听起来很有趣呢！",
    "让我想想...嗯，我觉得你说得对！",
    "哇，真的吗？告诉我更多吧！",
    "我也这么想！我们很有默契呢～"
  ];
  
  const messageLower = message.toLowerCase();
  
  if (messageLower.includes('你好') || messageLower.includes('hello') || messageLower.includes('hi')) {
    return "你好！很高兴见到你！今天过得怎么样？";
  } else if (messageLower.includes('谢谢') || messageLower.includes('感谢') || messageLower.includes('thank')) {
    return "不用客气！我很乐意帮助你～";
  } else if (messageLower.includes('再见') || messageLower.includes('bye') || messageLower.includes('拜拜')) {
    return "再见！记得常来找我聊天哦～";
  } else if (message.includes('?') || message.includes('？')) {
    return "这是个好问题！让我想想...我觉得这取决于具体情况呢。";
  } else {
    return responses[Math.floor(Math.random() * responses.length)];
  }
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
  stopInferenceService();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopInferenceService();
});