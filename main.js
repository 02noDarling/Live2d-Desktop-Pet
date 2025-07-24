const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

let mainWindow;
let miniWindow; // 小图标窗口
let inferenceProcess;
const initialSize = { width: 400, height: 700 }; // 初始窗口大小
const miniSize = { width: 45, height: 45 }; // 小图标大小 - 缩小尺寸
let isCollapsed = false; // 收拢状态
let lastMainWindowPosition = null; // 记录主窗口最后位置

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

  // 处理窗口收拢
  ipcMain.on('collapse-window', () => {
    collapseWindow();
  });

  // 处理窗口展开
  ipcMain.on('expand-window', () => {
    expandWindow();
  });

  // 处理小图标拖拽
  ipcMain.on('mini-drag-move', (event, { x, y }) => {
    if (miniWindow && !miniWindow.isDestroyed()) {
      // 获取所有显示器信息以支持多屏幕
      const { screen } = require('electron');
      const displays = screen.getAllDisplays();
      
      let isInAnyDisplay = false;
      let constrainedX = x;
      let constrainedY = y;
      
      // 检查是否在任何一个显示器范围内
      for (const display of displays) {
        const { x: displayX, y: displayY, width: displayWidth, height: displayHeight } = display.bounds;
        
        if (x >= displayX && x <= displayX + displayWidth - miniSize.width &&
            y >= displayY && y <= displayY + displayHeight - miniSize.height) {
          isInAnyDisplay = true;
          break;
        }
      }
      
      // 如果不在任何显示器内，找到最近的显示器并约束位置
      if (!isInAnyDisplay) {
        let minDistance = Infinity;
        let targetDisplay = displays[0];
        
        for (const display of displays) {
          const { x: displayX, y: displayY, width: displayWidth, height: displayHeight } = display.bounds;
          
          // 计算到显示器中心的距离
          const centerX = displayX + displayWidth / 2;
          const centerY = displayY + displayHeight / 2;
          const distance = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
          
          if (distance < minDistance) {
            minDistance = distance;
            targetDisplay = display;
          }
        }
        
        // 约束到最近的显示器范围内
        const { x: displayX, y: displayY, width: displayWidth, height: displayHeight } = targetDisplay.bounds;
        constrainedX = Math.max(displayX, Math.min(displayX + displayWidth - miniSize.width, x));
        constrainedY = Math.max(displayY, Math.min(displayY + displayHeight - miniSize.height, y));
      }
      
      miniWindow.setPosition(constrainedX, constrainedY);
    }
  });

  ipcMain.on('mini-drag-end', () => {
    // 拖拽结束，可以在这里添加一些逻辑，比如保存位置
    console.log('Mini window drag ended');
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
        }, 100000); // 100秒超时
        
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

