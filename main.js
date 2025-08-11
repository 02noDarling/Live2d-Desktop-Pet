const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');

let mainWindow;
let miniWindow; // 小图标窗口
let inferenceProcess;
let generateProcess;
const initialSize = { width: 600, height: 750 }; // 增加宽度以容纳会话列表
const miniSize = { width: 45, height: 45 }; // 小图标大小 - 缩小尺寸
let isCollapsed = false; // 收拢状态
let lastMainWindowPosition = null; // 记录主窗口最后位置

// 聊天历史管理
const chatHistoryDir = path.join(__dirname, 'chat_history');

// 确保聊天历史目录存在
function ensureChatHistoryDir() {
  if (!fs.existsSync(chatHistoryDir)) {
    fs.mkdirSync(chatHistoryDir, { recursive: true });
  }
}

// 生成新的会话ID
function generateSessionId() {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// 获取所有会话
function getAllSessions() {
  ensureChatHistoryDir();
  const files = fs.readdirSync(chatHistoryDir).filter(file => file.endsWith('.jsonl'));
  return files.map(file => {
    const sessionId = file.replace('.jsonl', '');
    const filePath = path.join(chatHistoryDir, file);
    const stats = fs.statSync(filePath);
    
    // 读取第一条消息作为会话名称
    let sessionName = sessionId;
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.trim().split('\n').filter(line => line.trim());
      if (lines.length > 0) {
        const firstMessage = JSON.parse(lines[0]);
        if (firstMessage.role === 'user') {
          sessionName = firstMessage.content.substring(0, 20) + (firstMessage.content.length > 20 ? '...' : '');
        }
      }
    } catch (error) {
      console.error('Error reading session file:', error);
    }
    
    return {
      id: sessionId,
      name: sessionName,
      createdAt: stats.birthtime,
      modifiedAt: stats.mtime
    };
  }).sort((a, b) => b.modifiedAt - a.modifiedAt);
}

// 获取会话历史
function getSessionHistory(sessionId) {
  const filePath = path.join(chatHistoryDir, `${sessionId}.jsonl`);
  if (!fs.existsSync(filePath)) {
    return [];
  }
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.trim().split('\n').filter(line => line.trim());
    return lines.map(line => JSON.parse(line));
  } catch (error) {
    console.error('Error reading session history:', error);
    return [];
  }
}

// 添加消息到会话历史
function addMessageToSession(sessionId, role, content) {
  ensureChatHistoryDir();
  const filePath = path.join(chatHistoryDir, `${sessionId}.jsonl`);
  const message = {
    role,
    content,
    timestamp: new Date().toISOString()
  };
  
  try {
    fs.appendFileSync(filePath, JSON.stringify(message) + '\n', 'utf8');
  } catch (error) {
    console.error('Error writing to session file:', error);
  }
}

// 删除会话
function deleteSession(sessionId) {
  const filePath = path.join(chatHistoryDir, `${sessionId}.jsonl`);
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
  } catch (error) {
    console.error('Error deleting session:', error);
  }
  return false;
}

function createWindow() {
  // Start inference service
  // startInferenceService();
  // startGenerateService()

  // 创建无边框、透明的窗口 - 增加宽度以容纳会话列表
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
  mainWindow.setMinimumSize(400, 350); // 增加最小宽度

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
      mainWindow.setSize(Math.max(400, newWidth), Math.max(350, newHeight));
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

  // 会话管理相关的 IPC 处理器
  ipcMain.handle('get-all-sessions', () => {
    return getAllSessions();
  });

  ipcMain.handle('create-new-session', () => {
    const sessionId = generateSessionId();
    
    // 立即创建空的会话文件，确保文件存在
    ensureChatHistoryDir();
    const filePath = path.join(chatHistoryDir, `${sessionId}.jsonl`);
    try {
      fs.writeFileSync(filePath, '', 'utf8'); // 创建空文件
    } catch (error) {
      console.error('Error creating session file:', error);
    }
    
    return { 
      id: sessionId, 
      name: `新对话 ${new Date().toLocaleString()}`, 
      createdAt: new Date(), 
      modifiedAt: new Date() 
    };
  });

  ipcMain.handle('get-session-history', (event, sessionId) => {
    return getSessionHistory(sessionId);
  });

  ipcMain.handle('delete-session', (event, sessionId) => {
    return deleteSession(sessionId);
  });

  // 处理聊天消息的修复版本
  ipcMain.handle('send-chat-message', async (event, { message, sessionId, enableVoice = true }) => {
    console.log('Received chat message:', message, 'for session:', sessionId, 'voice enabled:', enableVoice);
    
    // 添加用户消息到历史
    addMessageToSession(sessionId, 'user', message);
    
    try {
      const pythonPath = process.platform === 'win32'
        ? path.join(__dirname, '.venv', 'Scripts', 'python.exe')
        : path.join(__dirname, '.venv', 'bin', 'python');
      const scriptPath = path.join(__dirname, 'chat_handler.py');
      
      console.log('Calling Python script:', pythonPath, scriptPath);
      
      // 获取会话历史
      const history = getSessionHistory(sessionId);
      
      // 检查数据大小，决定使用参数还是文件传输
      const historyJson = JSON.stringify(history);
      const totalLength = message.length + historyJson.length;
      
      let pythonProcess;
      let tempFilePath = null;
      
      if (totalLength > 2000 || process.platform === 'win32') {
        // 使用文件传输方式（Windows默认使用此方式）
        console.log('Using file transfer method due to data size:', totalLength);
        
        // 创建临时文件
        tempFilePath = path.join(os.tmpdir(), `chat_input_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.json`);
        
        const inputData = {
          message: message,
          history: history,
          enableVoice: enableVoice  // 添加语音控制参数
        };
        
        // 写入临时文件
        fs.writeFileSync(tempFilePath, JSON.stringify(inputData, null, 2), 'utf8');
        
        // Windows特殊处理：设置环境变量确保UTF-8编码
        const env = { ...process.env };
        if (process.platform === 'win32') {
          env.PYTHONIOENCODING = 'utf-8';
          env.PYTHONLEGACYWINDOWSSTDIO = '1';
        }
        
        pythonProcess = spawn(pythonPath, [scriptPath, `file:${tempFilePath}`], {
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: process.platform === 'win32',
          env: env,
          encoding: 'utf8'
        });
      } else {
        // 使用参数传输方式（非Windows且数据较小时）
        console.log('Using argument method');
        
        const env = { ...process.env };
        env.PYTHONIOENCODING = 'utf-8';
        
        // 为参数模式添加语音控制参数
        pythonProcess = spawn(pythonPath, [scriptPath, message, historyJson, enableVoice.toString()], {
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: process.platform === 'win32',
          env: env,
          encoding: 'utf8'
        });
      }
      
      return new Promise((resolve, reject) => {
        let result = '';
        let errorOutput = '';
        
        // 设置超时
        const timeout = setTimeout(() => {
          pythonProcess.kill();
          // 清理临时文件
          if (tempFilePath && fs.existsSync(tempFilePath)) {
            try {
              fs.unlinkSync(tempFilePath);
            } catch (e) {
              console.error('Failed to cleanup temp file:', e);
            }
          }
          reject(new Error('Python script timeout'));
        }, 60000);
        
        // 处理stdout - 明确设置编码
        pythonProcess.stdout.setEncoding('utf8');
        pythonProcess.stdout.on('data', (data) => {
          result += data.toString();
        });
        
        // 处理stderr - 明确设置编码
        pythonProcess.stderr.setEncoding('utf8');
        pythonProcess.stderr.on('data', (data) => {
          errorOutput += data.toString();
          console.error('Python stderr:', data.toString());
        });
        
        pythonProcess.on('close', (code) => {
          clearTimeout(timeout);
          
          // 清理临时文件
          if (tempFilePath && fs.existsSync(tempFilePath)) {
            try {
              fs.unlinkSync(tempFilePath);
            } catch (e) {
              console.error('Failed to cleanup temp file:', e);
            }
          }
          
          console.log('Python process closed with code:', code);
          console.log('Python output length:', result.length);
          if (errorOutput) {
            console.log('Python error output:', errorOutput);
          }
          
          if (code === 0 && result.trim()) {
            const response = result.trim();
            // 验证响应是否包含正常字符
            if (response && !response.includes('锟斤拷')) {
              // 添加助手回复到历史
              addMessageToSession(sessionId, 'assistant', response);
              resolve(response);
            } else {
              console.log('Python output contains encoding errors, using fallback');
              const fallbackResponse = getFallbackResponse(message);
              addMessageToSession(sessionId, 'assistant', fallbackResponse);
              resolve(fallbackResponse);
            }
          } else {
            // 如果Python脚本失败，返回备用回复
            console.log('Python script failed, using fallback response');
            const fallbackResponse = getFallbackResponse(message);
            addMessageToSession(sessionId, 'assistant', fallbackResponse);
            resolve(fallbackResponse);
          }
        });
        
        pythonProcess.on('error', (error) => {
          clearTimeout(timeout);
          
          // 清理临时文件
          if (tempFilePath && fs.existsSync(tempFilePath)) {
            try {
              fs.unlinkSync(tempFilePath);
            } catch (e) {
              console.error('Failed to cleanup temp file:', e);
            }
          }
          
          console.error('Python process error:', error);
          // 如果无法启动Python，使用备用回复
          const fallbackResponse = getFallbackResponse(message);
          addMessageToSession(sessionId, 'assistant', fallbackResponse);
          resolve(fallbackResponse);
        });
      });
    } catch (error) {
      console.error('Failed to call Python script:', error);
      const fallbackResponse = getFallbackResponse(message);
      addMessageToSession(sessionId, 'assistant', fallbackResponse);
      return fallbackResponse;
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
    },
    skipTaskbar: true,
    show: false
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
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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
          display: none;
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
        let hasMoved = false;
        
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
        
        document.addEventListener('DOMContentLoaded', loadCustomIcon);
        loadCustomIcon();
        
        // 单击展开窗口
        miniIcon.addEventListener('click', (e) => {
          console.log('Click event triggered, hasMoved:', hasMoved);
          if (!hasMoved) {
            console.log('Sending expand-window event');
            ipcRenderer.send('expand-window');
          }
        });
        
        // 拖拽功能
        miniIcon.addEventListener('mousedown', (e) => {
          isDragging = true;
          hasMoved = false;
          dragOffset.x = e.offsetX;
          dragOffset.y = e.offsetY;
          console.log('Mousedown event, starting drag');
          e.preventDefault();
        });
        
        document.addEventListener('mousemove', (e) => {
          if (isDragging) {
            hasMoved = true;
            const newX = e.screenX - dragOffset.x;
            const newY = e.screenY - dragOffset.y;
            console.log('Dragging to:', newX, newY);
            ipcRenderer.send('mini-drag-move', { x: newX, y: newY });
          }
        });
        
        document.addEventListener('mouseup', () => {
          if (isDragging) {
            isDragging = false;
            console.log('Mouseup event, drag ended, hasMoved:', hasMoved);
            ipcRenderer.send('mini-drag-end');
          }
        });
      </script>
    </body>
    </html>
  `;

  // 加载 HTML 内容
  miniWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(miniHtml));

  // 确保窗口在内容加载完成后保持隐藏
  miniWindow.webContents.on('did-finish-load', () => {
    if (!isCollapsed) {
      miniWindow.hide();
      console.log('Mini window created and hidden');
    }
  });

  // 设置小图标窗口位置到屏幕右侧中央（仅在需要显示时设置）
  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
  miniWindow.setPosition(screenWidth - miniSize.width, (screenHeight - miniSize.height) / 2);
}

// 收拢窗口
async function collapseWindow() {
  if (isCollapsed) return;
  
  isCollapsed = true;
  
  // 记录主窗口当前位置
  lastMainWindowPosition = mainWindow.getPosition();
  
  // 确保 miniWindow 存在
  if (!miniWindow || miniWindow.isDestroyed()) {
    console.error('Error: miniWindow not created or destroyed unexpectedly! Recreating.');
    createMiniWindow();
    await new Promise(resolve => {
      miniWindow.webContents.once('did-finish-load', () => {
        console.log("Recreated mini window content loaded.");
        resolve();
      });
    });
  }

  // 获取所有显示器信息
  const { screen } = require('electron');
  const displays = screen.getAllDisplays();
  
  // 根据 mainWindow 位置找到它所在的显示器
  const [mainX, mainY] = lastMainWindowPosition;
  const targetDisplay = screen.getDisplayNearestPoint({ x: mainX, y: mainY });
  const { x: displayX, y: displayY, width: displayWidth, height: displayHeight } = targetDisplay.bounds;

  // 计算小图标窗口的新位置，基于 mainWindow 所在屏幕
  let targetMiniX = mainX + initialSize.width + 10;
  let targetMiniY = mainY + 50;

  // 边界检查，约束到 mainWindow 所在的显示器范围内
  if (targetMiniX + miniSize.width > displayX + displayWidth) {
    targetMiniX = displayX + displayWidth - miniSize.width - 10;
  }
  if (targetMiniY + miniSize.height > displayY + displayHeight) {
    targetMiniY = displayY + displayHeight - miniSize.height - 10;
  }
  if (targetMiniX < displayX) {
    targetMiniX = displayX + 10;
  }
  if (targetMiniY < displayY) {
    targetMiniY = displayY + 10;
  }

  // 设置位置并显示小图标窗口
  miniWindow.setPosition(targetMiniX, targetMiniY);
  miniWindow.show();
  
  // 延迟隐藏主窗口，确保小图标窗口显示后再隐藏主窗口
  await new Promise(resolve => setTimeout(resolve, 150));
  mainWindow.hide();
  
  console.log('Window collapsed, miniWindow positioned at:', targetMiniX, targetMiniY, 'on display:', targetDisplay.id);
}

// 展开窗口
function expandWindow() {
  if (!isCollapsed) return;
  
  isCollapsed = false;
  
  if (miniWindow && !miniWindow.isDestroyed()) {
    const [miniX, miniY] = miniWindow.getPosition();
    
    let newMainX = miniX - initialSize.width - 10;
    let newMainY = miniY - 50;
    
    const { screen } = require('electron');
    const displays = screen.getAllDisplays();
    
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
      newMainX = Math.max(displayX, Math.min(displayX + displayWidth - initialSize.width, newMainX));
      newMainY = Math.max(displayY, Math.min(displayY + displayHeight - initialSize.height, newMainY));
    }
    
    mainWindow.setPosition(newMainX, newMainY);
    miniWindow.hide();
  }
  
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

async function startGenerateService() {
  const pythonPath = process.platform === 'win32'
    ? path.join(__dirname, '.venv', 'Scripts', 'python.exe')
    : path.join(__dirname, '.venv', 'bin', 'python');
  const scriptPath = path.join(__dirname, 'generate_voice_service.py');

  console.log('Starting generate service:', pythonPath, scriptPath);

  generateProcess  = spawn(pythonPath, [scriptPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: process.platform === 'win32'
  });

  generateProcess.stdout.on('data', (data) => {
    console.log('Inference service stdout:', data.toString());
  });

  generateProcess.stderr.on('data', (data) => {
    console.error('Inference service stderr:', data.toString());
  });

  generateProcess.on('close', (code) => {
    console.log('Inference service closed with code:', code);
  });

  generateProcess.on('error', (error) => {
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

function stopGenerateService() {
  if (generateProcess) {
    console.log('Stopping generate service...');
    if (process.platform === 'win32') {
      const { exec } = require('child_process');
      exec(`taskkill /pid ${generateProcess.pid} /f /t`, (err) => {
        if (err) {
          console.error('Failed to kill generate process:', err);
        } else {
          console.log('generate service killed with taskkill.');
        }
      });
    } else {
      generateProcess.kill('SIGTERM');
    }
    generateProcess = null;
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

// 在 app.whenReady() 中确保初始状态
app.whenReady().then(() => {
  // 确保聊天历史目录存在
  ensureChatHistoryDir();
  
  createWindow();
  createMiniWindow(); // 创建小图标窗口
  
  // 确保 miniWindow 初始隐藏
  if (miniWindow && !miniWindow.isDestroyed()) {
    miniWindow.hide();
    console.log('Mini window initialized and hidden');
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  stopInferenceService();
  startGenerateService()
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopInferenceService();
  stopGenerateService()
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