// 创建小图标窗口
function createMiniWindow() {
  miniWindow = new BrowserWindow({
    width: miniSize.width,
    height: miniSize.height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    }
  });

  // 小图标窗口的HTML内容
  const miniHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {
          margin: 0;
          padding: 0;
          background: transparent;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100vh;
        }
        
        #mini-icon {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 14px;
          font-weight: bold;
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
          transition: transform 0.2s ease;
          user-select: none;
          border: 2px solid rgba(255, 255, 255, 0.3);
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); /* 默认背景 */
          background-size: cover;
          background-position: center;
          background-repeat: no-repeat;
          position: relative;
        }
        
        #mini-icon img {
          width: 100%;
          height: 100%;
          border-radius: 50%;
          object-fit: cover;
          display: none; /* 初始隐藏 */
        }
        
        #mini-icon .text-fallback {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          color: white;
          font-size: 14px;
          font-weight: bold;
        }
        
        #mini-icon:hover {
          transform: scale(1.1);
        }
        
        #mini-icon:active {
          transform: scale(0.95);
        }
      </style>
    </head>
    <body>
      <div id="mini-icon">
        <img id="icon-image" src="" alt="">
        <span class="text-fallback">02</span>
      </div>
      
      <script>
        const { ipcRenderer } = require('electron');
        const path = require('path');
        
        const miniIcon = document.getElementById('mini-icon');
        const iconImage = document.getElementById('icon-image');
        const textFallback = document.querySelector('.text-fallback');
        let isDragging = false;
        let dragOffset = { x: 0, y: 0 };
        
        // 尝试加载自定义图片
        async function loadCustomIcon() {
          try {
            const base64Data = await ipcRenderer.invoke('get-mini-icon-base64');
            
            if (base64Data) {
              console.log('成功获取图片 base64 数据');
              
              iconImage.onload = function() {
                console.log('图片加载成功');
                iconImage.style.display = 'block';
                textFallback.style.display = 'none';
                miniIcon.style.background = 'transparent';
              };
              
              iconImage.onerror = function(e) {
                console.log('图片加载失败:', e);
              };
              
              iconImage.src = base64Data;
            } else {
              console.log('未找到图片文件，使用默认样式');
            }
          } catch (error) {
            console.error('获取图片数据时出错:', error);
          }
        }
        
        // 页面加载完成后尝试加载图片
        document.addEventListener('DOMContentLoaded', loadCustomIcon);
        loadCustomIcon(); // 立即尝试加载
        
        // 双击展开窗口
        miniIcon.addEventListener('dblclick', () => {
          ipcRenderer.send('expand-window');
        });
        
        // 拖拽功能
        miniIcon.addEventListener('mousedown', (e) => {
          isDragging = true;
          dragOffset.x = e.offsetX;
          dragOffset.y = e.offsetY;
          e.preventDefault();
        });
        
        document.addEventListener('mousemove', (e) => {
          if (isDragging) {
            const newX = e.screenX - dragOffset.x;
            const newY = e.screenY - dragOffset.y;
            ipcRenderer.send('mini-drag-move', { x: newX, y: newY });
          }
        });
        
        document.addEventListener('mouseup', () => {
          if (isDragging) {
            isDragging = false;
            ipcRenderer.send('mini-drag-end');
          }
        });
      </script>
    </body>
    </html>
  `;

  miniWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(miniHtml));

  // 设置小图标窗口位置到屏幕右侧中央
  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
  miniWindow.setPosition(screenWidth - miniSize.width, (screenHeight - miniSize.height) / 2);

  // **** 移除 miniWindow.hide(); 这一行 ****
  // miniWindow.hide(); // 初始时隐藏，不再在这里直接隐藏
}

// 收拢窗口
async function collapseWindow() { // 保持异步
  if (isCollapsed) return; // 如果已经收拢，则不做任何操作
  
  isCollapsed = true;
  
  // 记录主窗口当前位置
  lastMainWindowPosition = mainWindow.getPosition();
  
  // 预创建后，这里不再需要判断和创建，直接使用 miniWindow
  // if (!miniWindow || miniWindow.isDestroyed()) {
  //   console.log("Mini window doesn't exist or is destroyed. Creating now.");
  //   createMiniWindow(); // 预创建后，这里不需要再调用
  //   await new Promise(resolve => { /* 也不需要等待 did-finish-load */ });
  // }

  // 确保 miniWindow 存在并且没有被销毁
  if (!miniWindow || miniWindow.isDestroyed()) {
      // 理论上预创建后这里不应该执行，但作为安全检查
      console.error('Error: miniWindow not created or destroyed unexpectedly!');
      return; 
  }

  // 将小图标窗口设置到主窗口附近
  const [mainX, mainY] = lastMainWindowPosition;
  miniWindow.setPosition(mainX + initialSize.width + 10, mainY + 50); // 在主窗口右侧稍微偏移
  
  // 先显示小图标窗口，再隐藏主窗口，并引入短暂延迟
  miniWindow.show();
  
  // 引入一个微小延迟，给 miniWindow 足够的渲染时间
  await new Promise(resolve => setTimeout(resolve, 50)); // 50毫秒的延迟

  mainWindow.hide();
  
  console.log('Window collapsed');
}

// 展开窗口
function expandWindow() {
  if (!isCollapsed) return;
  
  isCollapsed = false;
  
  // 获取小图标当前位置，并将主窗口设置到附近
  if (miniWindow && !miniWindow.isDestroyed()) {
    const [miniX, miniY] = miniWindow.getPosition();
    
    // 计算主窗口应该显示的位置（小图标左侧）
    let newMainX = miniX - initialSize.width - 10;
    let newMainY = miniY - 50;
    
    // 确保主窗口不会超出屏幕边界
    const { screen } = require('electron');
    const displays = screen.getAllDisplays();
    
    // 找到小图标所在的显示器
    let targetDisplay = null;
    for (const display of displays) {
      const { x: displayX, y: displayY, width: displayWidth, height: displayHeight } = display.bounds;
      if (miniX >= displayX && miniX < displayX + displayWidth &&
          miniY >= displayY && miniY < displayY + displayHeight) {
        targetDisplay = display;
        break;
      }
    }
    
    if (targetDisplay) {
      const { x: displayX, y: displayY, width: displayWidth, height: displayHeight } = targetDisplay.bounds;
      
      // 约束主窗口位置在显示器范围内
      newMainX = Math.max(displayX, Math.min(displayX + displayWidth - initialSize.width, newMainX));
      newMainY = Math.max(displayY, Math.min(displayY + displayHeight - initialSize.height, newMainY));
    }
    
    // 设置主窗口位置
    mainWindow.setPosition(newMainX, newMainY);
    
    // 隐藏小图标窗口
    miniWindow.hide();
  }
  
  // 显示主窗口
  mainWindow.show();
  
  console.log('Window expanded at mini icon position');
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
    if (process.platform === 'win32') {
      const { exec } = require('child_process');
      exec(`taskkill /pid ${inferenceProcess.pid} /f /t`, (err) => {
        if (err) {
          console.error('Failed to kill inference process:', err);
        } else {
          console.log('Inference service killed with taskkill.');
        }
      });
    } else {
      inferenceProcess.kill('SIGTERM');
    }
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
  // **** 在应用启动时预先创建小图标窗口 ****
  createMiniWindow(); 
  // 初始时将小窗口隐藏，因为默认应该显示主窗口
  if (miniWindow && !miniWindow.isDestroyed()) {
      miniWindow.hide(); 
  }

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

// 在主进程中添加这个函数（main.js 中）
// 添加 IPC 处理器来获取图片的 base64 数据
ipcMain.handle('get-mini-icon-base64', async () => {
  const possiblePaths = [
    path.join(__dirname, 'src', '02.jpg')
  ];
  
  for (const imagePath of possiblePaths) {
    try {
      if (fs.existsSync(imagePath)) {
        console.log('找到图片文件:', imagePath);
        const imageBuffer = fs.readFileSync(imagePath);
        const extension = path.extname(imagePath).toLowerCase();
        let mimeType = 'image/png';
        
        if (extension === '.jpg' || extension === '.jpeg') {
          mimeType = 'image/jpeg';
        } else if (extension === '.png') {
          mimeType = 'image/png';
        } else if (extension === '.gif') {
          mimeType = 'image/gif';
        }
        
        const base64 = imageBuffer.toString('base64');
        return `data:${mimeType};base64,${base64}`;
      }
    } catch (error) {
      console.error('读取图片文件时出错:', imagePath, error);
    }
  }
  
  return null; // 没有找到图片
});